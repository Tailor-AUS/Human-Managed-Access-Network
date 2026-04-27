// GemmaMLCCandidate.swift — stub for Gemma 2B / 3B running through MLC LLM
// (https://github.com/mlc-ai/mlc-llm) on iOS.
//
// Why MLC: pre-quantized iOS-ready models, ships a Swift binding, runs
// against Metal directly. Trade-off: bigger app binary (~150 MB for the
// runtime), and we inherit MLC's chat-template handling.
//
// Stubbed. The follow-up PR adds the MLC iOS pod (or SwiftPM if upstream
// adds one), bundles a quantized Gemma weight (likely q4f16_1), and wires
// `MLCEngine` into `generate(prompt:)`. The `name` field is parametric on
// quantization so we can A/B different settings in the same report.
//
// Open question for the follow-up: 2B vs 3B — 2B fits in 1.5 GB RAM
// budget comfortably; 3B might tip over on iPhone 13 base. Bench both
// rather than guessing.

import Foundation

public struct GemmaMLCCandidate: LLMCandidate {
    public let name: String
    public let displayName: String
    public let modelLabel: String
    public let quantization: String

    public init(
        modelLabel: String = "gemma-2b",
        quantization: String = "q4f16_1"
    ) {
        self.modelLabel = modelLabel
        self.quantization = quantization
        self.name = "mlc-\(modelLabel)-\(quantization)"
        self.displayName = "Gemma \(modelLabel.replacingOccurrences(of: "gemma-", with: "")) via MLC (\(quantization))"
    }

    public func warmUp() async throws {
        // No-op until follow-up PR initialises the MLC engine.
    }

    public func generate(prompt: String) async throws -> GenerationResult {
        throw BenchError.notImplemented(candidate: name)
    }
}
