# .HMAN Production Deployment

This is the prod-ready stack:

```
  Phone / desktop / any device
          │
          ▼
  https://hman.tailor.au           ← Cloudflare Pages (static, always-on)
          │
          │ Bearer-token
          ▼
  https://bridge.tailor.au         ← Cloudflare Tunnel
          │
          ▼
  127.0.0.1:8765 (FastAPI)         ← auto-started Windows task
          │
          ▼
  Your RTX 4090 at home — LLM, STT, TTS, voice biometrics
```

Two things stay at home: your hardware and your data. Everything else is Cloudflare edge — free tier handles it.

---

## One-time setup

### 1. Install runtime dependencies

```powershell
# Python 3.11+
winget install Python.Python.3.12

# Node 18+
winget install OpenJS.NodeJS.LTS

# pnpm
npm install -g pnpm

# cloudflared (Cloudflare Tunnel daemon)
curl -L -o "$env:USERPROFILE\bin\cloudflared.exe" `
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
```

### 2. Build the platform

```powershell
git clone https://github.com/Tailor-AUS/Human-Managed-Access-Network
cd Human-Managed-Access-Network
pnpm install
pnpm -r build

# Python bridge venv
cd packages/python-bridge
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
cd ../..
```

### 3. Put your domain on Cloudflare

Only do this once per domain. Cloudflare Tunnel + Pages both require the domain's DNS to be on Cloudflare.

- Go to Cloudflare → **Add a Site** → enter `tailor.au`.
- Follow the prompts to update nameservers at your registrar (currently `ns1/2/3.nameserver.net.au`).
- Wait ~5 minutes for propagation.

### 4. Create the tunnel

```powershell
cloudflared login                              # opens browser, picks your zone
cloudflared tunnel create hman-bridge          # creates the tunnel + credentials JSON
```

Copy `ops/cloudflared.example.yml` to `~/.cloudflared/config.yml`, paste your tunnel UUID and the credentials-file path, then bind the hostname:

```powershell
cloudflared tunnel route dns hman-bridge bridge.tailor.au
```

Sanity-check it runs:

```powershell
cloudflared tunnel run hman-bridge
# In another window:
Invoke-WebRequest https://bridge.tailor.au/api/health   # expect 401 (auth required, bridge not up yet — that's fine)
```

### 5. Deploy the web dashboard to Cloudflare Pages

```powershell
cd apps/web-dashboard

# Point the production build at your bridge
Copy-Item .env.production.example .env.production
# edit .env.production → VITE_HMAN_BRIDGE=https://bridge.tailor.au

# First-time Pages project creation
npx wrangler login
npx wrangler pages project create hman --production-branch main

# Ship it
npm run deploy
```

In the Cloudflare dashboard (Pages → hman → Custom domains), add `hman.tailor.au` as a custom domain. Cloudflare auto-provisions the cert.

### 6. Register the bridge as a Windows auto-start task

```powershell
# Run in an ADMIN PowerShell window
pwsh -File ops/install-windows-service.ps1 -Tunnel named
```

Done. Bridge + tunnel now launch at login, restart on failure, and survive reboots.

---

## First boot

1. Reboot / log out and back in. Bridge + tunnel auto-start.
2. On first run, `start-bridge.ps1` generates `HMAN_AUTH_TOKEN` and writes it to `%USERPROFILE%\.hman\bridge.env`. **Copy the printed token.**
3. Open `https://hman.tailor.au/app` on any device.
4. TokenGate prompts for the bridge token → paste it. Stored in browser localStorage.
5. Go to Onboarding → enrol your voice.
6. Go to Gates → Arm Gate 5 with your enrolment passphrase.
7. Talk.

---

## Runtime URLs

| What | URL | Owner |
|---|---|---|
| Public front door | `https://hman.tailor.au` | Cloudflare Pages (static) |
| Member app | `https://hman.tailor.au/app` | Cloudflare Pages (static) |
| Bridge API | `https://bridge.tailor.au` | Cloudflare Tunnel → your desktop |
| Local bridge | `http://127.0.0.1:8765` | Your desktop only |
| OpenAPI docs | `https://bridge.tailor.au/docs` | Your desktop (behind token) |

---

## Security posture

- **Bridge auth**: every `/api/*` request requires `Authorization: Bearer <HMAN_AUTH_TOKEN>`. Token is 48 hex chars, generated locally on first launch, persisted at `~/.hman/bridge.env` with user-only read permission.
- **CORS**: bridge accepts only the origins listed in `HMAN_ALLOWED_ORIGINS`. Production should set this to exactly `https://hman.tailor.au`.
- **Transport**: Cloudflare edge terminates TLS. Cloudflare ↔ your desktop uses the tunnel's built-in E2E encryption. Your desktop never exposes a listening port to the internet.
- **Voice reference at rest**: Fernet (AES-128-CBC + HMAC-SHA256) with PBKDF2-SHA256 600k iterations. Passphrase is the key. No recovery.
- **Decrypted reference**: lives **only in bridge process memory**. Process restart clears it. Member re-arms per session.
- **Audit log**: append-only, hash-chained. `~/.hman/logs/gate_events.jsonl`.
- **No telemetry**: zero outbound calls from the bridge to anywhere except localhost and your own Cloudflare Tunnel edge.

---

## Operational

| Task | Command |
|---|---|
| Start bridge + tunnel manually | `pwsh -File ops/start-bridge.ps1 -Tunnel named` |
| Quick tunnel (trycloudflare.com, no DNS) | `pwsh -File ops/start-bridge.ps1 -Tunnel quick` |
| Stop everything | Stop the scheduled task + `Stop-Process cloudflared` |
| Rotate bridge token | Delete `%USERPROFILE%\.hman\bridge.env`, restart task, paste new token |
| View audit log | `Get-Content ~/.hman/logs/gate_events.jsonl -Tail 50 -Wait` |
| Re-enrol voice | `python packages/python-bridge/enrollment/enroll_voice.py` |
| Rebuild/redeploy frontend | `cd apps/web-dashboard; npm run deploy` |
| Tail cloudflared logs | Watch the minimised cloudflared window, or `Get-EventLog -LogName Application -Source cloudflared -Newest 20` |

---

## Gotchas

- **First tunnel start is slow** — first run downloads root certs. Give it 30 seconds.
- **iOS Safari requires HTTPS for mic** — this works once `hman.tailor.au` is behind Cloudflare Pages. Local `http://127.0.0.1` also works on iOS because localhost is a trusted context, but only from the desktop.
- **Service worker caches stale assets** — if you deploy a new frontend build and the old one still shows, clear site data in the browser or bump `CACHE` version in `public/sw.js`.
- **PWA install on iOS** — Safari → Share → Add to Home Screen. No install prompt (iOS limitation).
- **PWA install on Android Chrome** — install banner appears automatically after a few visits.
- **Desktop sleeps → tunnel drops** — either disable sleep while bridge is running, or accept intermittent offline periods (the service worker keeps the shell working).

---

## What's not yet prod-ready

Flagging honestly:

- **No automated bridge tests in CI** — unit tests haven't been written. If anyone contributes, they can't run a test suite.
- **No Windows installer .msi** — deployment is git-clone + scripts. Fine for early adopters, not for civilians.
- **No Cloudflare Access gating** — the bearer token is the only barrier. Real prod would also put Cloudflare Access in front of `bridge.tailor.au` (email OTP or Google SSO restricted to specific emails).
- **No native mobile app** — the PWA works, but for true AirPods-era UX (head-motion wake, lock-screen controls) we need an iOS/Android app with real CoreMotion access.
- **No secret rotation** — `HMAN_AUTH_TOKEN` is set-and-forget. Should rotate periodically.
- **Bridge restart loses armed state** — Gate 5 must be re-armed every time the bridge restarts. Intentional for security; inconvenient for a consumer product. Could be replaced with OS keychain later.
