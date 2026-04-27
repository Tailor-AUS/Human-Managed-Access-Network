# .HMAN Production Deployment

Two supported paths:

- **[Azure (primary)](#azure-primary)** — Static Web Apps + Azure Relay + Bicep IaC. Same region, same tenant, same monitoring as Tailor. One `pwsh` command spins up the whole stack.
- **[Cloudflare (community)](#cloudflare-community)** — Cloudflare Pages + Cloudflare Tunnel. Zero-dollar path for contributors who don't have an Azure tenant.

Both paths produce the same architecture:

```
  phone / desktop / any device
          │
          ▼
  https://hman.<your-domain>              ← static frontend (SWA or Pages)
          │
          │ Authorization: Bearer <HMAN_AUTH_TOKEN>
          ▼
  https://bridge.<your-domain>            ← reverse tunnel into your home
          │
          ▼
  127.0.0.1:8765 (Python FastAPI bridge)  ← auto-started on login
          │
          ▼
  your RTX 4090 — local LLM, STT, TTS, voice biometrics
```

Model weights, audio, and the voice embedding never leave your device.

---

## Azure (primary)

### What gets provisioned

Everything is described in `infra/main.bicep` and its modules.

| Resource | SKU | Purpose |
|---|---|---|
| Static Web App | Free | `hman.example.com` frontend, auto-HTTPS, CDN |
| Relay namespace + Hybrid Connection | Standard | `bridge.example.com` tunnel to your desktop |
| Key Vault | Standard, RBAC | Bearer token storage |
| Application Insights + Log Analytics | PerGB2018, 30-day retention | Observability |
| Azure DNS zone (optional) | — | Records for your custom domain |

Estimated cost: **~$10 AUD/month** in `australiaeast`, dominated by the Relay namespace base fee (~$9.50/mo). Everything else is free tier or usage-based cents.

### Prerequisites

- Azure subscription (you have `TAILOR` on `australiaeast`)
- You signed in with `az login` already
- A domain you control (e.g. `example.com`). DNS zone can live in Azure DNS or elsewhere — both work.
- Node 20+, Python 3.11+, .NET 9 SDK, `az` CLI with the Bicep extension, `pnpm`

Optional tooling:
- SWA CLI: `npm install -g @azure/static-web-apps-cli`
- PowerShell 7 (comes with Windows 11)

### One command

```powershell
pwsh -File ops/azure-deploy.ps1 `
  -ResourceGroup rg-hman-prod `
  -WebDomain hman.example.com `
  -BridgeDomain bridge.example.com `
  -DnsZone example.com
```

That script does the full end-to-end:

1. `az login` check
2. Creates `rg-hman-prod` in `australiaeast`
3. Runs `infra/main.bicep` — SWA, Relay, Key Vault, App Insights, DNS records
4. Generates a 48-char `HMAN_AUTH_TOKEN`, stores it as secret `HMAN-AUTH-TOKEN` in the Key Vault
5. Fetches the Relay listener key, writes `~/.hman/bridge.env` with everything the local bridge needs
6. Builds the web-dashboard with `VITE_HMAN_BRIDGE=https://bridge.example.com`
7. Deploys `dist/` to Static Web Apps via `swa deploy`

If your DNS zone is outside Azure, pass `-CreateDnsZone:$false` (default) and manually add these records at your registrar after the deploy prints them:

```
hman       CNAME  <swa-default-hostname>.azurestaticapps.net
bridge     CNAME  <your-relay-namespace>.servicebus.windows.net
```

### Run the local side

The **recommended** path on Windows installs the bridge + Azure Relay listener as real Windows services using a vendored copy of [NSSM](https://nssm.cc/) (Non-Sucking Service Manager, public domain — see `ops/nssm/LICENSE-NSSM.txt`). NSSM-wrapped services live in `services.msc`, auto-start before login, restart on failure, and survive accidental window closure / log-out / lock — fixing the silent-death failure mode of the older Task Scheduler approach (#19).

Bootstrap once (run in **Admin** PowerShell — service install requires elevation):

```powershell
# 1. Build the relay listener if you haven't already
cd packages/bridge-relay-listener
dotnet publish -c Release -r win-x64 --self-contained false
cd ../..

# 2. Make sure the Python venv is bootstrapped
cd packages/python-bridge
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
cd ../..

# 3. Install the services (current user, azure tunnel)
pwsh -File ops/install-windows-service.ps1 -Tunnel azure -Password (Read-Host -AsSecureString -Prompt 'Windows password')
```

This registers two NSSM-wrapped services that start at boot:

| Service | Wraps | Notes |
|---|---|---|
| `HMAN-Bridge` | `.venv\Scripts\python.exe api/server.py` | depends on `bthserv` so EEG works post-reboot |
| `HMAN-Relay` | `bin/Release/net9.0/win-x64/publish/hman-bridge-relay.exe` | only installed when `-Tunnel azure` |

Both services:
- run under the **member's user account** (NOT LocalSystem) so they can read `~/.hman/`, the encrypted voice reference, and use BLE / microphone APIs
- auto-restart on failure with a 10s throttle
- log stdout/stderr to `~/.hman/logs/<svc>.service.{log,err}`, rotated at 50 MB

The script is idempotent — running it again reconfigures in place rather than failing.

First launch reads `~/.hman/bridge.env` (populated by the deploy script) for the Relay creds and the `HMAN_AUTH_TOKEN`. The token is also printed once so you can paste it into the web dashboard when it prompts.

To remove both services:

```powershell
pwsh -File ops/uninstall-windows-service.ps1
```

#### Dev / one-shot mode (no service install)

If you just want to run the bridge in the foreground for a single session — e.g. while iterating on a sensor — `ops/start-bridge.ps1 -Tunnel azure` still works and does not require admin. Both processes die when their console windows close, which is exactly the failure mode the service install exists to avoid, so don't use this for production.

### First visit

1. Open `https://hman.example.com/app` on any device
2. TokenGate asks for your bearer token — paste it
3. Go to Onboarding → read 10 prompts to enrol your voice
4. Go to Gates → Arm Gate 5 with your enrolment passphrase
5. Talk

### Observability

- **Live logs**: `az webapp log tail --name stapp-hman-prod --resource-group rg-hman-prod` (SWA logs)
- **Relay traffic**: Azure portal → your Relay namespace → Metrics → `Messages`
- **Bridge local**: `Get-Content ~/.hman/logs/gate_events.jsonl -Tail 50 -Wait`
- **App Insights**: portal → `appi-hman-prod` → Live Metrics. Wire client-side telemetry by pasting the instrumentation key into `.env.production` as `VITE_APP_INSIGHTS_CONNECTION_STRING`.

### Secret rotation

```powershell
# Generate new token + update Key Vault
$newToken = -join ((1..48) | % { '{0:x}' -f (Get-Random -Maximum 16) })
az keyvault secret set --vault-name kv-hman-<suffix> --name 'HMAN-AUTH-TOKEN' --value $newToken

# Update local bridge.env then restart the services
Restart-Service -Name 'HMAN-Bridge', 'HMAN-Relay'
# edit ~/.hman/bridge.env → HMAN_AUTH_TOKEN=<newToken>  before the restart, or restart again after

# Members paste the new token in the web UI (they're prompted automatically on next 401)
```

### Tearing it down

```powershell
az group delete --name rg-hman-prod --yes --no-wait
```

---

## Cloudflare (community)

For contributors without an Azure tenant. Free, fast to set up, but metadata flows through Cloudflare. See the **"Why Cloudflare vs. Azure"** section at the bottom.

### Prerequisites

- Domain on Cloudflare (Cloudflare Tunnel and Pages both need the zone hosted there)
- `cloudflared` installed (`winget install Cloudflare.cloudflared`)
- Node 20+, Python 3.11+, pnpm

### Steps

```powershell
# 1. Platform build
pnpm install
pnpm -r build
cd packages/python-bridge
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
cd ../..

# 2. Create the Cloudflare Tunnel
cloudflared login
cloudflared tunnel create hman-bridge
cloudflared tunnel route dns hman-bridge bridge.example.com
# Copy ops/cloudflared.example.yml to ~/.cloudflared/config.yml and fill in the UUID + credentials path.

# 3. Deploy the web dashboard to Cloudflare Pages
cd apps/web-dashboard
copy .env.production.example .env.production    # edit → VITE_HMAN_BRIDGE=https://bridge.example.com
npx wrangler login
npx wrangler pages project create hman --production-branch main
npm run deploy:cloudflare

# 4. Register the Windows services (Admin PowerShell)
#    Note: -Tunnel cloudflare is not yet wrapped as a service — for now,
#    install the bridge as a service and run cloudflared separately
#    (winget install Cloudflare.cloudflared installs cloudflared as a
#    service of its own). Or stay on dev mode:
pwsh -File ops/install-windows-service.ps1 -Tunnel none -Password (Read-Host -AsSecureString -Prompt 'Windows password')
# then in a separate terminal:
cloudflared tunnel run hman-bridge
```

In the Cloudflare dashboard, add `hman.example.com` as a custom domain on the Pages project.

---

## Runtime URLs (either path)

| What | URL | Hosted on |
|---|---|---|
| Public front door | `https://hman.example.com` | Cloudflare Pages or Azure Static Web Apps |
| Member app | `https://hman.example.com/app` | same as front door |
| Bridge API | `https://bridge.example.com` | Cloudflare Tunnel or Azure Relay → your desktop |
| Local bridge | `http://127.0.0.1:8765` | Your desktop only |
| OpenAPI docs | `https://bridge.example.com/docs` | Your desktop (behind token) |

---

## Security posture

- **Bridge auth**: every `/api/*` request requires `Authorization: Bearer <HMAN_AUTH_TOKEN>`. Token is 48 hex chars, generated by the deploy script, stored in Azure Key Vault (Azure path) or `~/.hman/bridge.env` (Cloudflare path).
- **CORS**: bridge allows the origins listed in `HMAN_ALLOWED_ORIGINS` (comma-separated). Both deploy scripts set this to your web domain.
- **Transport**:
  - *Azure path*: Azure Relay uses TLS end-to-end from the browser through Azure's edge to the listener on your desktop. Azure sees message metadata but Azure Relay is designed not to persist payloads.
  - *Cloudflare path*: Cloudflare terminates TLS at the edge, re-encrypts to your tunnel. Metadata + (briefly) decrypted payloads are visible to Cloudflare.
- **Voice reference at rest**: Fernet (AES-128-CBC + HMAC-SHA256) with PBKDF2-SHA256 600 000 iterations. Passphrase is the key. No recovery.
- **Decrypted reference**: lives **only in bridge process memory**. Process restart clears it. Member re-arms per session.
- **Audit log**: append-only, hash-chained. `~/.hman/logs/gate_events.jsonl`.
- **No inbound ports opened** on your home network in either path.

## APNs auth key (issue #17 — push channel)

The bridge dispatches receptivity-gate consent prompts to the registered
iPhone via APNs HTTP/2. To do that it needs three Apple-issued
credentials and the `.p8` auth key file.

### What you need from Apple Developer

1. An **APNs Auth Key (.p8)** generated under Certificates, Identifiers
   & Profiles → Keys. Note the 10-char `Key ID` shown next to the key.
2. Your **Team ID** (10 chars, top-right of the Apple Developer portal).
3. The app **Bundle ID** (`ai.hman.app` by default — match
   `apps/ios/Package.swift` / your provisioning profile).

### Where the key lives

| Environment | Path / store | Read by |
|---|---|---|
| Local dev | `~/.hman/secrets/apns_auth_key.p8` (file mode `0600`) | `api/push.py` via `HMAN_APNS_AUTH_KEY_PATH` |
| Azure prod | Key Vault secret `APNS-AUTH-KEY` (PEM-encoded) → mounted as a file via Azure App Service Key Vault references, OR fetched at startup by the bridge entrypoint into a `tmpfs` path | `api/push.py` via `HMAN_APNS_AUTH_KEY_PATH` pointing at the mounted/fetched file |
| Cloudflare prod | Same on-disk file, deployed alongside `bridge.env` (the home machine never publishes it) | `api/push.py` via `HMAN_APNS_AUTH_KEY_PATH` |

### Environment variables consumed by `api/push.py`

| Variable | Purpose | Default |
|---|---|---|
| `HMAN_APNS_AUTH_KEY_PATH` | Path to the `.p8` file | `~/.hman/secrets/apns_auth_key.p8` |
| `HMAN_APNS_KEY_ID` | 10-char Key ID from the Apple Developer portal | _(required)_ |
| `HMAN_APNS_TEAM_ID` | 10-char Team ID | _(required)_ |
| `HMAN_APNS_BUNDLE_ID` | App bundle identifier | `ai.hman.app` |
| `HMAN_APNS_SANDBOX` | `1` to use the sandbox APNs endpoint (TestFlight / dev builds) | `0` |
| `HMAN_PUSH_TOKEN_PATH` | Where to persist registered device tokens | `~/.hman/vault/push_tokens.json` |

### Rotation

Apple-issued APNs auth keys don't expire, but rotate annually as a
hygiene practice:

```powershell
# Generate a new key in the Apple Developer portal, download the .p8
# Move the new file into ~/.hman/secrets/, then update the key-id env:
$env:HMAN_APNS_KEY_ID = '<new-10-char-id>'
# Restart the bridge — Get-ScheduledTask 'HMAN-Bridge' | Restart-…
```

### What never leaves the bridge

- The `.p8` auth key file (read-only, never logged, never returned in
  any API response)
- Full intention payloads (the iOS app fetches them after the user
  taps; only `intention_id` + a short summary travel through APNs)
- Bearer tokens (APNs payloads carry application data only)

## Why Azure vs. Cloudflare

**Azure** is a good fit when:
- You already have an Azure tenant and want one procurement/monitoring story
- You need data residency in a specific Azure region
- You want end-to-end TLS — Azure Relay doesn't terminate and re-encrypt; your desktop's cert is preserved through the hop
- You plan to graduate from bearer tokens to Entra ID for member auth

**Cloudflare** is usually easier when:
- No Azure subscription required
- Free tier is more generous for hobby use
- Cloudflare Tunnel gives a public HTTPS URL in ~2 minutes

Pick based on your threat model and existing infrastructure. Both paths are maintained.

---

## Sensor auto-start

The bridge auto-starts every available sensor on boot — no need to call `POST /api/sensors/start_all` after a restart. The startup hook spawns a background thread so `uvicorn` is ready immediately; sensors come online a few seconds later as Whisper / BLE / etc. finish initialising.

Per-sensor opt-out (env wins over YAML; default is `on`):

```powershell
# PowerShell — set before launching the bridge
$env:HMAN_SENSOR_EEG = 'off'        # disable EEG (e.g. Muse not handy)
$env:HMAN_SENSOR_AUDIO = 'on'       # explicit on (same as default)
$env:HMAN_SENSOR_KEYSTROKES = 'off'
$env:HMAN_SENSOR_SCREEN = 'on'
```

```bash
# bash — same idea
export HMAN_SENSOR_EEG=off
```

Or, equivalently, drop a YAML file at `~/.hman/sensors.yaml` (uses `HMAN_DATA_DIR` if set):

```yaml
sensors:
  audio: on
  eeg: off          # disabled until Muse is fixed
  keystrokes: on
  screen: on
```

Truthy values: `on`, `true`, `yes`, `1`, `enabled`. Falsy: `off`, `false`, `no`, `0`, `disabled`. Anything else is treated as "no opinion" and falls through to the next layer (env > yaml > default).

Boot logs make the decision visible:

```
[sensor:audio] auto-started
[sensor:keystrokes] auto-started
[sensor:eeg] auto-start disabled by config (env)
[sensor:screen] not available, skipping auto-start
```

If a sensor fails to start (e.g. Muse can't be found, mic device disappeared) the bridge keeps running — the failure is recorded in that sensor's `last_error` and surfaced in the Subconscious dashboard. The existing manual `/api/sensors/{name}/start` and `/api/sensors/start_all` endpoints still work for runtime toggling.

---

## What's not yet prod-ready

Flagging honestly:

- **No Cloudflare Access / Entra ID at the ingress** — the bearer token is the only barrier to the bridge API. Real enterprise prod would gate the whole `bridge.*` hostname behind email OTP or SSO.
- **No automated integration tests in CI** — CI builds everything but doesn't actually spin up a bridge and exercise it.
- **No Windows installer .msi** — deployment is git-clone + scripts. Fine for early adopters and developers.
- **No native mobile app** — the PWA works, but for true AirPods-era UX (head-motion wake, lock-screen controls, proper background audio) we need a native iOS/Android app.
- **Secret rotation is manual** — should be a scheduled Azure Function or GitHub Action that rotates `HMAN_AUTH_TOKEN` on a cadence.
- **Bridge restart loses armed state** — Gate 5 must be re-armed every time the bridge restarts. Intentional for security; inconvenient. Replace with OS keychain (Windows Credential Manager) when we're ready for consumer-grade UX.
- **Relay Standard tier minimum is ~$9.50/mo** — pricing-floor for the Azure path. If you want pay-per-use only, Cloudflare Tunnel is free.
