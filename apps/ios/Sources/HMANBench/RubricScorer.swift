// RubricScorer.swift — manual scoring scaffold for benchmark outputs.
//
// The four numbers we measure automatically (TTFT, tok/s, peak mem,
// success/skip/error) are easy. Adequacy isn't — the only reliable judge
// of "did this answer actually help" is a human reading the response next
// to the prompt. This file gives the human a structured place to record
// 1-5 scores against a JSON results file.
//
// Workflow:
//   1. `BenchHarness.run(...)` produces `<candidate>-<device>-<date>.json`
//      with empty `adequacyScore` fields.
//   2. The reviewer opens the JSON in their editor (or uses the CLI's
//      `score` subcommand once we wire that up) and fills in 1-5 per
//      prompt, optionally with a note.
//   3. `Reporter.swift` reads the now-scored JSONs and renders the table.
//
// We keep the rubric definition in code rather than a doc-only string
// so the executable can print it in the `score` subcommand and so unit
// tests can assert valid score ranges without parsing markdown.

import Foundation

public struct RubricScorer {

    /// What each adequacy score means. The 1-5 scale is calibrated
    /// against decision criterion (4): the average across all 30 prompts
    /// must be >= 3.5 for a candidate to ship.
    public enum AdequacyLevel: Int, Sendable {
        /// Off-topic, hallucinated facts, or refused something it shouldn't have.
        /// Counts against the model — we'd rather it errored cleanly.
        case unusable = 1
        /// Topical but materially wrong, missing key context, or the
        /// refusal policy is inverted (e.g. happily files an issue we
        /// asked it not to).
        case poor = 2
        /// Recognisable answer, would need a follow-up turn or a manual
        /// edit before it ships. The break-even bar.
        case acceptable = 3
        /// Right answer, minor polish away from done. Voice-loop usable.
        case good = 4
        /// Indistinguishable from a careful manual draft. Rare.
        case excellent = 5

        public var label: String {
            switch self {
            case .unusable:   return "1 — unusable"
            case .poor:       return "2 — poor"
            case .acceptable: return "3 — acceptable"
            case .good:       return "4 — good"
            case .excellent:  return "5 — excellent"
            }
        }
    }

    /// Single fillable row, used by the score subcommand and tests.
    public struct ScoreEntry: Sendable {
        public let promptId: String
        public var adequacyScore: Int?
        public var note: String?

        public init(promptId: String, adequacyScore: Int? = nil, note: String? = nil) {
            self.promptId = promptId
            self.adequacyScore = adequacyScore
            self.note = note
        }
    }

    /// Validates a prospective score. Used by both the CLI input loop
    /// and round-tripping JSON to catch typos before they pollute the
    /// reported averages.
    public static func validate(score: Int) -> Bool {
        return AdequacyLevel(rawValue: score) != nil
    }

    /// Applies a list of scores to an existing results JSON in place.
    /// Returns a new `CandidateRunResults` with the scores merged on
    /// matching `promptId`. Unmatched ids are silently ignored — the
    /// caller has already been warned by the CLI.
    public static func apply(
        scores: [ScoreEntry],
        to results: CandidateRunResults
    ) -> CandidateRunResults {
        let scoreMap = Dictionary(uniqueKeysWithValues: scores.map { ($0.promptId, $0) })

        let merged = results.outcomes.map { outcome -> PromptOutcome in
            guard let entry = scoreMap[outcome.promptId] else {
                return outcome
            }
            return PromptOutcome(
                promptId: outcome.promptId,
                category: outcome.category,
                prompt: outcome.prompt,
                status: outcome.status,
                result: outcome.result,
                errorDescription: outcome.errorDescription,
                adequacyScore: entry.adequacyScore ?? outcome.adequacyScore,
                scoringNote: entry.note ?? outcome.scoringNote
            )
        }

        return CandidateRunResults(
            candidateName: results.candidateName,
            candidateDisplayName: results.candidateDisplayName,
            deviceModel: results.deviceModel,
            deviceLabel: results.deviceLabel,
            runStartedAt: results.runStartedAt,
            runFinishedAt: results.runFinishedAt,
            harnessVersion: results.harnessVersion,
            outcomes: merged
        )
    }

    /// Aggregates per-category and overall mean adequacy. Outcomes
    /// without a score are excluded from the denominator (rather than
    /// counted as zero) so a partially-scored run still produces a fair
    /// number. Overall mean is across scored outcomes regardless of
    /// category.
    public struct AdequacySummary: Sendable {
        public let perCategoryMean: [EvalSet.Category: Double]
        public let overallMean: Double?
        public let scoredCount: Int
        public let totalCount: Int
    }

    public static func summarise(
        results: CandidateRunResults
    ) -> AdequacySummary {
        var byCategory: [EvalSet.Category: (sum: Int, count: Int)] = [:]
        var totalSum = 0
        var totalCount = 0

        for outcome in results.outcomes {
            guard let score = outcome.adequacyScore else { continue }
            let prev = byCategory[outcome.category] ?? (0, 0)
            byCategory[outcome.category] = (prev.sum + score, prev.count + 1)
            totalSum += score
            totalCount += 1
        }

        let perCategoryMean: [EvalSet.Category: Double] =
            byCategory.mapValues { Double($0.sum) / Double($0.count) }

        let overall: Double? = totalCount == 0
            ? nil
            : Double(totalSum) / Double(totalCount)

        return AdequacySummary(
            perCategoryMean: perCategoryMean,
            overallMean: overall,
            scoredCount: totalCount,
            totalCount: results.outcomes.count
        )
    }

    /// Reads a results JSON, applies a `[promptId: score]` map, and
    /// writes the result back. Convenience wrapper used by the `score`
    /// CLI subcommand.
    public static func scoreFile(
        at url: URL,
        scores: [String: Int],
        notes: [String: String] = [:]
    ) throws {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let data = try Data(contentsOf: url)
        let original = try decoder.decode(CandidateRunResults.self, from: data)

        let entries = scores.map { id, score in
            ScoreEntry(
                promptId: id,
                adequacyScore: validate(score: score) ? score : nil,
                note: notes[id]
            )
        }

        let merged = apply(scores: entries, to: original)

        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        let out = try encoder.encode(merged)
        try out.write(to: url, options: .atomic)
    }
}
