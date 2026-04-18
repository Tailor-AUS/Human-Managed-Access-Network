# @hman/bridge-relay-listener

.NET 9 console app that makes your local .HMAN bridge reachable through
Azure Relay Hybrid Connections — no inbound ports opened on your home
network, no static IP required, no router configuration.

## How it works

```
Browser → Azure Relay edge (bridge.tailor.au)
            │  over E2E TLS, authenticated
            ▼
          HybridConnectionListener (this process, on your desktop)
            │  proxies the HTTP request
            ▼
          http://127.0.0.1:8765 (the Python FastAPI bridge)
```

The listener uses an outbound-only connection. If your desktop is offline,
the Relay endpoint returns its own 502; when you come back online the
listener reconnects automatically.

## Build

```powershell
cd packages/bridge-relay-listener
dotnet publish -c Release -r win-x64 --self-contained false
```

Single-file exe will land in `bin/Release/net9.0/win-x64/publish/hman-bridge-relay.exe`.

Other runtime IDs supported: `linux-x64`, `osx-arm64`. See `.csproj`.

## Run

Four environment variables are required. Get them once from your Bicep
deployment outputs, then export before running:

| Variable | What | Where to get it |
|---|---|---|
| `HMAN_RELAY_NAMESPACE` | Relay namespace FQDN | Bicep output `relayNamespace` + `.servicebus.windows.net` |
| `HMAN_RELAY_PATH` | Hybrid Connection path | Bicep output `relayHybridConnection` |
| `HMAN_RELAY_KEYNAME` | Auth rule name | `listener` (default) |
| `HMAN_RELAY_KEY` | Shared access key | `az relay hyco authorization-rule keys list …` |
| `HMAN_LOCAL_BRIDGE_URL` | Local bridge URL | Defaults to `http://127.0.0.1:8765` |

```powershell
$env:HMAN_RELAY_NAMESPACE = 'rly-hman-xxxx.servicebus.windows.net'
$env:HMAN_RELAY_PATH = 'member-bridge'
$env:HMAN_RELAY_KEYNAME = 'listener'
$env:HMAN_RELAY_KEY = '<your-shared-access-key>'

./hman-bridge-relay.exe
```

The `ops/start-bridge.ps1` script (in the repo root) reads these values
from the Bicep deployment outputs automatically and starts the listener
alongside the Python bridge. Running this directly is for debugging.

## Auto-start on Windows

Register as a Task Scheduler job via `ops/install-windows-service.ps1 -Tunnel azure`.

## License

MIT, same as the rest of the platform. See repo root.
