using FiddleApi.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FiddleApi.Controllers;

public record SaveProgramRequest(string Name, string Code);

[ApiController]
[Route("fiddle/api/programs")]
[Authorize(AuthenticationSchemes = CookieAuthenticationDefaults.AuthenticationScheme)]
public class SavedProgramsController : ControllerBase
{
    private readonly SavedProgramsService _programs;

    public SavedProgramsController(SavedProgramsService programs)
    {
        _programs = programs;
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        var programs = await _programs.ListAsync();
        return Ok(programs.Select(p => new { name = p.Name, updatedAt = p.UpdatedAt }));
    }

    [HttpGet("{name}")]
    public async Task<IActionResult> Get(string name)
    {
        var decoded = Uri.UnescapeDataString(name);
        var program = await _programs.GetAsync(decoded);
        if (program == null) return NotFound(new { error = "Program not found." });
        return Ok(new { name = program.Name, code = program.Code, updatedAt = program.UpdatedAt });
    }

    [HttpPost]
    public async Task<IActionResult> Save([FromBody] SaveProgramRequest request)
    {
        var name = request.Name?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(name))
            return BadRequest(new { error = "Program name is required." });
        if (name.Length > 100)
            return BadRequest(new { error = "Program name too long (max 100 characters)." });
        if (request.Code.Length > 50_000)
            return BadRequest(new { error = "Code too large (max 50,000 characters)." });

        try
        {
            await _programs.SaveAsync(name, request.Code);
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }

        return Ok(new { name });
    }

    [HttpDelete("{name}")]
    public async Task<IActionResult> Delete(string name)
    {
        var decoded = Uri.UnescapeDataString(name);
        var deleted = await _programs.DeleteAsync(decoded);
        if (!deleted) return NotFound(new { error = "Program not found." });
        return Ok(new { deleted = true });
    }
}
