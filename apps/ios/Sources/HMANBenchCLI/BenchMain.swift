// BenchMain.swift — CLI entry point for the on-device LLM bench.
//
// Usage:
//   hman-bench run     --candidate <name> --device <iPhone15Pro|iPhone13> --output <dir>
//   hman-bench score   --file <results.json>           # interactive 1-5 entry
//   hman-bench report  --results-dir <dir>             # render markdown table
//   hman-bench list                                    # print known candidates + eval-set summary
//
// Why a hand-rolled arg parser instead of `swift-argument-parser`: keeping
// this target free of external deps so a reviewer running `swift build`
// against the bench harness alone doesn't pull half of GitHub. The arg
// surface is small enough that this stays readable.
//
// On a phone, this executable doesn't ship — the harness library is
// embedded in a tiny SwiftUI bench app (a follow-up PR adds the wrapper).
// The CLI is for macOS dry runs and for the post-run scoring + reporting
// passes, which can happen off-device once the JSONs come back.

import Foundation
import HMANBench

@main
struct BenchMain {
    static func main() async {
        let args = Array(CommandLine.arguments.dropFirst())
        guard let subcommand = args.first else {
            printUsage()
            exit(2)
        }

        switch subcommand {
        case "run":      await runSubcommand(args: Array(args.dropFirst()))
        case "score":    scoreSubcommand(args: Array(args.dropFirst()))
        case "report":   reportSubcommand(args: Array(args.dropFirst()))
        case "list":     listSubcommand()
        case "-h", "--help", "help":
            printUsage()
        default:
            fputs("unknown subcommand: \(subcommand)\n", stderr)
            printUsage()
            exit(2)
        }
    }

    // MARK: - run

    static func runSubcommand(args: [String]) async {
        let parsed = parseFlags(args)
        guard let candidateName = parsed["--candidate"] else {
            fputs("--candidate is required\n", stderr)
            exit(2)
        }
        guard let deviceFlag = parsed["--device"] else {
            fputs("--device is required (iPhone15Pro | iPhone13)\n", stderr)
            exit(2)
        }
        let outputDir = parsed["--output"] ?? "apps/ios/Bench/results"

        let device: DeviceDescriptor
        switch deviceFlag {
        case "iPhone15Pro": device = .iPhone15Pro
        case "iPhone13":    device = .iPhone13
        default:
            fputs("unknown --device: \(deviceFlag)\n", stderr)
            exit(2)
        }

        let candidate = candidateForName(candidateName)
        guard let candidate else {
            fputs("unknown --candidate: \(candidateName) (run `hman-bench list`)\n", stderr)
            exit(2)
        }

        let harness = BenchHarness(device: device)
        let results = await harness.run(candidate: candidate)

        let outURL = URL(fileURLWithPath: outputDir, isDirectory: true)
        do {
            let written = try results.write(toDirectory: outURL)
            print("wrote \(written.path)")
        } catch {
            fputs("failed to write results: \(error)\n", stderr)
            exit(1)
        }
    }

    // MARK: - score

    static func scoreSubcommand(args: [String]) {
        let parsed = parseFlags(args)
        guard let path = parsed["--file"] else {
            fputs("--file <results.json> is required\n", stderr)
            exit(2)
        }
        let url = URL(fileURLWithPath: path)
        do {
            let data = try Data(contentsOf: url)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let results = try decoder.decode(CandidateRunResults.self, from: data)

            print("Scoring \(results.candidateDisplayName) on \(results.deviceLabel)")
            print("Rubric: 1=unusable, 2=poor, 3=acceptable, 4=good, 5=excellent")
            print("Press <enter> with no number to skip a prompt.\n")

            var scores: [String: Int] = [:]
            for outcome in results.outcomes {
                guard outcome.status == .success else {
                    print("[\(outcome.promptId)] status=\(outcome.status.rawValue) — skipped")
                    continue
                }
                print("[\(outcome.promptId)] (\(outcome.category.rawValue))")
                print("  prompt: \(outcome.prompt)")
                if let text = outcome.result?.text {
                    print("  reply : \(text.prefix(400))")
                }
                print("  score (1-5): ", terminator: "")
                guard let line = readLine(), !line.trimmingCharacters(in: .whitespaces).isEmpty else {
                    continue
                }
                if let n = Int(line), RubricScorer.validate(score: n) {
                    scores[outcome.promptId] = n
                } else {
                    fputs("  invalid score, skipping\n", stderr)
                }
            }

            try RubricScorer.scoreFile(at: url, scores: scores)
            print("\nupdated \(url.path) with \(scores.count) scores")
        } catch {
            fputs("score failed: \(error)\n", stderr)
            exit(1)
        }
    }

    // MARK: - report

    static func reportSubcommand(args: [String]) {
        let parsed = parseFlags(args)
        let dir = parsed["--results-dir"] ?? "apps/ios/Bench/results"
        let url = URL(fileURLWithPath: dir, isDirectory: true)
        do {
            let table = try Reporter.renderReport(fromDirectory: url)
            print(table)
        } catch {
            fputs("report failed: \(error)\n", stderr)
            exit(1)
        }
    }

    // MARK: - list

    static func listSubcommand() {
        print("Known candidates (pass with --candidate):")
        for name in knownCandidateNames {
            print("  \(name)")
        }
        print("")
        let counts = EvalSet.standard.countsByCategory()
        print("Eval set: \(EvalSet.standard.prompts.count) prompts")
        for category in EvalSet.Category.allCases {
            print("  \(category.rawValue): \(counts[category] ?? 0)")
        }
    }

    // MARK: - candidate registry

    static let knownCandidateNames: [String] = [
        "apple-foundation",
        "mlc-gemma-2b-q4f16_1",
        "mlc-gemma-3b-q4f16_1",
        "phi3-mini-mlc-q4f16_1",
        "phi3-mini-llamacpp-q4_K_M",
        "mlc-llama-3.2-1b-q4f16_1",
    ]

    static func candidateForName(_ name: String) -> LLMCandidate? {
        switch name {
        case "apple-foundation":
            return AppleFoundationCandidate()
        case "mlc-gemma-2b-q4f16_1":
            return GemmaMLCCandidate(modelLabel: "gemma-2b", quantization: "q4f16_1")
        case "mlc-gemma-3b-q4f16_1":
            return GemmaMLCCandidate(modelLabel: "gemma-3b", quantization: "q4f16_1")
        case "phi3-mini-mlc-q4f16_1":
            return Phi3Candidate(backend: .mlc)
        case "phi3-mini-llamacpp-q4_K_M":
            return Phi3Candidate(backend: .llamaCpp)
        case "mlc-llama-3.2-1b-q4f16_1":
            return Llama32Candidate()
        default:
            return nil
        }
    }

    // MARK: - flag parsing

    /// `--key value --key2 value2` → `[key: value]`. Unknown flags pass
    /// through; missing values become empty string. Tiny on purpose;
    /// see the file header for the no-deps rationale.
    static func parseFlags(_ args: [String]) -> [String: String] {
        var out: [String: String] = [:]
        var i = 0
        while i < args.count {
            let arg = args[i]
            if arg.hasPrefix("--") {
                if i + 1 < args.count, !args[i + 1].hasPrefix("--") {
                    out[arg] = args[i + 1]
                    i += 2
                } else {
                    out[arg] = ""
                    i += 1
                }
            } else {
                i += 1
            }
        }
        return out
    }

    static func printUsage() {
        let usage = """
        hman-bench — on-device LLM evaluation harness

        Subcommands:
          run     --candidate <name> --device <iPhone15Pro|iPhone13> [--output <dir>]
          score   --file <results.json>
          report  [--results-dir <dir>]
          list

        Run on real hardware via the bench app target; the CLI is for
        macOS dry runs and post-run scoring + reporting.
        """
        print(usage)
    }
}
