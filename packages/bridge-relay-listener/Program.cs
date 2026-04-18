// .HMAN bridge relay listener.
//
// Sits on the member's home desktop. Connects outbound to Azure Relay
// Hybrid Connection (bridge.tailor.au behind the scenes). When a request
// arrives through the Relay, proxies it to http://127.0.0.1:8765 (the
// local FastAPI bridge) and streams the response back.
//
// Zero inbound ports opened on the home network. Traffic is E2E TLS
// between the member's browser and this process via Azure Relay edge.
//
// Config (env vars):
//   HMAN_RELAY_NAMESPACE   e.g. rly-hman-xyzabc.servicebus.windows.net
//   HMAN_RELAY_PATH        the Hybrid Connection name, e.g. member-bridge
//   HMAN_RELAY_KEYNAME     usually "listener"
//   HMAN_RELAY_KEY         the shared-access key (from Azure portal or az CLI)
//   HMAN_LOCAL_BRIDGE_URL  defaults to http://127.0.0.1:8765

using System.Text;
using Microsoft.Azure.Relay;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

var builder = Host.CreateApplicationBuilder(args);
builder.Configuration.AddEnvironmentVariables();
builder.Configuration.AddCommandLine(args);

var cfg = builder.Configuration;
var host = builder.Build();
var loggerFactory = host.Services.GetRequiredService<ILoggerFactory>();
var log = loggerFactory.CreateLogger("RelayListener");

string Required(string key) =>
    cfg[key] ?? throw new InvalidOperationException($"Missing config value: {key}");

var ns = Required("HMAN_RELAY_NAMESPACE");
var path = Required("HMAN_RELAY_PATH");
var keyName = cfg["HMAN_RELAY_KEYNAME"] ?? "listener";
var key = Required("HMAN_RELAY_KEY");
var localBridge = new Uri(cfg["HMAN_LOCAL_BRIDGE_URL"] ?? "http://127.0.0.1:8765");

// Azure Relay preserves the hybrid-connection-name prefix in the URL it
// forwards to the listener. We strip "/<path>" before proxying so the
// local bridge sees the same URLs clients would use calling it directly.
var relayPrefix = "/" + path.Trim('/');

var tokenProvider = TokenProvider.CreateSharedAccessSignatureTokenProvider(keyName, key);
var listener = new HybridConnectionListener(new Uri($"sb://{ns}/{path}"), tokenProvider);

using var httpClient = new HttpClient
{
    BaseAddress = localBridge,
    Timeout = TimeSpan.FromSeconds(120),
};

listener.RequestHandler = async ctx =>
{
    var started = DateTimeOffset.UtcNow;
    string? target = null;
    try
    {
        var req = ctx.Request;
        target = req.Url.PathAndQuery;
        var method = req.HttpMethod ?? "GET";

        // Strip the hybrid-connection prefix ("/member-bridge") so the
        // local FastAPI sees clean /api/* paths.
        var forwardTarget = target;
        if (forwardTarget.StartsWith(relayPrefix, StringComparison.Ordinal))
        {
            forwardTarget = forwardTarget.Substring(relayPrefix.Length);
            if (forwardTarget.Length == 0 || forwardTarget[0] != '/') forwardTarget = "/" + forwardTarget;
        }

        // Build a matching request to the local FastAPI bridge
        using var proxied = new HttpRequestMessage(new HttpMethod(method), forwardTarget);

        // Copy request headers, skipping ones HttpClient controls for us
        foreach (var headerName in req.Headers.AllKeys.OfType<string>())
        {
            var values = req.Headers.GetValues(headerName);
            if (values is null) continue;
            if (IsContentHeader(headerName)) continue;
            if (IsRestrictedHeader(headerName)) continue;
            proxied.Headers.TryAddWithoutValidation(headerName, values);
        }

        // Stream the body (if any)
        if (method is not ("GET" or "HEAD") && req.HasEntityBody)
        {
            var buffer = new MemoryStream();
            await req.InputStream.CopyToAsync(buffer);
            buffer.Position = 0;
            proxied.Content = new StreamContent(buffer);
            foreach (var headerName in req.Headers.AllKeys.OfType<string>())
            {
                if (!IsContentHeader(headerName)) continue;
                var values = req.Headers.GetValues(headerName);
                if (values is null) continue;
                proxied.Content.Headers.TryAddWithoutValidation(headerName, values);
            }
        }

        using var upstream = await httpClient.SendAsync(
            proxied, HttpCompletionOption.ResponseHeadersRead);

        var resp = ctx.Response;
        resp.StatusCode = (System.Net.HttpStatusCode)(int)upstream.StatusCode;
        resp.StatusDescription = upstream.ReasonPhrase ?? string.Empty;

        foreach (var h in upstream.Headers)
            foreach (var v in h.Value) resp.Headers.Add(h.Key, v);
        foreach (var h in upstream.Content.Headers)
            foreach (var v in h.Value) resp.Headers.Add(h.Key, v);

        await using var outStream = resp.OutputStream;
        await upstream.Content.CopyToAsync(outStream);

        var ms = (int)(DateTimeOffset.UtcNow - started).TotalMilliseconds;
        log.LogInformation("→ {Status} {Method} {Target} ({Ms}ms)",
            (int)upstream.StatusCode, method, target, ms);
    }
    catch (HttpRequestException ex)
    {
        log.LogWarning(ex, "Local bridge unreachable for {Target}", target ?? "(unknown)");
        try
        {
            ctx.Response.StatusCode = System.Net.HttpStatusCode.BadGateway;
            var msg = Encoding.UTF8.GetBytes(
                "{\"detail\":\"local bridge unreachable\"}");
            ctx.Response.Headers["Content-Type"] = "application/json";
            await ctx.Response.OutputStream.WriteAsync(msg);
        }
        catch { /* best effort */ }
    }
    finally
    {
        try { await ctx.Response.CloseAsync(); } catch { /* ignore */ }
    }
};

listener.Connecting += (_, _) =>
    log.LogInformation("Connecting to Relay {Ns}/{Path}…", ns, path);
listener.Online += (_, _) =>
    log.LogInformation("Online. Bridge is reachable through the Relay.");
listener.Offline += (_, e) =>
    log.LogWarning("Offline: {Reason}", e?.ToString() ?? "no reason");

await listener.OpenAsync();
log.LogInformation("Proxying → {LocalBridge}. Ctrl-C to stop.", localBridge);

using var cts = new CancellationTokenSource();
Console.CancelKeyPress += (_, e) =>
{
    e.Cancel = true;
    cts.Cancel();
};
try
{
    await Task.Delay(Timeout.Infinite, cts.Token);
}
catch (OperationCanceledException)
{
    log.LogInformation("Shutting down…");
}
finally
{
    await listener.CloseAsync();
}

static bool IsContentHeader(string name) =>
    name.Equals("Content-Type", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Content-Length", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Content-Encoding", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Content-Language", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Content-Location", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Content-MD5", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Content-Range", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Expires", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Last-Modified", StringComparison.OrdinalIgnoreCase);

static bool IsRestrictedHeader(string name) =>
    name.Equals("Host", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Connection", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Keep-Alive", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Transfer-Encoding", StringComparison.OrdinalIgnoreCase) ||
    name.Equals("Upgrade", StringComparison.OrdinalIgnoreCase);
