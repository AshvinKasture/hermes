using System.Diagnostics;
using System.Text;
using System.Text.Json;

namespace FiddleApi.Services;

/// <summary>
/// Manages a single active netcoredbg debug session (phase 2 scope: one concurrent session,
/// matching single-user usage - no per-user session isolation yet).
///
/// Protocol with the browser: the frontend sends/receives plain DAP JSON objects as WebSocket
/// text frames. This service is the only place that knows about DAP's wire format, which is
/// Content-Length-framed JSON over stdio (same framing as LSP) - it adds that framing when
/// writing to netcoredbg's stdin and strips it when reading from stdout, so the browser-side
/// DAP client only ever deals with parsed JSON.
/// </summary>
public class DebugSessionService : IAsyncDisposable
{
    private const int CompileTimeoutMs = 15_000;
    private static readonly string Scratch = Environment.GetEnvironmentVariable("RUN_SCRATCH_DIR") ?? "/tmp/fiddle-runs";
    private static readonly string TemplateDir = Environment.GetEnvironmentVariable("RUN_TEMPLATE_DIR") ?? "/app/run-template";
    private static readonly string NetCoreDbgPath = Environment.GetEnvironmentVariable("NETCOREDBG_PATH") ?? "/opt/netcoredbg-dist/netcoredbg/netcoredbg";

    private readonly SemaphoreSlim _lock = new(1, 1);
    private Process? _process;
    private string? _sessionDir;

    public string? ProgramSourcePath => _sessionDir is null ? null : Path.Combine(_sessionDir, "Program.cs");

    /// <summary>
    /// Compiles the given source in Debug configuration (needed for usable PDBs/breakpoints,
    /// unlike the Release-only fire-and-forget compiler flow) and starts netcoredbg against it.
    /// Kills any previous session first - only one debug session is supported at a time.
    /// </summary>
    public async Task<(bool Success, string? Error)> StartAsync(string source, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            await KillCurrentAsync();

            Directory.CreateDirectory(Scratch);
            var sessionId = Guid.NewGuid().ToString("N");
            var dir = Path.Combine(Scratch, "debug-" + sessionId);
            CopyTemplate(TemplateDir, dir);
            await File.WriteAllTextAsync(Path.Combine(dir, "Program.cs"), source, ct);

            var buildPsi = new ProcessStartInfo
            {
                FileName = "dotnet",
                Arguments = "build -c Debug --no-restore -o bin",
                WorkingDirectory = dir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            buildPsi.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
            buildPsi.Environment["DOTNET_NOLOGO"] = "1";

            using var buildProcess = Process.Start(buildPsi)!;
            var buildOut = await buildProcess.StandardOutput.ReadToEndAsync(ct);
            var buildErr = await buildProcess.StandardError.ReadToEndAsync(ct);
            using var buildTimeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            buildTimeoutCts.CancelAfter(CompileTimeoutMs);
            try
            {
                await buildProcess.WaitForExitAsync(buildTimeoutCts.Token);
            }
            catch (OperationCanceledException)
            {
                try { buildProcess.Kill(entireProcessTree: true); } catch { /* best effort */ }
                return (false, "Compilation timed out.");
            }

            if (buildProcess.ExitCode != 0)
            {
                return (false, string.IsNullOrWhiteSpace(buildErr) ? buildOut : buildErr);
            }

            var dllPath = Path.Combine(dir, "bin", "run.dll");
            if (!File.Exists(dllPath))
            {
                return (false, "Build succeeded but output assembly was not found.");
            }

            var dbgPsi = new ProcessStartInfo
            {
                FileName = NetCoreDbgPath,
                Arguments = "--interpreter=vscode",
                WorkingDirectory = dir,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };
            _process = Process.Start(dbgPsi);
            _sessionDir = dir;
            return (true, null);
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>Starts the background readers that forward netcoredbg's framed stdout/stderr to the given callbacks.</summary>
    public void AttachReaders(Func<JsonElement, Task> onMessage, Action<string> onStderr, CancellationToken ct)
    {
        var process = _process ?? throw new InvalidOperationException("No active debug session.");
        _ = Task.Run(() => ReadFramedMessages(process.StandardOutput.BaseStream, onMessage, ct), ct);
        _ = Task.Run(async () =>
        {
            try
            {
                string? line;
                while ((line = await process.StandardError.ReadLineAsync(ct)) != null)
                    onStderr(line);
            }
            catch { /* process exited */ }
        }, ct);
    }

    public async Task SendAsync(JsonElement message, CancellationToken ct)
    {
        var process = _process ?? throw new InvalidOperationException("No active debug session.");
        var json = JsonSerializer.Serialize(message);
        var bytes = Encoding.UTF8.GetBytes(json);
        var header = Encoding.ASCII.GetBytes($"Content-Length: {bytes.Length}\r\n\r\n");
        await process.StandardInput.BaseStream.WriteAsync(header, ct);
        await process.StandardInput.BaseStream.WriteAsync(bytes, ct);
        await process.StandardInput.BaseStream.FlushAsync(ct);
    }

    private static async Task ReadFramedMessages(Stream stream, Func<JsonElement, Task> onMessage, CancellationToken ct)
    {
        var headerBuf = new List<byte>();
        var oneByte = new byte[1];
        try
        {
            while (!ct.IsCancellationRequested)
            {
                headerBuf.Clear();
                int matchedCrlfCrlf = 0;
                while (true)
                {
                    int read = await stream.ReadAsync(oneByte, ct);
                    if (read == 0) return; // stream closed
                    headerBuf.Add(oneByte[0]);
                    matchedCrlfCrlf = headerBuf.Count >= 4 &&
                        headerBuf[^4] == '\r' && headerBuf[^3] == '\n' && headerBuf[^2] == '\r' && headerBuf[^1] == '\n'
                        ? 1 : 0;
                    if (matchedCrlfCrlf == 1) break;
                }

                var header = Encoding.ASCII.GetString(headerBuf.ToArray());
                int length = 0;
                foreach (var line in header.Split("\r\n", StringSplitOptions.RemoveEmptyEntries))
                {
                    var idx = line.IndexOf(':');
                    if (idx > 0 && line[..idx].Trim().Equals("Content-Length", StringComparison.OrdinalIgnoreCase))
                        length = int.Parse(line[(idx + 1)..].Trim());
                }

                if (length <= 0) continue;

                var bodyBuf = new byte[length];
                int offset = 0;
                while (offset < length)
                {
                    int read = await stream.ReadAsync(bodyBuf.AsMemory(offset, length - offset), ct);
                    if (read == 0) return;
                    offset += read;
                }

                using var doc = JsonDocument.Parse(bodyBuf);
                await onMessage(doc.RootElement.Clone());
            }
        }
        catch (OperationCanceledException) { /* shutting down */ }
        catch (ObjectDisposedException) { /* process/stream disposed */ }
    }

    public async Task StopAsync()
    {
        await _lock.WaitAsync();
        try
        {
            await KillCurrentAsync();
        }
        finally
        {
            _lock.Release();
        }
    }

    private Task KillCurrentAsync()
    {
        if (_process != null)
        {
            try { if (!_process.HasExited) _process.Kill(entireProcessTree: true); } catch { /* best effort */ }
            _process.Dispose();
            _process = null;
        }
        if (_sessionDir != null)
        {
            try { Directory.Delete(_sessionDir, recursive: true); } catch { /* best effort cleanup */ }
            _sessionDir = null;
        }
        return Task.CompletedTask;
    }

    private static void CopyTemplate(string sourceDir, string destDir)
    {
        Directory.CreateDirectory(destDir);
        foreach (var dirPath in Directory.GetDirectories(sourceDir, "*", SearchOption.AllDirectories))
        {
            var name = Path.GetFileName(dirPath);
            if (name is "bin" or "obj") continue;
            if (dirPath.Contains($"{Path.DirectorySeparatorChar}bin{Path.DirectorySeparatorChar}") ||
                dirPath.Contains($"{Path.DirectorySeparatorChar}obj{Path.DirectorySeparatorChar}")) continue;
            Directory.CreateDirectory(dirPath.Replace(sourceDir, destDir));
        }
        foreach (var filePath in Directory.GetFiles(sourceDir, "*", SearchOption.AllDirectories))
        {
            var relative = Path.GetRelativePath(sourceDir, filePath);
            var topDir = relative.Split(Path.DirectorySeparatorChar)[0];
            if (topDir is "bin" or "obj") continue;
            File.Copy(filePath, filePath.Replace(sourceDir, destDir), overwrite: true);
        }
        var srcObj = Path.Combine(sourceDir, "obj");
        var destObj = Path.Combine(destDir, "obj");
        if (Directory.Exists(srcObj))
        {
            Directory.CreateDirectory(destObj);
            foreach (var f in Directory.GetFiles(srcObj))
                File.Copy(f, Path.Combine(destObj, Path.GetFileName(f)), overwrite: true);
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync();
    }
}
