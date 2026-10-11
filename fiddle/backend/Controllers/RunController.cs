using FiddleApi.Services;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace FiddleApi.Controllers;

public record RunRequest(string Code);

[ApiController]
[Route("fiddle/api")]
[Authorize(AuthenticationSchemes = CookieAuthenticationDefaults.AuthenticationScheme)]
public class RunController : ControllerBase
{
    private readonly CodeRunnerService _runner;

    public RunController(CodeRunnerService runner)
    {
        _runner = runner;
    }

    [HttpPost("run")]
    public async Task<IActionResult> Run([FromBody] RunRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Code))
            return BadRequest(new { error = "Code is required." });

        if (request.Code.Length > 50_000)
            return BadRequest(new { error = "Code too large (max 50,000 characters)." });

        var result = await _runner.RunAsync(request.Code, ct);
        return Ok(new
        {
            success = result.Success,
            output = result.Output,
            error = result.Error,
            elapsedMs = result.ElapsedMs,
            timedOut = result.TimedOut,
        });
    }
}
