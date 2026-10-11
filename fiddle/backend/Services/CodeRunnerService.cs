using System.Diagnostics;
using System.Text;

namespace FiddleApi.Services;

public record RunResult(bool Success, string Output, string? Error, long ElapsedMs, bool TimedOut);

/// <summary>
/// Compiles and runs a standalone C# console program submitted by the user.
/// Phase 1: process-level isolation only (temp working dir, timeout, output cap, no network at the
/// container level). Each run shells out to `dotnet run` against a scratch project so the user's code
/// behaves like a real console app (Console.ReadLine not supported yet - no stdin wiring in phase 1).
/// </summary>
public class CodeRunnerService
{
    private const int TimeoutMs = 10_000;
    private const int MaxOutputChars = 50_000;
    private static readonly string Scratch = Environment.GetEnvironmentVariable("RUN_SCRATCH_DIR") ?? "/tmp/fiddle-runs";
    // A pre-restored/pre-built template project (see Dockerfile) so each run only needs an
    // incremental `dotnet build --no-restore`, not a full NuGet restore.
    private static readonly string TemplateDir = Environment.GetEnvironmentVariable("RUN_TEMPLATE_DIR") ?? "/app/run-template";

    public async Task<RunResult> RunAsync(string source, CancellationToken ct)
    {
        Directory.CreateDirectory(Scratch);
        var runId = Guid.NewGuid().ToString("N");
        var dir = Path.Combine(Scratch, runId);
        CopyDirectory(TemplateDir, dir);

        try
        {
            await File.WriteAllTextAsync(Path.Combine(dir, "Program.cs"), source, ct);

            var sw = Stopwatch.StartNew();
            var psi = new ProcessStartInfo
            {
                FileName = "dotnet",
                Arguments = "run --configuration Release --no-restore",
                WorkingDirectory = dir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };
            // Disable telemetry / multi-level lookup noise, keep runs hermetic.
            psi.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
            psi.Environment["DOTNET_NOLOGO"] = "1";

            using var process = new Process { StartInfo = psi, EnableRaisingEvents = true };
            var stdout = new StringBuilder();
            var stderr = new StringBuilder();

            process.OutputDataReceived += (_, e) => { if (e.Data != null) stdout.AppendLine(e.Data); };
            process.ErrorDataReceived += (_, e) => { if (e.Data != null) stderr.AppendLine(e.Data); };

            process.Start();
            process.StandardInput.Close(); // no stdin support in phase 1
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();

            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(TimeoutMs);
            bool timedOut = false;
            try
            {
                await process.WaitForExitAsync(timeoutCts.Token);
            }
            catch (OperationCanceledException)
            {
                timedOut = true;
                try { process.Kill(entireProcessTree: true); } catch { /* best effort */ }
            }

            sw.Stop();

            var outText = Truncate(stdout.ToString());
            var errText = Truncate(stderr.ToString());

            return new RunResult(
                Success: !timedOut && process.ExitCode == 0,
                Output: outText,
                Error: timedOut ? "Execution timed out after 10 seconds." : (string.IsNullOrWhiteSpace(errText) ? null : errText),
                ElapsedMs: sw.ElapsedMilliseconds,
                TimedOut: timedOut
            );
        }
        finally
        {
            try { Directory.Delete(dir, recursive: true); } catch { /* best effort cleanup */ }
        }
    }

    private static string Truncate(string text) =>
        text.Length > MaxOutputChars ? text[..MaxOutputChars] + "\n... (truncated)" : text;

    private static void CopyDirectory(string sourceDir, string destDir)
    {
        Directory.CreateDirectory(destDir);
        foreach (var dirPath in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
            Directory.CreateDirectory(dirPath.Replace(sourceDir, destDir));
        foreach (var filePath in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
            File.Copy(filePath, filePath.Replace(sourceDir, destDir), overwrite: true);
    }
}
