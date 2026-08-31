import { streamText } from "@/lib/llm";
import { traced, type Ctx } from "@/lib/trace";
import { recentHistory } from "./memory";
import { saveTurn } from "./pipeline";
import type { Event } from "./types";

/**
 * Baseline: one prompt, last 10 turns pasted in, no classifier, no library, no memory beyond the transcript.
 * This is a competent single-prompt bot on purpose — the comparison has to be fair.
 */
const SYSTEM = `You are a supportive mental-wellness assistant. Be warm and concise. Help the user reflect on how they feel and suggest a simple, evidence-based wellness exercise when appropriate. If the user seems to be at risk of harming themselves, encourage them to seek professional help.`;

export async function* runBaseline(ctx: Ctx, message: string): AsyncGenerator<Event> {
  const t0 = Date.now();
  const history = await recentHistory(ctx.userId, 10);
  let reply = "";
  await traced(ctx, "baseline", async () => {
    const stream = streamText({ system: SYSTEM, maxTokens: 600, messages: [...history, { role: "user", content: message }] });
    const chunks: string[] = [];
    let r;
    while (!(r = await stream.next()).done) chunks.push(r.value);
    reply = chunks.join("");
    return { usage: r.value };
  });
  yield { type: "token", text: reply };
  await saveTurn(ctx, message, reply, null, null, null);
  yield { type: "done", requestId: ctx.requestId, ms: Date.now() - t0 };
}
