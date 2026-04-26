// Llama32Candidate.swift — stub for Llama 3.2 1B running through MLC LLM.
//
// The lowest-quality but fastest candidate: 1B parameters, fits trivially
// inside the memory budget on every supported device. Included so we have
// a fallback for older / lower-RAM hardware, and so the report can show
// the quality / latency curve rather than just the front-runners.
//
// Stubbed. The follow-up PR is mostly identical to the Gemma stub — same
// MLC engine, different model id and quantization.

import Foundation

public struct Llama32Candidate: LLMCandidate {
    public let name: String = "mlc-llama-3.2-1b-q4f16_1"
    public let displayName: String = "Llama 3.2 1B via MLC (q4f16_1)"

    public init() {}

    public func warmUp() async throws {
        // No-op until follow-up PR initialises the MLC engine.
    }

    public func generate(prompt: String) async throws -> GenerationResult {
        throw BenchError.notImplemented(candidate: name)
    }
}
