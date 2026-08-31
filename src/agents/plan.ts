import interventions from "@/data/interventions.json";
import type { Intervention, State } from "./types";

const LIB = interventions as Intervention[];

export type Ratings = Record<string, { helpful: number; unhelpful: number }>;

/**
 * Pure function: state + past ratings -> one intervention + a reason. No model call.
 * ponytail: linear scoring over 10 items; swap for anything fancier only if eval says so.
 */
export function planIntervention(state: State | null, ratings: Ratings = {}): { intervention: Intervention | null; reason: string } {
  if (!state) return { intervention: null, reason: "no state extracted; listen only" };
  // Iteration 5: "vent" alone used to suppress every exercise. A stronger extractor labels most check-ins as vent
  // while still naming a concrete need, so only stay silent when it names none.
  if (state.wants === "vent" && (!state.need || state.need === "none")) return { intervention: null, reason: "user wants to be heard, not given a task" };

  const energy = state.energy < 0.35 ? "low" : "mid";
  const stress = state.stress >= 0.6 ? "high" : "low";

  const scored = LIB.map((iv) => {
    let score = 0;
    const why: string[] = [];
    if (iv.domains.includes(state.domain)) { score += 3; why.push(`matches ${state.domain}`); }
    // Iteration 4: the extractor names the kind of help directly; that beats deriving it from noisy floats.
    if (state.need && iv.category === state.need) { score += 4; why.push(`fits the need named (${state.need})`); }
    if (iv.energy === "any" || iv.energy === energy) score += 1; else score -= 2;
    if (iv.stress === "any" || iv.stress === stress) score += 1; else score -= 2;
    if (iv.distortions?.some((d) => (state.distortions as string[]).includes(d))) { score += 3; why.push("targets the thinking pattern named"); }
    if (energy === "low" && iv.minutes <= 5) score += 1;
    const r = ratings[iv.id];
    if (r) {
      const net = r.helpful - r.unhelpful;
      score += net * 2;
      if (net < 0) why.push("previously rated unhelpful, deprioritised");
      if (net > 0) why.push("previously rated helpful");
    }
    return { iv, score, why };
  }).sort((a, b) => b.score - a.score || a.iv.minutes - b.iv.minutes);

  const best = scored[0];
  if (best.score <= 0) return { intervention: null, reason: "nothing in the library fits well; listen only" };
  return { intervention: best.iv, reason: best.why.join("; ") || "closest fit for energy and stress" };
}
