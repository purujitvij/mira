import crypto from "node:crypto";
import { q } from "@/lib/db";
import { traced, type Ctx } from "@/lib/trace";
import crisis from "@/data/crisis-resources.json";
import { classifySafety } from "./safety";
import { extractState } from "./extract";
import { planIntervention } from "./plan";
import { generateReply } from "./generate";
import { recentHistory, ratingsFor, detectPattern } from "./memory";
import { rank, type Event, type Resource } from "./types";

const RESOURCES = crisis.resources as Resource[];
const CRISIS_TEXT =
  "It sounds like you're in a lot of pain right now, and I'm really glad you said it here. I'm not able to keep you safe on my own, and you deserve support from a real person tonight. Please reach one of these now — they are free and available 24/7. If you're in immediate danger, go to the nearest emergency room.";
const SOFT_RESOURCE = " If things get heavier, Tele MANAS is free and open 24/7: 14416.";

export function newCtx(userId: string): Ctx {
  return { requestId: crypto.randomUUID(), userId };
}

/** Advanced solution: safety gate -> (extract ‖ memory) -> plan (pure) -> generate (stream). */
export async function* runAgent(ctx: Ctx, message: string): AsyncGenerator<Event> {
  const t0 = Date.now();

  // Safety and extraction both need only the raw message, so they run in parallel with the memory reads.
  const [safety, extracted, history, ratings] = await Promise.all([
    traced(ctx, "safety", () => classifySafety(message)),
    traced(ctx, "extract", () => extractState(message)),
    recentHistory(ctx.userId),
    ratingsFor(ctx.userId),
  ]);
  yield { type: "safety", level: safety.level, rule: safety.rule, llm: safety.llm };

  const disagree = safety.llm !== null && safety.llm !== safety.rule && safety.rule !== "low";
  if (rank(safety.level) >= rank("moderate") || disagree) {
    await q("INSERT INTO review_queue (user_id,message,rule_level,llm_level,final_level) VALUES ($1,$2,$3,$4,$5)",
      [ctx.userId, message, safety.rule, safety.llm, safety.level]);
  }

  if (rank(safety.level) >= rank("high")) {
    // Deterministic crisis flow. No generation, no planner.
    yield { type: "crisis", resources: RESOURCES, text: CRISIS_TEXT };
    await saveTurn(ctx, message, CRISIS_TEXT, safety.level, null, null);
    yield { type: "done", requestId: ctx.requestId, ms: Date.now() - t0 };
    return;
  }

  const state = extracted.state;
  yield { type: "state", state };

  const pattern = await traced(ctx, "pattern", async () => ({ text: await detectPattern(ctx.userId, state) })).then((r) => r.text);
  yield { type: "pattern", text: pattern };

  const plan = await traced(ctx, "plan", async () => ({ ...planIntervention(state, ratings), meta: { ratings: Object.keys(ratings).length } }));
  yield { type: "intervention", intervention: plan.intervention, reason: plan.reason };

  let reply = "";
  const gen = generateReply({ message, history, state, intervention: plan.intervention, pattern });
  const tg0 = Date.now();
  let next = await gen.next();
  while (!next.done) { reply += next.value; yield { type: "token", text: next.value }; next = await gen.next(); }
  if (safety.level === "moderate") { reply += SOFT_RESOURCE; yield { type: "token", text: SOFT_RESOURCE }; }
  await traced(ctx, "generate", async () => ({ usage: next.value, meta: { chars: reply.length, streamed_ms: Date.now() - tg0 } }));

  await saveTurn(ctx, message, reply, safety.level, state, plan.intervention?.id ?? null);
  yield { type: "done", requestId: ctx.requestId, ms: Date.now() - t0 };
}

export async function saveTurn(ctx: Ctx, user: string, assistant: string, level: string | null, state: unknown, interventionId: string | null) {
  await q("INSERT INTO messages (user_id,role,content,safety_level,state) VALUES ($1,'user',$2,$3,$4)", [ctx.userId, user, level, state ? JSON.stringify(state) : null]);
  await q("INSERT INTO messages (user_id,role,content,intervention_id) VALUES ($1,'assistant',$2,$3)", [ctx.userId, assistant, interventionId]);
}
