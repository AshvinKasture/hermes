using System.Net.WebSockets;
using System.Text;
using System.Text.Json;
using FiddleApi.Services;

namespace FiddleApi;

public static class DebugWebSocketHandler
{
    public static async Task HandleAsync(HttpContext context, DebugSessionService debugService)
    {
        if (!context.WebSockets.IsWebSocketRequest)
        {
            context.Response.StatusCode = 400;
            return;
        }

        using var socket = await context.WebSockets.AcceptWebSocketAsync();
        var cts = CancellationTokenSource.CreateLinkedTokenSource(context.RequestAborted);

        // "program" and "source path" are server-chosen per session; the frontend never needs to
        // know the scratch directory layout, so we patch launch/setBreakpoints arguments here.
        string? programPath = null;
        string? sourcePath = null;

        async Task SendToClient(JsonElement msg)
        {
            if (socket.State != WebSocketState.Open) return;
            var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(msg));
            try
            {
                await socket.SendAsync(bytes, WebSocketMessageType.Text, true, cts.Token);
            }
            catch { /* socket closing */ }
        }

        try
        {
            var buffer = new byte[64 * 1024];
            while (socket.State == WebSocketState.Open && !cts.IsCancellationRequested)
            {
                var result = await ReceiveFullMessageAsync(socket, buffer, cts.Token);
                if (result is null) break; // closed

                using var doc = JsonDocument.Parse(result);
                var root = doc.RootElement;
                var kind = root.TryGetProperty("kind", out var kindProp) ? kindProp.GetString() : null;

                if (kind == "start")
                {
                    // { kind: "start", code: "..." } - compile in Debug config and launch netcoredbg.
                    var code = root.GetProperty("code").GetString() ?? "";
                    var (success, error) = await debugService.StartAsync(code, cts.Token);
                    if (!success)
                    {
                        await SendToClient(JsonSerializer.SerializeToElement(new { kind = "compileError", error }));
                        continue;
                    }

                    sourcePath = debugService.ProgramSourcePath;
                    programPath = sourcePath is null ? null : Path.Combine(Path.GetDirectoryName(sourcePath)!, "bin", "run.dll");

                    debugService.AttachReaders(
                        onMessage: async msg => await SendToClient(msg),
                        onStderr: line => _ = SendToClient(JsonSerializer.SerializeToElement(new { kind = "debuggerLog", line })),
                        ct: cts.Token);

                    await SendToClient(JsonSerializer.SerializeToElement(new { kind = "started", sourcePath }));
                    continue;
                }

                if (kind == "dap")
                {
                    // { kind: "dap", message: {...} } - a raw DAP request from the client. Patch in
                    // server-known paths for the two commands that need them.
                    var message = root.GetProperty("message");
                    var command = message.TryGetProperty("command", out var c) ? c.GetString() : null;

                    if (command == "launch" && programPath != null)
                    {
                        message = PatchLaunchArguments(message, programPath, Path.GetDirectoryName(programPath)!);
                    }
                    else if (command == "setBreakpoints" && sourcePath != null)
                    {
                        message = PatchBreakpointSourcePath(message, sourcePath);
                    }

                    await debugService.SendAsync(message, cts.Token);
                    continue;
                }

                if (kind == "stop")
                {
                    await debugService.StopAsync();
                    await SendToClient(JsonSerializer.SerializeToElement(new { kind = "stopped" }));
                }
            }
        }
        catch (WebSocketException)
        {
            // client disconnected abruptly
        }
        finally
        {
            cts.Cancel();
            await debugService.StopAsync();
            if (socket.State == WebSocketState.Open)
            {
                try { await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "done", CancellationToken.None); }
                catch { /* best effort */ }
            }
        }
    }

    private static async Task<byte[]?> ReceiveFullMessageAsync(WebSocket socket, byte[] buffer, CancellationToken ct)
    {
        using var ms = new MemoryStream();
        while (true)
        {
            WebSocketReceiveResult result;
            try
            {
                result = await socket.ReceiveAsync(buffer, ct);
            }
            catch (OperationCanceledException)
            {
                return null;
            }

            if (result.MessageType == WebSocketMessageType.Close) return null;
            ms.Write(buffer, 0, result.Count);
            if (result.EndOfMessage) return ms.ToArray();
        }
    }

    private static JsonElement PatchLaunchArguments(JsonElement message, string programPath, string cwd)
    {
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(message));
        var dict = JsonNodeFromElement(doc.RootElement);
        if (dict["arguments"] is System.Text.Json.Nodes.JsonObject argsObj)
        {
            argsObj["program"] = programPath;
            argsObj["cwd"] = cwd;
        }
        return JsonSerializer.SerializeToElement(dict);
    }

    private static JsonElement PatchBreakpointSourcePath(JsonElement message, string sourcePath)
    {
        using var doc = JsonDocument.Parse(JsonSerializer.Serialize(message));
        var dict = JsonNodeFromElement(doc.RootElement);
        if (dict["arguments"] is System.Text.Json.Nodes.JsonObject argsObj &&
            argsObj["source"] is System.Text.Json.Nodes.JsonObject sourceObj)
        {
            sourceObj["path"] = sourcePath;
        }
        return JsonSerializer.SerializeToElement(dict);
    }

    private static System.Text.Json.Nodes.JsonObject JsonNodeFromElement(JsonElement element) =>
        (System.Text.Json.Nodes.JsonObject)System.Text.Json.Nodes.JsonNode.Parse(element.GetRawText())!;
}
