# On-device LLM evaluation

> **Status:** template / chassis. The harness ships in `apps/ios/Sources/HMANBench/`; this document is the report skeleton it populates. **No real numbers have been captured yet** — the empty cells are intentional.

## Overview

HMAN's voice loop runs on the member's own phone. Cloud LLMs are out of scope (cloud calls violate the "member control above all" gate). We need to pick which on-device model strategy ships first and which falls back on older / lower-RAM hardware.

The pick rests on four numbers per (candidate, device) cell:

1. **Time to first token (TTFT)** — voice feels broken above ~1.5 s.
2. **Sustained throughput (tokens/sec)** — drives how long a useful answer takes to read out.
3. **Peak memory** — the rest of HMAN (audio capture, EEG bridge, SwiftUI shell) needs headroom.
4. **Adequacy** — manual 1-5 score against a fixed eval set, because TTFT + tok/s without quality is meaningless.

## Decision criteria

A candidate is shippable if **all four** hold on iPhone 15 Pro:

| # | Criterion | Threshold |
|---|-----------|-----------|
| 1 | TTFT (median) | < 1500 ms |
| 2 | Tokens/sec (median) | > 8 |
| 3 | Peak memory (median) | < 1.5 GB |
| 4 | Adequacy (mean across 30 prompts) | >= 3.5 / 5 |

For iPhone 13 base (oldest supported), criterion (1) is relaxed to < 2500 ms and criterion (2) to > 5 tok/s. Criteria (3) and (4) are unchanged.

If no single candidate satisfies all four on both devices, we ship the best on iPhone 15 Pro and fall back to a smaller model on iPhone 13. The "Recommendation" section below records that split once data lands.

## Methodology

### Eval set

30 prompts, fixed across runs, split four ways. Source: `apps/ios/Sources/HMANBench/EvalSet.swift`.

| Category | Count | What it tests |
|----------|-------|---------------|
| Drafting | 10 | GitHub issues, Signal replies, journal entries, calendar blocks, commit messages — the bulk of HMAN's output |
| Summarizing | 7 | Screen activity, ambient transcript, commit log, notification triage |
| Reasoning about state | 7 | Multi-signal inferences (HR + EEG + calendar) of the kind the gates need to surface |
| Refusal / boundary | 6 | Requests that breach the consent / gate model — the model should refuse or defer |

The exact prompts live in code. Bumping them requires bumping `BenchHarness.harnessVersion` so old result JSONs are flagged stale.

### Per-prompt protocol

Each candidate runs the eval set exactly once per device. For each prompt:

- Cold-start memory measured before `generate(prompt:)`
- TTFT measured from `generate` invocation to first emitted token
- Tokens/sec computed across the full completion (final token count / total wall time)
- Peak memory sampled via `mach_task_basic_info` during generation
- Reply text persisted in the results JSON for the manual scoring pass

The harness writes one JSON per (candidate, device, date) at `apps/ios/Bench/results/<candidate>-<deviceModel>-<YYYY-MM-DD>.json`. The reviewer fills in 1-5 adequacy scores via `hman-bench score --file <results.json>` (or by editing the JSON directly). `Reporter.swift` consumes the scored JSONs and renders the table below.

### Run procedure

1. Build the bench app target on a Mac with the device attached:
   ```
   xcodebuild -scheme HMANBench -destination 'platform=iOS,name=<device>' build
   ```
2. Launch on device, select candidate + device label, hit Run. Eval set takes ~3-8 minutes per candidate depending on tok/s.
3. AirDrop the resulting JSON back to the dev machine.
4. Score interactively: `swift run hman-bench score --file <path>`.
5. Regenerate the table: `swift run hman-bench report --results-dir apps/ios/Bench/results`. Paste output into the "Results" section below.

CI does **not** run the bench. The `swift build` / `swift test` jobs validate the harness scaffold; real-device runs are manual.

## Candidates

| Short name | What it is | Notes |
|------------|------------|-------|
| `apple-foundation` | iOS 18.5+ system Foundation Models | Free; Apple controls behavior. iOS 18.5 minimum gates older hardware. |
| `mlc-gemma-2b-q4f16_1` | Gemma 2B via [MLC LLM](https://github.com/mlc-ai/mlc-llm) | q4f16_1 quant, baseline pick. |
| `mlc-gemma-3b-q4f16_1` | Gemma 3B via MLC LLM | Same engine, more parameters; may exceed memory budget on iPhone 13. |
| `phi3-mini-mlc-q4f16_1` | Phi-3 Mini (3.8B) via MLC LLM | Strongest instruction-following candidate; biggest RAM footprint. |
| `phi3-mini-llamacpp-q4_K_M` | Phi-3 Mini via llama.cpp Swift port | Same model, alternate backend. |
| `mlc-llama-3.2-1b-q4f16_1` | Llama 3.2 1B via MLC LLM | Fallback for older / lower-RAM devices. |

Each candidate has a stub at `apps/ios/Sources/HMANBench/Candidates/`. Real integration is one PR per candidate.

## Results

<!-- BEGIN bench-results-table -->
*Empty until a real-device run lands. Populate with `swift run hman-bench report --results-dir apps/ios/Bench/results`.*

| Candidate | Device | TTFT (ms, median) | tok/s (median) | Peak mem (MB, median) | Adequacy (mean, scored / total) | Successes / total |
|-----------|--------|-------------------|----------------|------------------------|----------------------------------|--------------------|
| Apple Foundation Models (iOS 18.5+) | iPhone 15 Pro | — | — | — | — (0 / 30) | 0 / 30 |
| Apple Foundation Models (iOS 18.5+) | iPhone 13 | — | — | — | — (0 / 30) | 0 / 30 |
| Gemma 2b via MLC (q4f16_1) | iPhone 15 Pro | — | — | — | — (0 / 30) | 0 / 30 |
| Gemma 2b via MLC (q4f16_1) | iPhone 13 | — | — | — | — (0 / 30) | 0 / 30 |
| Phi-3 Mini via MLC (q4f16_1) | iPhone 15 Pro | — | — | — | — (0 / 30) | 0 / 30 |
| Phi-3 Mini via MLC (q4f16_1) | iPhone 13 | — | — | — | — (0 / 30) | 0 / 30 |
| Llama 3.2 1B via MLC (q4f16_1) | iPhone 15 Pro | — | — | — | — (0 / 30) | 0 / 30 |
| Llama 3.2 1B via MLC (q4f16_1) | iPhone 13 | — | — | — | — (0 / 30) | 0 / 30 |

<!-- END bench-results-table -->

### Latency histograms

TODO: per-candidate histogram of TTFT across the 30 prompts (one figure per device). Use the per-prompt JSON entries in the results files.

TODO: per-candidate histogram of tok/s.

These are deferred to follow-up — the values come straight out of the JSON, but the rendering is matplotlib / a static SVG check-in rather than something the Swift CLI builds.

### Per-category adequacy

TODO: when scored data lands, render a 4xN table of mean adequacy by category (drafting / summarizing / reasoning / refusal). Particularly important for the refusal category — a candidate that aces drafting but fails refusal is disqualified regardless of its other numbers.

## Recommendation

*Empty until data lands. Format expected:*

> **v1 pick:** `<candidate>` — passes all four criteria on iPhone 15 Pro and degrades acceptably on iPhone 13.
>
> **Fallback for iPhone 13 / older:** `<candidate>` — chosen because [memory headroom / TTFT / etc.].
>
> **Reasoning:** [one paragraph on why this candidate over the runner-up; cite the cells that drove the decision].
>
> **Disqualified:** [list candidates that failed a hard criterion and which one].

## Open questions for the run

These are the calls the reviewer running the bench has to make in real time:

- **Apple Foundation Models on iOS 17.x:** the candidate is gated on iOS 18.5. We need to either (a) raise the deployment target before shipping, or (b) record this candidate as "iPhone 15 Pro only" and pick a fallback that covers iOS 17.
- **MLC binary size:** the MLC iOS runtime adds ~150 MB to the app. If two MLC candidates win their cells, we ship the engine once and switch models at runtime — but that's a follow-up after the pick is made.
- **Phi-3 on iPhone 13 base:** suspected to exceed the 1.5 GB peak memory budget. Confirm with a real run before disqualifying.
- **Quantization sensitivity:** all MLC numbers above are for `q4f16_1`. If the front-runner is borderline on adequacy, run a second pass at `q4f32_1` to see if the higher-precision quant clears the bar without breaking criteria 1-3.
