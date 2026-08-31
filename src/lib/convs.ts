import { dayKey, dayLabel } from "./days";

export type ConvMsg = { id: string; role: "user" | "assistant"; text: string; at: string };
export type Conv = { id: string; label: string; snippet: string; last: string };

/** One sidebar entry per conversation: labeled by day of first message, snippet = first user message, newest activity first. */
export function groupConvs(msgs: ConvMsg[]): Conv[] {
  return [...msgs]
    .sort((a, b) => a.at.localeCompare(b.at))
    .reduce<Conv[]>((acc, m) => {
      let c = acc.find((x) => x.id === m.id);
      if (!c) { c = { id: m.id, label: dayLabel(dayKey(m.at)), snippet: "", last: m.at }; acc.push(c); }
      c.last = m.at;
      if (m.role === "user" && !c.snippet) c.snippet = m.text;
      return acc;
    }, [])
    .sort((a, b) => b.last.localeCompare(a.last));
}
