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
            // Biometric/Resources/ holds the placeholder for the
            // Resemblyzer CoreML model (#18). Once the real
            // Resemblyzer.mlmodel lands locally the SPM build will
            // compile it to .mlmodelc and bundle automatically; the
            // explicit `.copy` here keeps the placeholder + README
            // out of the resources processing pipeline (we don't want
            // SPM to choke on a non-asset placeholder file).
            exclude: [
                "Biometric/Resources/Resemblyzer.mlmodel.placeholder",
                "Biometric/README.md",
            ]
        ),
        .testTarget(
            name: "HMANTests",
            dependencies: ["HMAN"],
            path: "Tests/HMANTests"
        ),
    ]
)
