import { q } from "./db";
import type { Usage } from "./llm";

export type Ctx = { requestId: string; userId: string; name?: string | null };

/** Times a node, logs one JSON line, persists to `traces`. No raw user content goes into meta. */
export async function traced<T>(
  ctx: Ctx,
  node: string,
  fn: () => Promise<T & { usage?: Usage; meta?: Record<string, unknown> }>,
): Promise<T> {
  const t0 = Date.now();
  let meta: Record<string, unknown> = {};
  let usage: Usage = { tokens_in: 0, tokens_out: 0 };
  try {
    const out = await fn();
    meta = out.meta ?? {};
    usage = out.usage ?? usage;
    return out;
  } catch (e) {
    meta = { error: e instanceof Error ? e.message : String(e) };
    throw e;
  } finally {
    const ms = Date.now() - t0;
    const row = { request_id: ctx.requestId, user_id: ctx.userId, node, ms, ...usage, ...meta };
    console.log(JSON.stringify(row));
    q(
      "INSERT INTO traces (request_id,user_id,node,ms,tokens_in,tokens_out,meta) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [ctx.requestId, ctx.userId, node, ms, usage.tokens_in, usage.tokens_out, meta],
    ).catch((err) => console.error("trace_write_failed", err));
  }
}
