// Phi3Candidate.swift — stub for Phi-3 Mini (3.8B) on iOS.
//
// Two viable backends, both worth benching independently:
//   - MLC LLM (same engine as the Gemma candidate)
//   - llama.cpp Swift port (https://github.com/ggerganov/llama.cpp/tree/master/examples/llama.swiftui)
//
// We ship a single stub here parameterised by backend so the follow-up
// PR can populate both and the report compares them side-by-side. Phi-3
// is the most interesting candidate for HMAN because of its instruction-
// following quality — but at 3.8B it eats RAM, and on iPhone 13 base
// that may push us over criterion (3) (peak mem < 1.5 GB).

import Foundation

public struct Phi3Candidate: LLMCandidate {
    public enum Backend: String, Sendable {
        case mlc        // MLC LLM iOS runtime
        case llamaCpp   // llama.cpp Swift port
    }

    public let backend: Backend
    public let name: String
    public let displayName: String

    public init(backend: Backend = .mlc) {
        self.backend = backend
        switch backend {
        case .mlc:
            self.name = "phi3-mini-mlc-q4f16_1"
            self.displayName = "Phi-3 Mini via MLC (q4f16_1)"
        case .llamaCpp:
            self.name = "phi3-mini-llamacpp-q4_K_M"
            self.displayName = "Phi-3 Mini via llama.cpp (Q4_K_M)"
        }
    }

    public func warmUp() async throws {
        // No-op until follow-up PR loads Phi-3 weights via the chosen backend.
    }

    public func generate(prompt: String) async throws -> GenerationResult {
        throw BenchError.notImplemented(candidate: name)
    }
}
