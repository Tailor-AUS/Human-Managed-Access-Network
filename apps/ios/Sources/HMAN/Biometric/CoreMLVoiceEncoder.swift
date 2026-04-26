// CoreMLVoiceEncoder.swift — production VoiceEncoder backed by CoreML.
//
// The actual model file (`Resemblyzer.mlmodelc`) is NOT checked into the
// repo. Converting Resemblyzer's pretrained PyTorch encoder requires
// `coremltools` against the upstream weights, which we can't do from CI
// — see `Resources/Resemblyzer.mlmodel.placeholder` in this directory and
// the README's "Manual model conversion" section for the one-shot
// command Knox runs locally before shipping a TestFlight build.
//
// Until the bundled model arrives this encoder throws `modelMissing` on
// first use. Tests inject `StubVoiceEncoder` via `VoiceBiometric.encoder
// = …` and never hit this path.

import Foundation
#if canImport(CoreML)
import CoreML
#endif

public enum CoreMLVoiceEncoderError: Error, Sendable, Equatable {
    /// `Resemblyzer.mlmodelc` not found in the bundle. The placeholder
    /// is deliberately not loadable — see Biometric/README for the
    /// manual conversion step.
    case modelMissing
    /// CoreML rejected the model file (corrupt download, schema drift).
    case modelLoadFailed(String)
    /// Inference failed at runtime (unexpected input shape, etc.).
    case predictionFailed(String)
    /// CoreML isn't available on this build target. Shouldn't ever fire
    /// on iOS 17+, but guards us if a non-Apple platform ever links the
    /// package.
    case unsupportedPlatform
}

/// Production encoder. Lazy-loads `Resemblyzer.mlmodelc` from the
/// module bundle on first call so we don't pay the cost during app
/// launch.
///
/// Embedding output is L2-normalised before return (matches the
/// desktop's `embed_utterance` which the post-processing step in
/// `enroll_voice.py` normalises after averaging — but here we
/// normalise at the per-utterance level too so cosine math downstream
/// stays simple).
///
/// Threading: `predict` is called from `enrollFromUtterances` /
/// `verify`, both of which are `async`. CoreML's `prediction(from:)`
/// is synchronous so we hop through the model's serial queue
/// (the underlying MLModel guarantees thread-safety on iOS 16+, but
/// we serialise per-instance for clarity).
public final class CoreMLVoiceEncoder: VoiceEncoder, @unchecked Sendable {
    public static let shared = CoreMLVoiceEncoder()

    public let embeddingDim: Int = 256
    public let modelId: String = "resemblyzer"

    public init() {}

    public func embed(pcm: Data) async throws -> [Float] {
        #if canImport(CoreML)
        // The CoreML wiring lives behind a flag because the model isn't
        // checked in yet — see README. The stub below mirrors what the
        // real call site will look like once `Resemblyzer.mlmodelc` ships.
        throw CoreMLVoiceEncoderError.modelMissing
        // Future implementation (sketched, do not delete — replace the
        // throw above when the model lands):
        //
        // let url = Bundle.module.url(forResource: "Resemblyzer", withExtension: "mlmodelc")
        //     ?? throw CoreMLVoiceEncoderError.modelMissing
        // let model = try MLModel(contentsOf: url)
        // let mel = try MelSpectrogram.compute(pcm: pcm,
        //                                       sampleRate: VoiceAuditThresholds.sampleRate)
        // let input = try MLDictionaryFeatureProvider(
        //     dictionary: ["mel": MLMultiArray(mel)]
        // )
        // let out = try model.prediction(from: input)
        // guard let arr = out.featureValue(for: "embedding")?.multiArrayValue else {
        //     throw CoreMLVoiceEncoderError.predictionFailed("missing 'embedding' output")
        // }
        // var emb = [Float](repeating: 0, count: embeddingDim)
        // for i in 0..<embeddingDim { emb[i] = Float(truncating: arr[i]) }
        // return l2normalise(emb)
        #else
        throw CoreMLVoiceEncoderError.unsupportedPlatform
        #endif
    }
}
