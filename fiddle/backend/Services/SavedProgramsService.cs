using System.Text.Json;

namespace FiddleApi.Services;

public record SavedProgramSummary(string Name, DateTime UpdatedAt);
public record SavedProgram(string Name, string Code, DateTime UpdatedAt);

/// <summary>
/// Single-user file-based storage for saved programs. One JSON file per program under
/// SAVED_PROGRAMS_DIR (backed by a durable named Docker volume, unlike the tmpfs scratch dirs
/// used for compiling/debugging). No per-user scoping yet - matches the current single
/// allowlisted-email auth model; revisit if multi-user support is added later.
/// </summary>
public class SavedProgramsService
{
    private static readonly string StorageDir = Environment.GetEnvironmentVariable("SAVED_PROGRAMS_DIR") ?? "/data/saved-programs";
    private readonly SemaphoreSlim _lock = new(1, 1);

    public SavedProgramsService()
    {
        Directory.CreateDirectory(StorageDir);
    }

    public async Task<List<SavedProgramSummary>> ListAsync()
    {
        await _lock.WaitAsync();
        try
        {
            var result = new List<SavedProgramSummary>();
            foreach (var path in Directory.GetFiles(StorageDir, "*.json"))
            {
                try
                {
                    var json = await File.ReadAllTextAsync(path);
                    var program = JsonSerializer.Deserialize<SavedProgram>(json);
                    if (program != null) result.Add(new SavedProgramSummary(program.Name, program.UpdatedAt));
                }
                catch
                {
                    // skip unreadable/corrupt entries rather than failing the whole list
                }
            }
            return result.OrderByDescending(p => p.UpdatedAt).ToList();
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<SavedProgram?> GetAsync(string name)
    {
        var path = PathFor(name);
        if (!File.Exists(path)) return null;
        await _lock.WaitAsync();
        try
        {
            var json = await File.ReadAllTextAsync(path);
            return JsonSerializer.Deserialize<SavedProgram>(json);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task SaveAsync(string name, string code)
    {
        var program = new SavedProgram(name, code, DateTime.UtcNow);
        var json = JsonSerializer.Serialize(program);
        await _lock.WaitAsync();
        try
        {
            await File.WriteAllTextAsync(PathFor(name), json);
        }
        finally
        {
            _lock.Release();
        }
    }

    public async Task<bool> DeleteAsync(string name)
    {
        await _lock.WaitAsync();
        try
        {
            var path = PathFor(name);
            if (!File.Exists(path)) return false;
            File.Delete(path);
            return true;
        }
        finally
        {
            _lock.Release();
        }
    }

    /// <summary>Maps a program name to a safe on-disk path, rejecting path traversal / invalid names.</summary>
    private static string PathFor(string name)
    {
        if (string.IsNullOrWhiteSpace(name) || name.Length > 200)
            throw new ArgumentException("Invalid program name.");
        foreach (var c in Path.GetInvalidFileNameChars())
        {
            if (name.Contains(c)) throw new ArgumentException("Invalid program name.");
        }
        if (name.Contains("..")) throw new ArgumentException("Invalid program name.");

        // Use a hash-free direct filename (sanitized) so filenames stay human-inspectable on disk.
        return Path.Combine(StorageDir, name + ".json");
    }
}
