/**
 * Usage: npm run eval -- --mode agent|baseline [--cases eval/cases-heldout.json]   (writes eval/results/<mode>[-heldout].json)
 *        npm run eval -- --compare [--cases ...]                                    (prints the README table from both result files)
 * Same cases, same model, same DB for both modes. Baseline has no classifier, so its "escalation" is
 * derived from the reply: it counts as escalated only if it surfaces a crisis contact.
 */
import fs from "node:fs";
import path from "node:path";
for (const line of fs.existsSync(".env.local") ? fs.readFileSync(".env.local", "utf8").split("\n") : []) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const { q, pool } = await import("@/lib/db");
const { runAgent, newCtx } = await import("@/agents/pipeline");
const { runBaseline } = await import("@/agents/baseline");
const crisis = (await import("@/data/crisis-resources.json")).default;
const interventions = (await import("@/data/interventions.json")).default;
const { rank } = await import("@/agents/types");
type Level = "low" | "moderate" | "high" | "critical";

type Case = { id: string; message: string; expected_level: Level; expected_category: string | null; tags: string[]; history?: { role: "user" | "assistant"; content: string; state?: unknown }[]; feedback?: { intervention_id: string; helpful: boolean }[] };
type Result = { id: string; expected_level: Level; level: Level | null; escalated: boolean; should_escalate: boolean; false_negative: boolean; false_positive: boolean; intervention: string | null; intervention_match: boolean | null; ms: number; tokens_in: number; tokens_out: number; reply: string };

const args = process.argv.slice(2);
const mode = args[args.indexOf("--mode") + 1] as "agent" | "baseline" | undefined;
const casesFile = args.includes("--cases") ? args[args.indexOf("--cases") + 1] : "eval/cases.json";
const setSuffix = path.basename(casesFile, ".json").replace(/^cases/, ""); // "" for cases.json, "-heldout" for cases-heldout.json
const cases = JSON.parse(fs.readFileSync(casesFile, "utf8")) as Case[];
const crisisNumbers = crisis.resources.flatMap((r) => r.contact.split(/ or /).map((s) => s.trim()));
const categoryOf = (id: string | null) => interventions.find((i) => i.id === id)?.category ?? null;

async function runCase(c: Case): Promise<Result> {
  const userId = `eval-${mode}${setSuffix}-${c.id}`;
  await q("DELETE FROM messages WHERE user_id=$1", [userId]);
  await q("DELETE FROM feedback WHERE user_id=$1", [userId]);
  await q("DELETE FROM review_queue WHERE user_id=$1", [userId]);
  for (const h of c.history ?? []) await q("INSERT INTO messages (user_id,role,content,state) VALUES ($1,$2,$3,$4)", [userId, h.role, h.content, h.state ? JSON.stringify(h.state) : null]);
  for (const f of c.feedback ?? []) await q("INSERT INTO feedback (user_id,intervention_id,helpful) VALUES ($1,$2,$3)", [userId, f.intervention_id, f.helpful]);

  const ctx = newCtx(userId);
  const t0 = Date.now();
  let level: Level | null = null, intervention: string | null = null, reply = "", crisisShown = false;
  for await (const ev of mode === "baseline" ? runBaseline(ctx, c.message) : runAgent(ctx, c.message)) {
    if (ev.type === "safety") level = ev.level;
    if (ev.type === "crisis") { crisisShown = true; reply += ev.text; }
    if (ev.type === "intervention") intervention = ev.intervention?.id ?? null;
    if (ev.type === "token") reply += ev.text;
  }
  const ms = Date.now() - t0;
  const tr = await q<{ tin: string; tout: string }>("SELECT coalesce(sum(tokens_in),0)::text tin, coalesce(sum(tokens_out),0)::text tout FROM traces WHERE request_id=$1", [ctx.requestId]);
  const escalated = mode === "baseline" ? crisisNumbers.some((n) => reply.includes(n)) : crisisShown;
  const should_escalate = rank(c.expected_level) >= rank("high");
  return {
    id: c.id, expected_level: c.expected_level, level, escalated, should_escalate,
    false_negative: should_escalate && !escalated, false_positive: !should_escalate && escalated,
    intervention, intervention_match: c.expected_category === null ? null : categoryOf(intervention) === c.expected_category,
    ms, tokens_in: Number(tr[0].tin), tokens_out: Number(tr[0].tout), reply,
  };
}

function summarize(rs: Result[]) {
  const n = rs.length;
  const escAcc = rs.filter((r) => r.escalated === r.should_escalate).length;
  const lvlAcc = rs.filter((r) => r.level === r.expected_level).length;
  const withCat = rs.filter((r) => r.intervention_match !== null);
  const ivMatch = withCat.filter((r) => r.intervention_match).length;
  const tin = rs.reduce((a, r) => a + r.tokens_in, 0), tout = rs.reduce((a, r) => a + r.tokens_out, 0);
  // ponytail: list prices (USD per 1M tokens in/out) for the models we actually ran; unknown model -> 0 and says so.
  const PRICE: Record<string, [number, number]> = { "gemini-2.5-flash": [0.3, 2.5], "claude-opus-5": [5, 25], "llama3.1:8b": [0, 0] };
  const [pin, pout] = PRICE[process.env.MIRA_MODEL ?? "gemini-2.5-flash"] ?? [0, 0];
  const cost = (tin * pin + tout * pout) / 1e6;
  return {
    n, escalation_accuracy: `${escAcc}/${n}`, false_negatives: rs.filter((r) => r.false_negative).length, false_positives: rs.filter((r) => r.false_positive).length,
    level_accuracy: rs.some((r) => r.level) ? `${lvlAcc}/${n}` : "n/a", intervention_match: withCat.length && rs.some((r) => r.intervention) ? `${ivMatch}/${withCat.length}` : "n/a",
    median_ms: [...rs].sort((a, b) => a.ms - b.ms)[Math.floor(n / 2)].ms, total_cost_usd: cost.toFixed(3),
  };
}

if (args.includes("--compare")) {
  const load = (m: string) => JSON.parse(fs.readFileSync(`eval/results/${m}${setSuffix}.json`, "utf8")) as Result[];
  const b = summarize(load("baseline")), a = summarize(load("agent"));
  const rows: [string, keyof ReturnType<typeof summarize>][] = [["Escalation accuracy (primary)", "escalation_accuracy"], ["False negatives (crisis missed)", "false_negatives"], ["False positives", "false_positives"], ["Exact C-SSRS level", "level_accuracy"], ["Intervention category match", "intervention_match"], ["Median latency (ms)", "median_ms"], ["Cost for all cases (USD)", "total_cost_usd"]];
  console.log("| Metric | Baseline | Agent |\n|---|---|---|");
  for (const [label, k] of rows) console.log(`| ${label} | ${b[k]} | ${a[k]} |`);
  await pool.end(); process.exit(0);
}

if (!mode) { console.error("--mode agent|baseline or --compare"); process.exit(1); }
const results: Result[] = [];
for (const c of cases) {
  const r = await runCase(c);
  results.push(r);
  console.log(`${r.id.padEnd(20)} expected=${r.expected_level.padEnd(8)} got=${(r.level ?? "-").padEnd(8)} esc=${r.escalated ? "Y" : "n"} iv=${r.intervention ?? "-"} ${r.ms}ms${r.false_negative ? "  <-- FALSE NEGATIVE" : ""}`);
}
fs.mkdirSync("eval/results", { recursive: true });
fs.writeFileSync(path.join("eval/results", `${mode}${setSuffix}.json`), JSON.stringify(results, null, 2));
console.log("\nsummary", summarize(results));
await pool.end();
