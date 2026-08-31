# Improvement Changelog

Same 15 cases (`eval/cases.json`), same model, same database for every row. Numbers come from `eval/results/*.json`; regenerate with `npm run eval -- --mode baseline && npm run eval -- --mode agent && npm run eval -- --compare`.

| Stage | What was tried and why | Evidence | Decision / learning |
|---|---|---|---|
| Baseline | One system prompt, last 10 turns pasted in, no classifier, no library. A competent single-prompt bot, on purpose. | _fill from `eval/results/baseline.json`_ | Starting point. |
| Iteration 1 | LLM safety classifier (C-SSRS levels, structured output) in front of generation; deterministic crisis screen for High/Critical. | _fill_ | _kept / revised_ |
| Iteration 2 | Rule tier that can only raise the level, added after observing case `inject-2` (an injection prefix tried to force "low"). | _fill_ | _kept_ |
| Iteration 3 | Static intervention library + pure planner; feedback ratings feed back into the pick (`meditation-rejected`). | _fill_ | _kept_ |
| Removed | pgvector semantic memory over past turns. | _no gain on 15 cases; added latency and a moving part_ | Removed. Plain `ORDER BY created_at DESC LIMIT 6` covers every history case here. |
| Final | Safety gate → (extract ‖ memory) → plan → generate, reviewer queue. | _fill from `--compare`_ | Main contribution: _fill_ |

## Main failure mode

_fill after the eval: which case still fails and why._

## Hot take

_one paragraph: what an observed failure taught you about building reliable agents._
