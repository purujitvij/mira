import { streamText, type Msg } from "@/lib/llm";
import type { Intervention, State } from "./types";

const SYSTEM = `You are MIRA, a calm wellness companion. You are not a therapist, doctor, or crisis service and you never diagnose.
Write 3–6 short sentences: acknowledge what they said in their own terms, offer one brief observation, then hand off to the exercise card if one is provided (name it, do not re-explain its steps). If no exercise is provided, just listen and ask one gentle question.
Language rules: say "I noticed a pattern" / "this seems to coincide with", never causal or medical claims ("this causes depression"). Never say you can keep them safe. Never invent exercises; only reference the one provided. Plain, warm, unhurried. No bullet points, no emojis.`;

export type GenInput = {
  message: string;
  history: Msg[];
  state: State | null;
  intervention: Intervention | null;
  pattern: string | null;
};

/** Streams text deltas. Yields a fixed fallback if the model refuses or errors. */
export async function* generateReply(input: GenInput): AsyncGenerator<string, { tokens_in: number; tokens_out: number }> {
  const context = [
    input.state ? `Extracted state: ${JSON.stringify(input.state)}` : "State could not be extracted; ask a clarifying question.",
    input.pattern ? `Pattern from history: ${input.pattern}` : "",
    input.intervention ? `Exercise card shown to user: "${input.intervention.title}" (${input.intervention.minutes} min, ${input.intervention.category})` : "No exercise card this turn.",
  ].filter(Boolean).join("\n");

  try {
    const stream = streamText({
      system: `${SYSTEM}\n\n${context}`,
      maxTokens: 600, // deliberately short replies
      messages: [...input.history, { role: "user", content: input.message }],
    });
    for (;;) {
      const r = await stream.next();
      if (r.done) return r.value;
      yield r.value;
    }
  } catch (e) {
    console.error("generate_failed", e);
    yield "I'm here and listening. I'm having trouble forming a reply right now, but you can keep going, or try the exercise card if one is shown.";
    return { tokens_in: 0, tokens_out: 0 };
  }
}
