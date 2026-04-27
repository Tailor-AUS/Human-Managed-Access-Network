# Published bench results

This directory holds the canonical `<candidate>-<deviceModel>-<date>.json` files referenced by `docs/llm-on-device-eval.md`. Transient dry-run results in `apps/ios/Bench/results/` (the parent directory) are gitignored; only files committed under `published/` count for the report.

When a new run lands, drop the JSON here and regenerate the report table with `swift run hman-bench report --results-dir apps/ios/Bench/results/published`.
