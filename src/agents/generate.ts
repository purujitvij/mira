import { streamText, type Msg } from "@/lib/llm";
import type { Intervention, State } from "./types";

const SYSTEM = `You are MIRA, a calm wellness companion. You are not a therapist, doctor, or crisis service and you never diagnose.
Write 3–6 short sentences: acknowledge what they said in their own terms, offer one brief observation, then hand off to the exercise if one is provided (name it; never say "card" or "shown to you", never re-explain its steps). If no exercise is provided, just listen and ask one gentle question.
Language rules: never make causal or medical claims ("this causes depression"). If a pattern from history is provided below, mention it once with "I noticed" or "this seems to coincide with"; if none is provided, do not claim to have noticed any pattern. Never say you can keep them safe. Never invent exercises; only reference the one provided. Plain, warm, unhurried. No bullet points, no emojis.`;

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
    input.pattern ? `Pattern from history: ${input.pattern}` : "No pattern from history: this may be a first check-in, so do not say you noticed one.",
    input.intervention ? `Offer this exercise by name, in one sentence, without listing its steps: "${input.intervention.title}" (${input.intervention.minutes} min). The steps are already on screen.` : "No exercise this turn: just listen and ask one gentle question.",
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
