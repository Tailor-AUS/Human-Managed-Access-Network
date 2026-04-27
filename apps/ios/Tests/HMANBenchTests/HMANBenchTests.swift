// HMANBenchTests.swift — keeps the harness chassis honest in CI.
//
// We can't run a real model on macos-14, so the tests focus on the
// shape of the harness:
//   - eval set has the expected category counts
//   - prompt ids are unique
//   - rubric scorer accepts 1-5, rejects 0/6
//   - reporter handles empty + partially-scored input
//   - results JSON round-trips
//
// When real candidates land in follow-up PRs they bring their own
// device-only XCTest targets; those don't run in CI.

import XCTest
@testable import HMANBench

final class HMANBenchTests: XCTestCase {

    // MARK: EvalSet

    func testEvalSetHasThirtyPrompts() {
        XCTAssertEqual(EvalSet.standard.prompts.count, 30)
    }

    func testEvalSetCategoryCounts() {
        let counts = EvalSet.standard.countsByCategory()
        XCTAssertEqual(counts[.drafting],    10)
        XCTAssertEqual(counts[.summarizing], 7)
        XCTAssertEqual(counts[.reasoning],   7)
        XCTAssertEqual(counts[.refusal],     6)
    }

    func testEvalSetPromptIdsAreUnique() {
        let ids = EvalSet.standard.prompts.map { $0.id }
        XCTAssertEqual(Set(ids).count, ids.count, "prompt ids must be unique")
    }

    // MARK: RubricScorer

    func testRubricValidation() {
        XCTAssertTrue(RubricScorer.validate(score: 1))
        XCTAssertTrue(RubricScorer.validate(score: 5))
        XCTAssertFalse(RubricScorer.validate(score: 0))
        XCTAssertFalse(RubricScorer.validate(score: 6))
        XCTAssertFalse(RubricScorer.validate(score: -1))
    }

    func testRubricSummariseEmpty() {
        let results = makeUnscoredResults()
        let summary = RubricScorer.summarise(results: results)
        XCTAssertNil(summary.overallMean)
        XCTAssertEqual(summary.scoredCount, 0)
        XCTAssertEqual(summary.totalCount, EvalSet.standard.prompts.count)
    }

    func testRubricSummarisePartial() {
        var results = makeSuccessfulResults()
        // Score the first three: 4, 3, 5 → mean 4.0
        let scoredOutcomes = results.outcomes.enumerated().map { idx, outcome -> PromptOutcome in
            guard idx < 3 else { return outcome }
            return PromptOutcome(
                promptId: outcome.promptId,
                category: outcome.category,
                prompt: outcome.prompt,
                status: outcome.status,
                result: outcome.result,
                errorDescription: outcome.errorDescription,
                adequacyScore: [4, 3, 5][idx]
            )
        }
        results = CandidateRunResults(
            candidateName: results.candidateName,
            candidateDisplayName: results.candidateDisplayName,
            deviceModel: results.deviceModel,
            deviceLabel: results.deviceLabel,
            runStartedAt: results.runStartedAt,
            runFinishedAt: results.runFinishedAt,
            harnessVersion: results.harnessVersion,
            outcomes: scoredOutcomes
        )

        let summary = RubricScorer.summarise(results: results)
        XCTAssertEqual(summary.scoredCount, 3)
        XCTAssertEqual(summary.overallMean ?? 0, 4.0, accuracy: 0.001)
    }

    // MARK: Reporter

    func testReporterRendersDashesForEmpty() {
        let results = makeUnscoredResults()
        let rows = Reporter.rows(from: [results])
        let table = Reporter.renderMarkdownTable(rows: rows)
        XCTAssertTrue(table.contains("|"))
        // Adequacy cell should be em-dash for unscored.
        XCTAssertTrue(table.contains("— ("))
    }

    func testReporterMedianHelper() {
        XCTAssertNil(Reporter.median([]))
        XCTAssertEqual(Reporter.median([1.0]), 1.0)
        XCTAssertEqual(Reporter.median([1.0, 3.0]), 2.0)
        XCTAssertEqual(Reporter.median([1.0, 2.0, 3.0]), 2.0)
        XCTAssertEqual(Reporter.median([5.0, 1.0, 3.0, 4.0, 2.0]), 3.0)
    }

    // MARK: Round-trip

    func testResultsJSONRoundTrip() throws {
        let results = makeUnscoredResults()

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(results)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(CandidateRunResults.self, from: data)

        XCTAssertEqual(decoded.candidateName, results.candidateName)
        XCTAssertEqual(decoded.outcomes.count, results.outcomes.count)
        XCTAssertEqual(decoded.harnessVersion, results.harnessVersion)
    }

    // MARK: Candidate stubs throw notImplemented

    func testAllCandidateStubsThrowNotImplemented() async {
        let candidates: [LLMCandidate] = [
            AppleFoundationCandidate(),
            GemmaMLCCandidate(),
            Phi3Candidate(backend: .mlc),
            Phi3Candidate(backend: .llamaCpp),
            Llama32Candidate(),
        ]
        for c in candidates {
            do {
                _ = try await c.generate(prompt: "ping")
                XCTFail("\(c.name) should throw notImplemented")
            } catch BenchError.notImplemented {
                // expected
            } catch {
                XCTFail("\(c.name) threw unexpected error: \(error)")
            }
        }
    }

    func testHarnessRecordsSkippedForNotImplemented() async {
        let harness = BenchHarness(device: .iPhone15Pro)
        let results = await harness.run(candidate: AppleFoundationCandidate())
        XCTAssertEqual(results.outcomes.count, 30)
        XCTAssertTrue(results.outcomes.allSatisfy { $0.status == .skipped })
    }

    // MARK: helpers

    private func makeUnscoredResults() -> CandidateRunResults {
        let outcomes = EvalSet.standard.prompts.map { p in
            PromptOutcome(
                promptId: p.id,
                category: p.category,
                prompt: p.text,
                status: .skipped,
                result: nil,
                errorDescription: "stub"
            )
        }
        return CandidateRunResults(
            candidateName: "test",
            candidateDisplayName: "Test Candidate",
            deviceModel: "iPhone15,3",
            deviceLabel: "iPhone 15 Pro",
            runStartedAt: Date(timeIntervalSince1970: 1_700_000_000),
            runFinishedAt: Date(timeIntervalSince1970: 1_700_000_300),
            harnessVersion: BenchHarness.harnessVersion,
            outcomes: outcomes
        )
    }

    private func makeSuccessfulResults() -> CandidateRunResults {
        let outcomes = EvalSet.standard.prompts.map { p in
            PromptOutcome(
                promptId: p.id,
                category: p.category,
                prompt: p.text,
                status: .success,
                result: GenerationResult(
                    text: "stub reply",
                    timeToFirstTokenMs: 800,
                    tokensPerSecond: 12,
                    peakMemoryMB: 900
                ),
                errorDescription: nil
            )
        }
        return CandidateRunResults(
            candidateName: "test",
            candidateDisplayName: "Test Candidate",
            deviceModel: "iPhone15,3",
            deviceLabel: "iPhone 15 Pro",
            runStartedAt: Date(timeIntervalSince1970: 1_700_000_000),
            runFinishedAt: Date(timeIntervalSince1970: 1_700_000_300),
            harnessVersion: BenchHarness.harnessVersion,
            outcomes: outcomes
        )
    }
}
