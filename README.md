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

Both run the same model (`MIRA_MODEL`, default `gemini-2.5-flash`), the same database, and the same 15 evaluation cases. The baseline sees the last 10 turns; the agent sees 6 plus ratings — the baseline is not resource-starved.

## Results

_Paste the output of `npm run eval -- --compare` here._

See [CHANGELOG.md](CHANGELOG.md) for how each iteration moved these numbers, including the experiment that was removed.

## Reproduce (clean machine)

Requires Node 20+, Postgres (Docker or Homebrew), and an OpenAI-compatible LLM key — Gemini's free tier at aistudio.google.com works out of the box.

```bash
git clone <this repo> && cd mira
cp .env.example .env.local          # put your LLM_API_KEY in .env.local
npm ci
npm run db:up                       # Postgres 17 in Docker on localhost:5433 (schema auto-applies on first query)
                                    # no Docker? `brew install postgresql@17 && brew services start postgresql@17`,
                                    # createuser -s mira; createdb -O mira mira; set port 5432 in .env.local
npm test                            # rule tier + planner unit checks, no API calls
npm run eval -- --mode baseline     # ~15 API calls
npm run eval -- --mode agent        # ~45 API calls
npm run eval -- --compare           # prints the results table above
npm run dev                         # http://localhost:3000  (mode switch top-right; /review; /trace/<id>)
```

Expected: `eval/results/baseline.json` and `eval/results/agent.json`, and a markdown table on stdout. Approximate runtime on Gemini free tier (10 req/min; the client retries on 429): 8–12 minutes for both runs. Cost: $0 on the free tier; at list price well under $0.10 (printed per run as `total_cost_usd`). Fully offline alternative: Ollama with `llama3.1:8b` — set `LLM_BASE_URL=http://localhost:11434/v1`, expect weaker classifier numbers and ~3× the runtime on an M-series laptop.

Versions: Node 20+ (tested on 26), Postgres 17, pinned in `package-lock.json` (Next 16.3, `pg` 8, `zod` 4, `tsx` 4). Data: synthetic only — `eval/cases.json` and whatever you type.

## Layout

```
src/agents/safety.ts     rule tier + LLM classifier          src/app/api/chat/route.ts   SSE endpoint (agent|baseline)
src/agents/extract.ts    quarantined state extraction        src/app/page.tsx            chat UI, exercise card, crisis screen
src/agents/plan.ts       pure planner over the library       src/app/review/page.tsx     human reviewer queue
src/agents/generate.ts   streamed reply, fixed fallback      src/app/trace/[id]/page.tsx per-request node trace
src/agents/memory.ts     history, ratings, pattern           eval/run.mts, eval/cases.json
src/agents/pipeline.ts   orchestration + baseline.ts         tests/*.test.ts
```

Every node logs one JSON line with `request_id`, latency, tokens, and non-sensitive metadata; raw message text is never in traces.

## Safety notes

- Crisis resources live in `src/data/crisis-resources.json`. **Verify each number by phone before relying on them.**
- If the classifier model is unreachable, the gate fails toward `high` (shows resources, halts generation). Over-escalation is the accepted failure mode.
- A qualified human is expected to work the `/review` queue; the app never takes real-world actions.

## Agent tools used to build this

Claude Code (Claude Fable 5). Representative trajectories are in `trajectories/` — see `trajectories/README.md`.
