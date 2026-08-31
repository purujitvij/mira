import { z } from "zod";

// ponytail: raw fetch against any OpenAI-compatible /chat/completions; change LLM_BASE_URL + MIRA_MODEL to swap provider.
const BASE = process.env.LLM_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta/openai";
export const MODEL = process.env.MIRA_MODEL ?? "gemini-2.5-flash";

export type Usage = { tokens_in: number; tokens_out: number };
export type Msg = { role: "system" | "user" | "assistant"; content: string };

const usageOf = (u?: { prompt_tokens?: number; completion_tokens?: number }): Usage => ({ tokens_in: u?.prompt_tokens ?? 0, tokens_out: u?.completion_tokens ?? 0 });

async function chat(body: Record<string, unknown>): Promise<Response> {
  // ponytail: retry only on 429 (free-tier rate limits), fixed backoff; a proper limiter if it ever matters.
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.LLM_API_KEY ?? ""}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, ...body }),
    });
    if (res.ok) return res;
    const text = (await res.text()).slice(0, 300);
    if (res.status === 429 && attempt < 4) {
      const hint = Number(/retry in ([\d.]+)s/i.exec(text)?.[1]); // Google puts the wait in the body
      await new Promise((r) => setTimeout(r, hint ? (hint + 1) * 1000 : 15_000 * (attempt + 1)));
      continue;
    }
    throw new Error(`llm_http_${res.status}: ${text}`);
  }
}

/** One structured-output call. Throws on unparsable output; callers decide the fallback. */
export async function parseJson<T extends z.ZodType>(opts: { schema: T; system: string; user: string; maxTokens?: number }): Promise<{ data: z.infer<T>; usage: Usage }> {
  const schema = { ...z.toJSONSchema(opts.schema), $schema: undefined }; // JSON.stringify drops undefined
  const res = await chat({
    max_tokens: opts.maxTokens ?? 1024,
    messages: [{ role: "system", content: opts.system }, { role: "user", content: opts.user }],
    response_format: { type: "json_schema", json_schema: { name: "out", schema } },
  });
  const j = await res.json();
  const text: string | undefined = j.choices?.[0]?.message?.content;
  if (!text) throw new Error("llm_empty");
  const parsed = opts.schema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new Error("llm_unparsable");
  return { data: parsed.data as z.infer<T>, usage: usageOf(j.usage) };
}

/** Streams text deltas; returns usage. */
export async function* streamText(opts: { system: string; messages: Msg[]; maxTokens?: number }): AsyncGenerator<string, Usage> {
  const res = await chat({ max_tokens: opts.maxTokens ?? 600, stream: true, stream_options: { include_usage: true }, messages: [{ role: "system", content: opts.system }, ...opts.messages] });
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  let buf = "", usage: Usage = { tokens_in: 0, tokens_out: 0 };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:") || line === "data: [DONE]") continue;
      const j = JSON.parse(line.slice(5));
      const d = j.choices?.[0]?.delta?.content;
      if (d) yield d;
      if (j.usage) usage = usageOf(j.usage);
    }
  }
  return usage;
}
