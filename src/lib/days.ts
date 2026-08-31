/** Local-calendar helpers for the check-in journal. Times are ISO strings from Postgres. */
export const dayKey = (iso: string) => new Date(iso).toLocaleDateString("en-CA"); // YYYY-MM-DD in local time
export const dayLabel = (key: string) => {
  const today = dayKey(new Date().toISOString()), yday = dayKey(new Date(Date.now() - 864e5).toISOString());
  return key === today ? "Today" : key === yday ? "Yesterday" : new Date(key + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
export const since = (iso: string) => {
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 864e5);
  return d <= 0 ? "earlier today" : d === 1 ? "yesterday" : d <= 14 ? `${d} days ago` : "a while ago";
};
/** Consecutive days with a check-in, counted back from today (or yesterday, so today's visit doesn't start at zero). */
// ponytail: computed from the 200 loaded rows — very long runs get truncated; count server-side if that ever matters.
export const runningDays = (keys: string[]) => {
  const set = new Set(keys); let n = 0;
  let d = new Date(); if (!set.has(dayKey(d.toISOString()))) d = new Date(d.getTime() - 864e5);
  while (set.has(dayKey(d.toISOString()))) { n++; d = new Date(d.getTime() - 864e5); }
  return n;
};
/** Monday-first calendar cells for a month: leading nulls, then 1..N, padded to whole weeks. */
export const monthCells = (year: number, month0: number) => {
  const lead = (new Date(year, month0, 1).getDay() + 6) % 7; // Sunday=0 → 6
  const n = new Date(year, month0 + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: n }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  return cells;
};
