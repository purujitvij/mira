# MIRA — an adaptive wellness check-in that knows when to stop talking

**Who has this problem.** Someone who uses a wellness app after work, gets the same breathing exercise every day, and quits in week two. Unguided digital wellness tools lose most users because they can't adapt — and, more seriously, they can't tell a bad day from a crisis.

**The bottleneck.** A single-prompt chatbot has no memory of what helped, no way to notice a pattern across days, and no deterministic path when a message signals risk: it "counsels" when it should hand off.

**Why it matters.** The same person, checked in with over a week, should get a different next step than on day one — and a person in crisis should get a phone number, not a paragraph.

MIRA is not a therapist, not a diagnostic tool, and never claims it can keep someone safe. It offers a check-in, one evidence-informed exercise from a fixed library, and — when a message crosses a threshold — a fixed screen with verified local resources plus a human reviewer queue.

## What existed before, what was added

Starting point: `create-next-app` (the single pre-existing commit, `84b0dc6`). Everything else — `src/agents/`, `src/lib/`, `src/app/api|review|trace`, `db/`, `eval/`, `tests/`, this README — was written during the challenge window (Aug 28–31, 2026) with Claude Code. Third-party components used as-is: Next.js, Postgres, `pg`, `zod`, Tailwind, and the LLM provider behind an OpenAI-compatible endpoint.

## Baseline vs. agent

| | Baseline | Agent |
|---|---|---|
| Flow | one prompt, last 10 turns pasted in | safety gate → (state extraction ‖ memory) → planner → generator |
| Safety | model alignment only | rule tier (can only raise the level) + LLM classifier, mapped to C-SSRS; High/Critical → static crisis screen, no generation |
| Exercises | whatever the model invents | 10-item library, chosen by a pure function over extracted state + past ratings |
| Memory | transcript only | last 6 turns + per-intervention ratings + a non-causal pattern sentence |
| Oversight | none | `/review` queue for every High/Critical call and rule/LLM disagreement |

Both run the same model (`MIRA_MODEL`, default `gemini-3.6-flash`), the same database, and the same 15 evaluation cases. The baseline sees the last 10 turns; the agent sees 6 plus ratings — the baseline is not resource-starved.

## Results

Two models, same code, same three case sets, same baseline. Tables are the verbatim output of `npm run eval -- --compare [--cases …] [--tag gemini]`; raw per-case output with every reply is in [`eval/results/`](eval/results/).

- **Gemini 3.6 Flash** (hosted, billed key) — run on the final code. Primary tables.
- **Llama 3.1 8B** (via a local Ollama server, since removed — not required for anything) — run on the code as of Iteration 4, before Iteration 5 (planner vent gate, `f80cc21`). Kept as evidence: the gap between the two models is part of the story.

### Gemini 3.6 Flash

**Original 15 cases** (`eval/cases.json`) — the set the rule tier was developed against.

| Metric | Baseline | Agent |
|---|---|---|
| Escalation accuracy (primary) | 10/15 | 14/15 |
| False negatives (crisis missed) | 5 | 0 |
| False positives | 0 | 1 |
| Exact C-SSRS level | n/a | 14/15 |
| Intervention category match | n/a | 3/5 |
| Median latency (ms) | 5550 | 5972 |

**Held-out 16 cases** (`eval/cases-heldout.json`) — written *after* the rule tier was frozen at `c55ad81`, phrased to avoid the regex trigger words. The regex tier fired on **0 of 16**.

| Metric | Baseline | Agent |
|---|---|---|
| Escalation accuracy (primary) | 11/16 | 16/16 |
| False negatives (crisis missed) | 5 | 0 |
| False positives | 0 | 0 |
| Exact C-SSRS level | n/a | 16/16 |
| Intervention category match | n/a | 4/4 |
| Median latency (ms) | 5386 | 6357 |

**Memory loop, 6 cases** (`eval/cases-memory.json`) — prior ratings or prior check-ins are seeded and the pick is asserted against them.

| Metric | Baseline | Agent |
|---|---|---|
| Memory respected (ratings / pattern) | 3/6 | 5/6 |
| Intervention category match | n/a | 2/4 |

Tokens for all three agent runs: ≈25k in+out (printed per run); at Flash-class list prices well under $0.10. Baseline runs ≈10k.

### Llama 3.1 8B (historical, Iteration-4 code)

| Metric | Original 15 — Baseline | Agent | Held-out 16 — Baseline | Agent | Memory 6 — Agent |
|---|---|---|---|---|---|
| Escalation accuracy (primary) | 10/15 | 15/15 | 11/16 | 16/16 | 6/6 |
| False negatives (crisis missed) | 5 | 0 | 5 | 0 | 0 |
| False positives | 0 | 0 | 0 | 0 | 0 |
| Exact C-SSRS level | n/a | 15/15 | n/a | 13/16 | 6/6 |
| Intervention category match | n/a | 2/5 | n/a | 2/4 | 1/4 |
| Memory respected | — | — | — | — | 5/6 |
| Median latency (ms) | 3801 | 8656 | 4724 | 15782 | 9441 |

### What the numbers say

- **The baseline missed every crisis case on both models and both sets** (20 of 20). It replied warmly and never surfaced a phone number. The agent showed the crisis screen on all 20.
- **The rule tier is a floor, not the result.** On the 8B model it outranked the classifier on `selfharm-1` and `plan-2` (model said *moderate*). On Gemini it never disagreed upward once, and on the held-out set it never fired for either model — the primary metric does not depend on regexes that saw the test set. What the tier buys is survival on a weaker model or a worse day.
- **Model quality shows up exactly where the design leans on the model.** Escalation is the same on both (deterministic scaffolding); exact level is 16/16 on Gemini vs 13/16 on the 8B (three *critical* under-called as *high*); intervention match is 4/4 vs 2/4 on held-out. The deterministic parts transfer; the judgment parts scale with the model.
- **The one Gemini false positive is a transport error, not a judgment.** `rel-1` (a fight with a sister) got `fetch failed` on the classifier call after 367 ms; the gate fails toward *high* by design and showed the crisis screen. On the 8B model the false positives were judgment: the injection prompt classified *high*/*critical* in 2 of 4 runs. Both fail in the safe direction; the transport case is why the client now has a 60 s abort and the classifier failure is logged to the reviewer queue.
- **Iteration 5 is the model swap paying for itself.** Gemini labels most check-ins `wants: vent` while naming the right `need`; the planner's old "vent → no exercise" rule, calibrated on an 8B model that rarely said vent, hid every exercise: original-set match 1/5, memory 4/6. Suppressing only when no need is named: 3/5 and 5/6, held-out unchanged at 4/4 (`*.gemini.before-vent.json` vs `*.gemini.json`).
- **The memory loop's one miss is the same on both models**: `walk-5`, rated helpful twice, loses to `reframe` — on Gemini because the model reads "running on empty" as `need: reframing` (+4) and two votes are worth +4, tie broken by duration. A rating weight of 3 would flip it; deliberately not applied, it would be tuned to one case.
- **Replies no longer claim a pattern from history when there is none** (3/15 in the first run → 0 across every later run and set) and no longer echo internal labels ("exercise card shown to you") — regex over the `reply` fields.
- Latency: Gemini ≈6 s per agent turn (three calls, thinking model at low effort) vs 5.5 s baseline; the 8B model 9–16 s vs 4 s.

See [CHANGELOG.md](CHANGELOG.md) for how each iteration moved these numbers, including the experiment that was removed.

## Reproduce (clean machine)

Requires Node 20+, Postgres (Docker, Homebrew, or a Supabase project), and a Google AI Studio key with **billing enabled** on its project (Gemini's free tier — 5 requests/minute on `gemini-3.6-flash`, 20/day on `gemini-2.5-flash` — is too small for the eval; a full run of all three sets is a few cents). Nothing runs locally except Node and, if you choose it, Postgres.

```bash
git clone https://github.com/purujitvij/mira.git && cd mira
cp .env.example .env.local          # put your Gemini key in LLM_API_KEY; DATABASE_URL as below
npm ci
npm run db:up                       # Postgres 17 in Docker on localhost:5433 (schema auto-applies on first query)
                                    # no Docker? `brew install postgresql@17 && brew services start postgresql@17`,
                                    # createuser -s mira; createdb -O mira mira; set port 5432 in .env.local
                                    # or a Supabase pooler URL — see "Deploy" below; same code either way
npm test                            # rule tier + planner unit checks, no model calls
for set in cases cases-heldout cases-memory; do
  npm run eval -- --mode baseline --cases eval/$set.json --tag gemini
  npm run eval -- --mode agent    --cases eval/$set.json --tag gemini
  npm run eval -- --compare       --cases eval/$set.json --tag gemini   # the three Gemini tables above
done
npm run dev                         # http://localhost:3000  (mode switch top-right; /review; /trace/<id>)
```

Expected: `eval/results/{baseline,agent}[-heldout|-memory].gemini.json` and a markdown table on stdout per set. Models are not deterministic: expect escalation within ±1 of the tables, exact level within ±2, intervention picks to vary. Crisis cases have escalated in every run of every set. Runtime ≈2 min per set (≈6 min for all three); ≈35k tokens total. Two things the client does for Gemini 3.x specifically (`src/lib/llm.ts`): it floors `max_tokens` at 1500 and sends `reasoning_effort: low`, because the model spends output tokens on reasoning before the JSON and a 300-token budget came back as truncated JSON; and every call aborts at 60 s after one call stalled for 251 s mid-eval.

Any other OpenAI-compatible endpoint works with the same three variables (`LLM_BASE_URL`, `LLM_API_KEY`, `MIRA_MODEL`) and a different `--tag`: the Llama 3.1 8B tables were produced that way with a local Ollama server, which is optional and no longer part of the setup.

Versions: Node 20+ (tested on 26), Postgres 17, pinned in `package-lock.json` (Next 16.3, `pg` 8, `zod` 4, `tsx` 4). Data: synthetic only — `eval/cases.json` and whatever you type.

## Deploy (Supabase + Vercel)

The database layer is plain `pg`; Supabase is just hosted Postgres.

1. Supabase → New project → **Connect** → copy the **Transaction pooler** connection string (port 6543). Nothing to create by hand: the schema applies itself on the first request.
2. Vercel → Import the repo → Environment variables: `DATABASE_URL` (the string from step 1), `LLM_BASE_URL`, `LLM_API_KEY`, `MIRA_MODEL` (a hosted model — Ollama on localhost is not reachable from Vercel). Deploy.
3. Open `/`, send a message, then `/review` — the tables exist the moment the first request lands.

Notes: use the **Transaction pooler** string (`…pooler.supabase.com:6543`), not the direct one (`db.<ref>.supabase.co:5432`) — direct connections are IPv6-only on Supabase and unreachable from Vercel, though they work from a laptop. `db/schema.sql` enables row-level security on every table with no policies, so nothing is readable through Supabase's REST API with the publishable key (verified: `GET /rest/v1/messages` returns `[]`); the app connects as the table owner and is unaffected. `src/lib/db.ts` turns on TLS and shrinks the pool to 3 whenever `DATABASE_URL` is not localhost; `next.config.ts` bundles `db/schema.sql` into the functions; `api/chat` declares `maxDuration = 60` because an agent turn is three model calls plus a streamed reply. The eval scripts run from a laptop against the same `DATABASE_URL` if you want the results tables to live in Supabase too.

## Layout

```
src/agents/safety.ts     rule tier + LLM classifier          src/app/api/chat/route.ts   SSE endpoint (agent|baseline)
src/agents/extract.ts    quarantined state extraction        src/app/page.tsx            chat UI, exercise card, crisis screen
src/agents/plan.ts       pure planner over the library       src/app/review/page.tsx     human reviewer queue
src/agents/generate.ts   streamed reply, fixed fallback      src/app/trace/[id]/page.tsx per-request node trace
src/agents/memory.ts     history, ratings, pattern           eval/run.mts, eval/cases.json
src/agents/pipeline.ts   orchestration + baseline.ts         tests/*.test.ts, eval/cases{,-heldout,-memory}.json
```

Every node logs one JSON line with `request_id`, latency, tokens, and non-sensitive metadata; raw message text is never in traces.

## Safety notes

- Crisis resources live in `src/data/crisis-resources.json`. **Verify each number by phone before relying on them.**
- If the classifier model is unreachable, the gate fails toward `high` (shows resources, halts generation). Over-escalation is the accepted failure mode.
- A qualified human is expected to work the `/review` queue; the app never takes real-world actions.

## Agent tools used to build this

Claude Code (Claude Fable 5). Representative trajectories are in `trajectories/` — see `trajectories/README.md`.
