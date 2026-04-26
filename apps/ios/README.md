# HMAN iOS app

Native iOS client for HMAN. Currently a **chassis** — SwiftUI shell, typed bridge client, and Codable ports of `packages/shared/src/types/`. Real features land in Wave 2 sub-issues:

- #14 — AirPods motion telemetry
- #15 — PACT signing (libsodium)
- #16 — HealthKit ingest
- #17 — APNs push for access requests
- #18 — voice-biometric (Gate 5) on device

## Layout

```
apps/ios/
├── Package.swift                       SwiftPM manifest, iOS 17+ floor
├── Sources/HMAN/
│   ├── HMANApp.swift                   @main SwiftUI entry
│   ├── ContentView.swift               TabView shell
│   ├── Bridge/HMANBridgeClient.swift   typed FastAPI wrapper, BridgeError
│   ├── Crypto/                         PACT signing primitives (#15)
│   │   ├── PACTSigner.swift            Ed25519 + Argon2id via swift-sodium
│   │   ├── KeyManager.swift            Keychain-backed keypair persistence
│   │   └── ConstantTime.swift          libsodium-backed timing-safe compare
│   ├── Models/                         Codable ports of shared TS types
│   └── Views/                          placeholder routes (Welcome, ...)
└── Tests/HMANTests/
    ├── HMANBridgeClientTests.swift     URL-construction + decoder tests
    ├── CryptoTests.swift               PACT roundtrip + cross-platform fixture
    └── Fixtures/                       JSON signatures for desktop verifier
```

## Requirements

- **iOS 17.0+** deployment target
- **Xcode 15+** to open / run on simulator or device
- **Swift 5.9+** (for SPM `swift-tools-version: 5.9`)

## Build from CLI

```bash
cd apps/ios
swift build
swift test
```

This is what CI runs on `macos-14`. No `xcodebuild` invocation needed at this stage — the SwiftPM target compiles cleanly without a project / scheme.

## Open in Xcode

```bash
open Package.swift
```

Xcode resolves the SPM dependencies (`swift-sodium`, `KeychainAccess`) on first open. Pick an iOS Simulator scheme (e.g. iPhone 15 Pro, iOS 17.5) and hit Run.

## Run on simulator

1. Open `apps/ios/Package.swift` in Xcode 15+.
2. Wait for "Resolving Package Graph" to finish.
3. Select the **HMAN** scheme.
4. Choose any iOS 17 / 18 simulator.
5. **Cmd-R**. The tab bar shell launches.

## Run on a physical device

Skeleton-stage: not yet wired for device builds. To do it manually you need an Apple developer account configured in Xcode and a generated app target.

A future PR (after the chassis is in `main`) will add either:

- An `.xcodeproj` alongside `Package.swift` so signing config and Info.plist entitlements travel in the repo, or
- A scripted `xcodebuild`-driven flow that injects a member-supplied team ID at build time.

For now: open `Package.swift` in Xcode, select the **HMAN** scheme, choose your physical device, and let Xcode prompt for code-signing setup. iCloud / push / HealthKit entitlements arrive with their respective Wave 2 issues — the skeleton has none.

## Bridge configuration

`HMANBridgeClient` defaults to `http://127.0.0.1:8765`, which matches the FastAPI bridge in `packages/python-bridge`. Bearer tokens are stored in the iOS Keychain via `KeychainAccess`. The token is set during onboarding (Wave 2) — for now the skeleton exposes:

```swift
let client = HMANBridgeClient()
try client.setBearerToken("...")
let health = try await client.health()
let gates = try await client.gatesStatus()
```

## Dependencies

Pulled via SwiftPM (declared in `Package.swift`):

- [`swift-sodium`](https://github.com/jedisct1/swift-sodium) — libsodium bindings, used by PACT signing (#15) and any future E2EE work.
- [`KeychainAccess`](https://github.com/kishikawakatsumi/KeychainAccess) — Keychain wrapper for bridge tokens, biometric material, PACT keys.

HTTP uses `URLSession` directly — no Alamofire — to keep the dependency surface small.

## CI

`.github/workflows/ci.yml` includes an `ios-build` job that runs `swift build` on `macos-14`. No `xcodebuild` step yet; that arrives once we have an `.xcodeproj` for device builds.
