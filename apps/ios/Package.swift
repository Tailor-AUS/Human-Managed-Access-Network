// swift-tools-version: 5.9
//
// HMAN iOS app — Swift Package Manager manifest.
//
// We deliberately ship as a SwiftPM package rather than an .xcodeproj so the
// repo stays git-friendly and CI can validate via `swift build` on macos-14
// without xcodebuild gymnastics. Future Wave 2 PRs may layer an .xcodeproj
// on top for richer asset / signing config — that's out of scope here.
//
// Deployment target: iOS 17.0. SwiftUI surface compiles cleanly on this
// floor; iOS 18 / 26 features can be `#available`-gated as they arrive.

import PackageDescription

let package = Package(
    name: "HMAN",
    platforms: [
        .iOS(.v17),
    ],
    products: [
        .library(
            name: "HMAN",
            targets: ["HMAN"]
        ),
        // HMANBench — on-device LLM evaluation harness. Lives alongside the
        // app library so it can re-use shared types but ships separately so
        // the production build never pulls bench-only dependencies. The
        // executable is run on a real device via `xcodebuild` (out of CI's
        // reach); see `docs/llm-on-device-eval.md` for the run procedure.
        .library(
            name: "HMANBench",
            targets: ["HMANBench"]
        ),
        .executable(
            name: "hman-bench",
            targets: ["HMANBenchCLI"]
        ),
    ],
    dependencies: [
        // libsodium for PACT signing (Wave 2 #15) and any future
        // E2EE work. Pinned to a known-good range; bump in a follow-up.
        .package(
            url: "https://github.com/jedisct1/swift-sodium",
            from: "0.9.1"
        ),
        // Keychain access for bridge bearer tokens, voice biometric
        // enrolment material (#18), and PACT private keys (#15).
        .package(
            url: "https://github.com/kishikawakatsumi/KeychainAccess",
            from: "4.2.2"
        ),
    ],
    targets: [
        .target(
            name: "HMAN",
            dependencies: [
                .product(name: "Sodium", package: "swift-sodium"),
                .product(name: "Clibsodium", package: "swift-sodium"),
                .product(name: "KeychainAccess", package: "KeychainAccess"),
            ],
            path: "Sources/HMAN",
            // Info.plist + entitlements are consumed by the host
            // .xcodeproj / xcodebuild layer (#16 onward), not by the
            // SwiftPM library itself. Exclude them so `swift build`
            // doesn't try to copy them as resources.
            exclude: [
                "Resources/Info.plist",
                "HMAN.entitlements",
            ]
        ),
        .testTarget(
            name: "HMANTests",
            dependencies: ["HMAN"],
            path: "Tests/HMANTests"
        ),
        // HMANBench library — eval-harness chassis (protocol, eval set,
        // scorer, reporter, candidate stubs). Deliberately keeps zero
        // dependencies on real model SDKs; each candidate stub gets fleshed
        // out in its own follow-up PR (see #12 acceptance notes).
        //
        // Note: no dependency on the HMAN target. The harness deals only
        // in primitives (String / Date / Double); pulling HMAN would also
        // pull libsodium + KeychainAccess transitively, which the bench
        // doesn't need. If a future bench feature needs HMAN types, add
        // the dep then.
        .target(
            name: "HMANBench",
            dependencies: [],
            path: "Sources/HMANBench"
        ),
        // Thin executable wrapper. Parses CLI args, dispatches to harness.
        .executableTarget(
            name: "HMANBenchCLI",
            dependencies: ["HMANBench"],
            path: "Sources/HMANBenchCLI"
        ),
        .testTarget(
            name: "HMANBenchTests",
            dependencies: ["HMANBench"],
            path: "Tests/HMANBenchTests"
        ),
    ]
)
