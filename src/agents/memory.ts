import { q } from "@/lib/db";
import type { Msg } from "@/lib/llm";
import type { Ratings } from "./plan";
import type { State } from "./types";

// ponytail: plain SQL over the last few turns. pgvector was tried and removed — see CHANGELOG.

export async function recentHistory(userId: string, n = 6): Promise<Msg[]> {
  const rows = await q<{ role: "user" | "assistant"; content: string }>(
    "SELECT role, content FROM messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2", [userId, n]);
  return rows.reverse().map((r) => ({ role: r.role, content: r.content }));
}

export async function ratingsFor(userId: string): Promise<Ratings> {
  const rows = await q<{ intervention_id: string; helpful: boolean; c: string }>(
    "SELECT intervention_id, helpful, count(*)::text c FROM feedback WHERE user_id=$1 GROUP BY 1,2", [userId]);
  const out: Ratings = {};
  for (const r of rows) {
    out[r.intervention_id] ??= { helpful: 0, unhelpful: 0 };
    out[r.intervention_id][r.helpful ? "helpful" : "unhelpful"] += Number(r.c);
  }
  return out;
}

/** Non-causal pattern sentence from recent extracted states, or null. */
export async function detectPattern(userId: string, current: State | null): Promise<string | null> {
  const rows = await q<{ state: State }>(
    "SELECT state FROM messages WHERE user_id=$1 AND role='user' AND state IS NOT NULL ORDER BY created_at DESC LIMIT 5", [userId]);
  const states = rows.map((r) => r.state);
  if (!current || states.length < 2) return null;
  const all = [current, ...states];
  const stressRising = all[0].stress > all[all.length - 1].stress + 0.2;
  const sleepMentions = all.filter((s) => s.domain === "sleep").length;
  if (stressRising && sleepMentions >= 1) return "stress has been rising over recent check-ins, and sleep has come up more than once";
  if (stressRising) return "stress has been rising over the last few check-ins";
  if (all.filter((s) => s.energy < 0.35).length >= 3) return "energy has been low across several recent check-ins";
  return null;
}
