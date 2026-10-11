using System.Security.Claims;
using FiddleApi.Services;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

var allowedEmail = Environment.GetEnvironmentVariable("ALLOWED_EMAIL") ?? "";
var googleClientId = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_ID") ?? "";
var googleClientSecret = Environment.GetEnvironmentVariable("GOOGLE_CLIENT_SECRET") ?? "";
var frontendDist = Environment.GetEnvironmentVariable("FRONTEND_DIST") ?? "/app/frontend/dist";

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddSingleton<CodeRunnerService>();

builder.Services.AddAuthentication(options =>
{
    options.DefaultScheme = CookieAuthenticationDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = GoogleDefaults.AuthenticationScheme;
})
.AddCookie(options =>
{
    options.Cookie.Name = "fiddle.auth";
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
    options.ExpireTimeSpan = TimeSpan.FromDays(7);
    options.SlidingExpiration = true;
    options.Events.OnRedirectToLogin = context =>
    {
        context.Response.StatusCode = 401;
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToAccessDenied = context =>
    {
        context.Response.StatusCode = 403;
        return Task.CompletedTask;
    };
})
.AddGoogle(options =>
{
    options.ClientId = googleClientId;
    options.ClientSecret = googleClientSecret;
    options.CallbackPath = "/fiddle/api/auth/google/callback";
    options.Events.OnTicketReceived = context =>
    {
        var email = context.Principal?.FindFirstValue(ClaimTypes.Email) ?? "";
        if (!string.Equals(email, allowedEmail, StringComparison.OrdinalIgnoreCase))
        {
            context.Fail("Email not allowed");
        }
        return Task.CompletedTask;
    };
});

builder.Services.AddAuthorization();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Caddy on the host connects via docker's published port, so the request arrives from the
// docker bridge gateway IP, not literal loopback - the default KnownNetworks/KnownProxies
// allow-list (loopback-only) would otherwise silently drop X-Forwarded-Proto. This container
// only ever sits behind our own Caddy on this VPS, so trusting all sources here is fine.
var forwardedOptions = new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
};
forwardedOptions.KnownNetworks.Clear();
forwardedOptions.KnownProxies.Clear();
app.UseForwardedHeaders(forwardedOptions);

// Serve built frontend assets BEFORE routing/endpoint matching: UseRouting's EndpointRoutingMiddleware
// matches the request to an endpoint (including our catch-all MapFallback) up front; the static-files
// middleware then sees "already matched" and skips itself. So static files must run before UseRouting.
var frontendFileProvider = Directory.Exists(frontendDist)
    ? new Microsoft.Extensions.FileProviders.PhysicalFileProvider(frontendDist)
    : null;

if (frontendFileProvider != null)
{
    app.UseDefaultFiles(new DefaultFilesOptions
    {
        FileProvider = frontendFileProvider,
        RequestPath = "/fiddle"
    });
    app.UseStaticFiles(new StaticFileOptions
    {
        FileProvider = frontendFileProvider,
        RequestPath = "/fiddle"
    });
}

app.UseRouting();

app.UseAuthentication();
app.UseAuthorization();

app.UseEndpoints(endpoints =>
{
    endpoints.MapControllers();

    endpoints.MapGet("/fiddle/api/auth/login", () => Results.Challenge(
        new Microsoft.AspNetCore.Authentication.AuthenticationProperties { RedirectUri = "/fiddle" },
        new[] { GoogleDefaults.AuthenticationScheme }));

    endpoints.MapPost("/fiddle/api/auth/logout", async context =>
    {
        await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        context.Response.StatusCode = 200;
    });

    endpoints.MapGet("/fiddle/api/auth/me", (HttpContext context) =>
    {
        if (context.User.Identity?.IsAuthenticated != true)
            return Results.Json(new { authenticated = false });
        var email = context.User.FindFirstValue(ClaimTypes.Email);
        var name = context.User.FindFirstValue(ClaimTypes.Name);
        return Results.Json(new { authenticated = true, email, name });
    });

    if (frontendFileProvider != null)
    {
        endpoints.MapFallback("/fiddle/{**slug}", async context =>
        {
            if (context.User.Identity?.IsAuthenticated != true)
            {
                await context.ChallengeAsync(GoogleDefaults.AuthenticationScheme,
                    new Microsoft.AspNetCore.Authentication.AuthenticationProperties { RedirectUri = context.Request.Path });
                return;
            }
            context.Response.ContentType = "text/html";
            var indexFile = frontendFileProvider.GetFileInfo("index.html");
            if (indexFile.Exists)
            {
                await using var stream = indexFile.CreateReadStream();
                await stream.CopyToAsync(context.Response.Body);
            }
        });
    }
});

app.Run();
