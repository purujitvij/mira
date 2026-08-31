import { test } from "node:test";
import assert from "node:assert/strict";
import { dayKey, dayLabel, since, runningDays, monthCells } from "../src/lib/days";

const day = (offset: number) => dayKey(new Date(Date.now() - offset * 864e5).toISOString());

test("dayLabel: today / yesterday / dated", () => {
  assert.equal(dayLabel(day(0)), "Today");
  assert.equal(dayLabel(day(1)), "Yesterday");
  assert.match(dayLabel("2026-08-01"), /^1 Aug$/);
});

test("since: phrased like a friend, never a timestamp", () => {
  assert.equal(since(new Date().toISOString()), "earlier today");
  assert.equal(since(new Date(Date.now() - 1 * 864e5).toISOString()), "yesterday");
  assert.equal(since(new Date(Date.now() - 3 * 864e5).toISOString()), "3 days ago");
  assert.equal(since(new Date(Date.now() - 40 * 864e5).toISOString()), "a while ago");
});

test("runningDays: counts back from today, or from yesterday before today's first check-in", () => {
  assert.equal(runningDays([]), 0);
  assert.equal(runningDays([day(0)]), 1);
  assert.equal(runningDays([day(0), day(1), day(2)]), 3);
  assert.equal(runningDays([day(1), day(2)]), 2, "not yet checked in today: yesterday's run still stands");
  assert.equal(runningDays([day(0), day(2), day(3)]), 1, "a gap ends the run quietly");
  assert.equal(runningDays([day(2), day(3)]), 0, "two days away: no badge, no guilt");
});

test("monthCells: Monday-first grid, whole weeks", () => {
  const aug = monthCells(2026, 7); // Aug 1 2026 is a Saturday
  assert.equal(aug.length, 42);
  assert.deepEqual(aug.slice(0, 7), [null, null, null, null, null, 1, 2]);
  assert.equal(aug[35], 31, "31 Aug starts the last row (Monday)");
  assert.equal(monthCells(2026, 5)[0], 1, "June 2026 starts on a Monday: no leading blanks");
  assert.equal(monthCells(2026, 1).length, 35, "Feb 2026 starts on a Sunday: six blanks, then five rows");
  assert.equal(monthCells(2027, 1).length, 28, "Feb 2027 starts on a Monday: exactly four weeks");
});
