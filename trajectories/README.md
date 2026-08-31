Coding-agent trajectories for the micro1 submission. Each file is one Claude Code session export (instructions → tool calls → tool results → retries → human checkpoints).

Export from Claude Code with `/export` (or copy the transcript from `~/.claude/projects/<project>/`). Add one line per file below.

| File | What the session did |
|---|---|
| `session-build-and-ship.jsonl` | Full build session: local setup debugging (Postgres refused → Homebrew, wrong port), swapping the Anthropic SDK for a fetch-based OpenAI-compatible client after the API key turned out to be Gemini/DeepSeek, verifying structured-output and streaming against Gemini and Ollama with curl before changing code, the UI redesign (mockups on a canvas → applied to `page.tsx`/`review/page.tsx`, screenshot-verified at 1200px and 390px), a read-only second-pass agent whose contrast/hit-target findings were applied, the eval script crashing on top-level await (fixed by `run.ts` → `run.mts`), and the eval run that produced `eval/results/*.json`. Human checkpoints: provider choice, Ollama install (interrupted, then resumed), design direction ("go ahead"), and the submission checklist. |
