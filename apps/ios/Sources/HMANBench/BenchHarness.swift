// BenchHarness.swift — chassis for the on-device LLM evaluation.
//
// Issue #12 deliverable. The harness itself is model-agnostic: every
// candidate (Apple Foundation Models, MLC-Gemma, MLC-Phi-3, MLC-Llama-3.2)
// conforms to `LLMCandidate`, the runner walks `EvalSet.prompts`, captures
// the four numbers we care about (TTFT, tokens/sec, peak memory, adequacy),
// and writes a results JSON per (candidate, device, date).
//
// Why a protocol instead of an enum: each model SDK has its own warm-up
// quirks and threading model. We want the chassis to land first so the
// follow-up PRs (one per candidate) plug in without reshaping anything.
//
// The harness is intentionally not gated on real numbers — it can run today
// with all four candidates throwing `notImplemented` and still produce a
// well-formed (empty-data) results file. Reviewers should be able to run
// `swift build` on macos-14 against this target without any model SDK
// installed.

import Foundation

// MARK: - Errors

public enum BenchError: Error, Sendable {
    /// Candidate hasn't been integrated yet. Each stub throws this from
    /// `generate(prompt:)`. The harness records it as a skipped row rather
    /// than aborting the run, so a partial integration (say, only Apple
    /// Foundation working) still produces a useful results JSON.
    case notImplemented(candidate: String)
    /// Underlying model SDK failed mid-generation. The string is opaque —
    /// each candidate is responsible for wrapping its own SDK errors.
    case generation(String)
    /// Warm-up didn't complete in budget. We treat this as a fatal-for-this-
    /// candidate condition rather than skipping prompts: a model that can't
    /// warm up reliably is unusable in the voice loop.
    case warmUpTimeout
    /// Results directory wasn't writable. Harness is read-only on /System
    /// when run on-device, so the caller is expected to point us at the
    /// app's documents container.
    case ioError(String)
}

// MARK: - Generation result

/// One model invocation's measurements + output. Captured per prompt so
/// the per-candidate JSON includes individual rows; `Reporter` aggregates
/// to medians for the published table.
public struct GenerationResult: Codable, Sendable {
    /// The model's actual completion. Stored verbatim so the human scorer
    /// can read it during the rubric pass; not displayed in the public
    /// markdown report (privacy + length).
    public let text: String

    /// Time from `generate` invocation to the first sampled token, in
    /// milliseconds. The voice loop budget is < 1500 ms — anything above
    /// that fails decision criterion (1).
    public let timeToFirstTokenMs: Double

    /// Sustained throughput across the full generation, tokens per second.
    /// Decision criterion (2) requires >= 8 tok/s on iPhone 15 Pro.
    public let tokensPerSecond: Double

    /// Peak resident memory observed during generation, in megabytes.
    /// Sampled by the harness via `mach_task_basic_info`. Criterion (3)
    /// requires < 1.5 GB peak; we want headroom for the rest of HMAN to
    /// keep running.
    public let peakMemoryMB: Double

    public init(
        text: String,
        timeToFirstTokenMs: Double,
        tokensPerSecond: Double,
        peakMemoryMB: Double
    ) {
        self.text = text
        self.timeToFirstTokenMs = timeToFirstTokenMs
        self.tokensPerSecond = tokensPerSecond
        self.peakMemoryMB = peakMemoryMB
    }
}

// MARK: - Candidate protocol

/// Anything that can answer an HMAN-shaped prompt. Each follow-up PR
/// implements this for one model SDK. The protocol is deliberately tiny:
/// generation is the only hot path we instrument, and warm-up exists so
/// a candidate can amortise model load before the timed prompts.
public protocol LLMCandidate: Sendable {
    /// Stable short name used in JSON filenames and the report table —
    /// e.g. `"apple-foundation-1.2"`, `"mlc-gemma-2b-q4f16_1"`. Lowercased,
    /// no spaces, no slashes.
    var name: String { get }

    /// Human-readable display name for the report. Free-form.
    var displayName: String { get }

    /// Load the model into RAM, run a single token forward to JIT-compile
    /// kernels, etc. Called once before the eval set; failures here count
    /// as a candidate-wide skip (per BenchError.warmUpTimeout doc).
    func warmUp() async throws

    /// Single-shot completion. The harness calls this once per prompt;
    /// no streaming surface is exposed here because the eval rubric scores
    /// the final answer, not partial deltas.
    func generate(prompt: String) async throws -> GenerationResult
}

// MARK: - Runner

/// Per-prompt outcome, captured even when the candidate skipped or errored
/// so the human scorer sees the full picture.
public struct PromptOutcome: Codable, Sendable {
    public enum Status: String, Codable, Sendable {
        case success
        case skipped       // BenchError.notImplemented
        case errored       // any other BenchError or thrown SDK error
    }

    public let promptId: String
    public let category: EvalSet.Category
    public let prompt: String
    public let status: Status
    public let result: GenerationResult?
    public let errorDescription: String?
    /// Filled in by the rubric pass (RubricScorer). 1-5; nil until scored.
    public var adequacyScore: Int?
    /// Free-form human note next to the score. Optional.
    public var scoringNote: String?

    public init(
        promptId: String,
        category: EvalSet.Category,
        prompt: String,
        status: Status,
        result: GenerationResult?,
        errorDescription: String?,
        adequacyScore: Int? = nil,
        scoringNote: String? = nil
    ) {
        self.promptId = promptId
        self.category = category
        self.prompt = prompt
        self.status = status
        self.result = result
        self.errorDescription = errorDescription
        self.adequacyScore = adequacyScore
        self.scoringNote = scoringNote
    }
}

/// Top-level results document, one per (candidate, device, date) triple.
/// Reporter consumes a directory of these to produce the markdown table.
public struct CandidateRunResults: Codable, Sendable {
    public let candidateName: String
    public let candidateDisplayName: String
    public let deviceModel: String        // e.g. "iPhone15,3" (15 Pro) — raw machine identifier
    public let deviceLabel: String        // human-friendly: "iPhone 15 Pro"
    public let runStartedAt: Date
    public let runFinishedAt: Date
    public let harnessVersion: String     // bumped when the eval set changes
    public let outcomes: [PromptOutcome]

    public init(
        candidateName: String,
        candidateDisplayName: String,
        deviceModel: String,
        deviceLabel: String,
        runStartedAt: Date,
        runFinishedAt: Date,
        harnessVersion: String,
        outcomes: [PromptOutcome]
    ) {
        self.candidateName = candidateName
        self.candidateDisplayName = candidateDisplayName
        self.deviceModel = deviceModel
        self.deviceLabel = deviceLabel
        self.runStartedAt = runStartedAt
        self.runFinishedAt = runFinishedAt
        self.harnessVersion = harnessVersion
        self.outcomes = outcomes
    }
}

/// The runner. Stateless — instantiate, call `run`, ship the results.
/// Kept actor-free to keep the trace easy to read in Instruments; each
/// candidate is responsible for whatever concurrency model it wants
/// internally.
public struct BenchHarness {
    public static let harnessVersion = "0.1.0"

    public let evalSet: EvalSet
    public let device: DeviceDescriptor

    public init(evalSet: EvalSet = .standard, device: DeviceDescriptor) {
        self.evalSet = evalSet
        self.device = device
    }

    /// Walks the eval set against `candidate`. Captures one outcome per
    /// prompt. Returns a results document ready to write to disk.
    public func run(candidate: LLMCandidate) async -> CandidateRunResults {
        let started = Date()
        var outcomes: [PromptOutcome] = []

        // Warm-up failure short-circuits the whole run: every prompt gets
        // recorded as `errored` with the warm-up reason. This keeps the
        // shape of the results JSON identical across candidates.
        do {
            try await candidate.warmUp()
        } catch {
            for prompt in evalSet.prompts {
                outcomes.append(
                    PromptOutcome(
                        promptId: prompt.id,
                        category: prompt.category,
                        prompt: prompt.text,
                        status: .errored,
                        result: nil,
                        errorDescription: "warm-up failed: \(error)"
                    )
                )
            }
            return CandidateRunResults(
                candidateName: candidate.name,
                candidateDisplayName: candidate.displayName,
                deviceModel: device.machineIdentifier,
                deviceLabel: device.label,
                runStartedAt: started,
                runFinishedAt: Date(),
                harnessVersion: Self.harnessVersion,
                outcomes: outcomes
            )
        }

        for prompt in evalSet.prompts {
            do {
                let result = try await candidate.generate(prompt: prompt.text)
                outcomes.append(
                    PromptOutcome(
                        promptId: prompt.id,
                        category: prompt.category,
                        prompt: prompt.text,
                        status: .success,
                        result: result,
                        errorDescription: nil
                    )
                )
            } catch BenchError.notImplemented(let name) {
                outcomes.append(
                    PromptOutcome(
                        promptId: prompt.id,
                        category: prompt.category,
                        prompt: prompt.text,
                        status: .skipped,
                        result: nil,
                        errorDescription: "candidate \(name) not yet implemented"
                    )
                )
            } catch {
                outcomes.append(
                    PromptOutcome(
                        promptId: prompt.id,
                        category: prompt.category,
                        prompt: prompt.text,
                        status: .errored,
                        result: nil,
                        errorDescription: String(describing: error)
                    )
                )
            }
        }

        return CandidateRunResults(
            candidateName: candidate.name,
            candidateDisplayName: candidate.displayName,
            deviceModel: device.machineIdentifier,
            deviceLabel: device.label,
            runStartedAt: started,
            runFinishedAt: Date(),
            harnessVersion: Self.harnessVersion,
            outcomes: outcomes
        )
    }
}

// MARK: - Device descriptor

/// Identifies the device the bench is running on. Captured into every
/// results JSON so the report can split by device class. Caller is
/// expected to fill this in (the CLI reads it from `--device`); the
/// machine identifier is best fetched from `utsname` on real hardware
/// but the harness doesn't take a hard dependency on that to keep
/// `swift build` clean on macOS.
public struct DeviceDescriptor: Codable, Sendable {
    public let machineIdentifier: String
    public let label: String

    public init(machineIdentifier: String, label: String) {
        self.machineIdentifier = machineIdentifier
        self.label = label
    }

    /// Two reference devices the report compares. Bench can be run on
    /// others; these are the named cells in the markdown table.
    public static let iPhone15Pro = DeviceDescriptor(
        machineIdentifier: "iPhone15,3",
        label: "iPhone 15 Pro"
    )
    public static let iPhone13 = DeviceDescriptor(
        machineIdentifier: "iPhone14,5",
        label: "iPhone 13"
    )
}

// MARK: - Persistence

extension CandidateRunResults {
    /// Writes the results JSON to
    /// `<directory>/<candidate>-<deviceModel>-<YYYY-MM-DD>.json`. The
    /// reviewer commits these into `apps/ios/Bench/results/` once a real
    /// run lands; the bench dir is gitignored for transient files.
    public func write(toDirectory directory: URL) throws -> URL {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(identifier: "UTC")
        let dateStamp = formatter.string(from: runStartedAt)

        let filename = "\(candidateName)-\(deviceModel)-\(dateStamp).json"
        let target = directory.appendingPathComponent(filename)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        do {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true
            )
            let data = try encoder.encode(self)
            try data.write(to: target, options: .atomic)
        } catch {
            throw BenchError.ioError(String(describing: error))
        }
        return target
    }
}
