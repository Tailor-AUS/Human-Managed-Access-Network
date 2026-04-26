// Reporter.swift — turns a directory of results JSONs into the markdown
// table at `docs/llm-on-device-eval.md`.
//
// Inputs: zero or more `<candidate>-<device>-<date>.json` files.
// Output: a markdown fragment that the report template's "Results" section
// can include verbatim. The four headline columns map directly to the
// decision criteria in `docs/llm-on-device-eval.md`:
//   - TTFT median (criterion 1: < 1500 ms)
//   - tok/s median (criterion 2: > 8 on iPhone 15 Pro)
//   - peak mem median (criterion 3: < 1.5 GB)
//   - adequacy mean (criterion 4: >= 3.5)
//
// Median rather than mean for the latency / throughput / memory numbers
// because cold-start / GC outliers should not skew the cell. Mean for
// adequacy because we're averaging a 1-5 ordinal where outliers carry
// signal.
//
// The reporter is deliberately schema-tolerant: if a JSON has zero
// scored outcomes, the adequacy cell renders as "—" rather than 0.0.
// Same for an entirely-skipped candidate (every outcome `notImplemented`)
// — the row prints with em-dashes so the empty template communicates
// "this is the chassis, real numbers go here".

import Foundation

public struct Reporter {

    /// One row in the rendered table. Public so callers (tests) can
    /// inspect computed values without parsing markdown.
    public struct Row: Sendable {
        public let candidateDisplayName: String
        public let deviceLabel: String
        public let medianTTFTMs: Double?
        public let medianTokensPerSecond: Double?
        public let medianPeakMemoryMB: Double?
        public let meanAdequacy: Double?
        public let scoredCount: Int
        public let successCount: Int
        public let totalPrompts: Int
    }

    /// Scans a directory for results JSONs and decodes them. Files that
    /// fail to decode are skipped with a stderr warning so a single bad
    /// file doesn't kill the report.
    public static func loadResults(from directory: URL) throws -> [CandidateRunResults] {
        let fm = FileManager.default
        let contents = try fm.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: nil
        )
        let jsonFiles = contents.filter { $0.pathExtension == "json" }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        var loaded: [CandidateRunResults] = []
        for file in jsonFiles {
            do {
                let data = try Data(contentsOf: file)
                let result = try decoder.decode(CandidateRunResults.self, from: data)
                loaded.append(result)
            } catch {
                FileHandle.standardError.write(
                    Data("warning: failed to decode \(file.lastPathComponent): \(error)\n".utf8)
                )
            }
        }
        return loaded
    }

    /// Computes a `Row` per result document. No filtering — caller decides
    /// the order and which to render.
    public static func rows(from results: [CandidateRunResults]) -> [Row] {
        return results.map { result in
            let successes = result.outcomes.filter { $0.status == .success }
            let ttfts = successes.compactMap { $0.result?.timeToFirstTokenMs }
            let tps   = successes.compactMap { $0.result?.tokensPerSecond }
            let mems  = successes.compactMap { $0.result?.peakMemoryMB }

            let summary = RubricScorer.summarise(results: result)

            return Row(
                candidateDisplayName: result.candidateDisplayName,
                deviceLabel: result.deviceLabel,
                medianTTFTMs: median(ttfts),
                medianTokensPerSecond: median(tps),
                medianPeakMemoryMB: median(mems),
                meanAdequacy: summary.overallMean,
                scoredCount: summary.scoredCount,
                successCount: successes.count,
                totalPrompts: result.outcomes.count
            )
        }
    }

    /// Renders the rows as a GitHub-flavoured-markdown table. Stable
    /// column order so the report template's surrounding prose can
    /// reference cells by position.
    public static func renderMarkdownTable(rows: [Row]) -> String {
        var out = ""
        out += "| Candidate | Device | TTFT (ms, median) | tok/s (median) | Peak mem (MB, median) | Adequacy (mean, scored / total) | Successes / total |\n"
        out += "|-----------|--------|-------------------|----------------|------------------------|----------------------------------|--------------------|\n"

        for row in rows {
            let ttft = row.medianTTFTMs.map { String(format: "%.0f", $0) } ?? "—"
            let tps  = row.medianTokensPerSecond.map { String(format: "%.1f", $0) } ?? "—"
            let mem  = row.medianPeakMemoryMB.map { String(format: "%.0f", $0) } ?? "—"

            let adequacyCell: String
            if let mean = row.meanAdequacy {
                adequacyCell = String(format: "%.2f (%d / %d)", mean, row.scoredCount, row.totalPrompts)
            } else {
                adequacyCell = "— (\(row.scoredCount) / \(row.totalPrompts))"
            }

            let successCell = "\(row.successCount) / \(row.totalPrompts)"

            out += "| \(row.candidateDisplayName) | \(row.deviceLabel) | \(ttft) | \(tps) | \(mem) | \(adequacyCell) | \(successCell) |\n"
        }
        return out
    }

    /// End-to-end: load a directory, render, return the markdown string.
    /// CLI's `report` subcommand calls this and either prints to stdout
    /// or writes into the report template (which has a marker comment
    /// for the table location).
    public static func renderReport(fromDirectory directory: URL) throws -> String {
        let results = try loadResults(from: directory)
        // Stable order: by candidate display name, then by device label.
        let sorted = results.sorted {
            if $0.candidateDisplayName != $1.candidateDisplayName {
                return $0.candidateDisplayName < $1.candidateDisplayName
            }
            return $0.deviceLabel < $1.deviceLabel
        }
        return renderMarkdownTable(rows: rows(from: sorted))
    }

    // MARK: - Internal helpers

    static func median(_ values: [Double]) -> Double? {
        guard !values.isEmpty else { return nil }
        let sorted = values.sorted()
        let count = sorted.count
        if count % 2 == 1 {
            return sorted[count / 2]
        }
        return (sorted[count / 2 - 1] + sorted[count / 2]) / 2.0
    }
}
