// AppleFoundationCandidate.swift — stub for Apple's iOS 18.5+ system
// Foundation Models (the on-device LLM Apple exposes via the Foundation
// Models framework).
//
// Stubbed only. The real wiring (a follow-up PR) imports
// `FoundationModels`, instantiates a `LanguageModelSession`, drives it
// with a streaming `respond(to:)` call, and times TTFT off the first
// emitted delta. Memory sampling uses `mach_task_basic_info` like the
// other candidates so the comparison stays apples-to-apples.
//
// Considerations the follow-up PR has to handle:
//   - iOS 18.5 minimum: today's deployment target is iOS 17, so this
//     candidate must `#available(iOS 18.5, *)`-gate every call. On older
//     OSes `warmUp` should throw, not crash.
//   - Apple's safety layer can refuse generation for content it deems
//     unsafe; the `.errored` outcome path captures that without aborting
//     the run.
//   - Tokens/sec is not directly exposed; the follow-up has to count
//     from the streamed deltas. Document the methodology in the report.

import Foundation

public struct AppleFoundationCandidate: LLMCandidate {
    public let name: String = "apple-foundation"
    public let displayName: String = "Apple Foundation Models (iOS 18.5+)"

    public init() {}

    public func warmUp() async throws {
        // No-op until follow-up PR loads `LanguageModelSession`.
    }

    public func generate(prompt: String) async throws -> GenerationResult {
        throw BenchError.notImplemented(candidate: name)
    }
}
