# @hman/python-bridge

The local HTTP bridge that backs the `.HMAN` member app.

Runs on `http://127.0.0.1:8765` on the member's device. The web dashboard at
`apps/web-dashboard` calls into it for voice enrolment, gate arming, and
runtime speaker verification.

**Everything happens locally.** No audio is uploaded. No embeddings leave
the device. Nothing phones home.

## What it does

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Bridge + GPU + enrolled status |
| `POST /api/enrollment/session` | Start a voice enrolment session (member passphrase) |
| `POST /api/enrollment/sample` | Upload an utterance to the session |
| `POST /api/enrollment/finalize` | Average embeddings, encrypt reference, save |
| `POST /api/gate5/unlock` | Decrypt voice reference into memory |
| `POST /api/gate5/lock` | Clear in-memory reference |
| `POST /api/gate5/verify` | Verify a live utterance vs. reference (speaker ID) |
| `GET /api/gate5/status` | Live gate-5 state + counters |
| `POST /api/gate1/ping` | Record a conscious-invocation event |
| `GET /api/gates` | Aggregated status for the five gates |

## Requirements

- **Python 3.11+**
- **CUDA-capable GPU** recommended (NVIDIA RTX). Will fall back to CPU,
  but real-time verification latency degrades.
- ~2 GB disk for model downloads on first run.

## Install

```bash
python -m venv .venv
source .venv/bin/activate      # macOS / Linux
# .venv\Scripts\activate.bat   # Windows

pip install -r requirements.txt
```

## Run

```bash
python api/server.py
```

The server listens on `127.0.0.1:8765` and only accepts browser calls from
the local dashboard dev server (CORS is localhost-only). Leave it running
while you use the web app at `apps/web-dashboard`.

## Data location

By default, the bridge stores member state in `~/.hman/`:

```
~/.hman/
├── identity/
│   └── voice_embedding.enc       # encrypted reference (Fernet + PBKDF2-SHA256)
├── enrollment/
│   └── enrollment_YYYYMMDD_HHMMSS.json   # audit of each session
└── logs/
    └── gate_events.jsonl         # append-only gate verification log
```

Override with `HMAN_DATA_DIR=/path/to/wherever` before launching.

## CLI enrolment (optional)

If you prefer terminal over the web flow:

```bash
python enrollment/enroll_voice.py
```

It'll walk you through the ten phonetically-diverse prompts, compute
the reference, and write the encrypted file to `~/.hman/identity/`.

## Security posture

- Reference embedding encrypted at rest via **Fernet** (AES-128-CBC +
  HMAC-SHA256), key derived from a member passphrase via
  **PBKDF2-SHA256** with 600 000 iterations.
- The decrypted reference lives **only in memory** while the bridge is
  unlocked. Process restart clears it. No long-running secret on disk.
- Audit log entries are **append-only**. Each enrolment writes a
  tamper-evident record including a SHA-256 hash of the reference.
- **No network calls** other than the bound loopback HTTP server. Torch
  model downloads only happen the first time you run (and can be done
  offline by pre-placing cached models).

## EEG hardware compatibility

The EEG sensor (`sensors/eeg.py`) communicates with Muse headbands over
Bluetooth LE using the published Muse S characteristic UUIDs.

| Device | Status | Notes |
|---|---|---|
| Muse S (Gen 2) | ✓ Supported | Preset 21 (`p21`) or start command |
| Muse 2 | ✓ Supported | Preset fallback sequence |
| **Muse S Athena** | **✗ Not supported** | See below |

### Muse S Athena

The Athena firmware (MAC OUI `00:55:DA:`, advertises as `MuseS-<suffix>`)
rejects **every** documented preset and start command with `rc:69`.  The
control characteristic responds to wake / version queries (`rc:0`), confirming
the BLE connection is live, but no data ever flows.

When an Athena device is detected, the bridge sets:

```
last_error: "Muse S Athena firmware is not yet supported. ..."
```

and **stops the sensor** immediately instead of looping indefinitely with
`packets: 0`.

**Next steps tracked in the GitHub issue:**

- Capture BLE traffic from the official Muse app streaming to an Athena
  device and diff against our command set.
- Evaluate the [`muselsl`](https://github.com/alexandrebarachant/muse-lsl)
  library which claims Athena support and could sit behind a feature flag
  so existing Muse S / Muse 2 users are not regressed.

Until one of the above is resolved, **connect a Muse S Gen 2 or Muse 2**
to use the EEG sensor.

## MIT License

See [LICENSE](../../LICENSE) at the repo root.
