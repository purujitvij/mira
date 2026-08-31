import { test } from "node:test";
import assert from "node:assert/strict";
import { planIntervention } from "@/agents/plan";
import type { State } from "@/agents/types";

const base: State = { emotion: "stressed", stress: 0.7, energy: 0.5, domain: "work", distortions: [], wants: "exercise", confidence: 0.9 };

test("planner: domain drives the pick", () => {
  assert.equal(planIntervention({ ...base, domain: "sleep", energy: 0.2 }).intervention?.category, "sleep");
});
test("planner: named distortion wins", () => {
  assert.equal(planIntervention({ ...base, distortions: ["all-or-nothing"] }).intervention?.id, "reframe");
});
test("planner: unhelpful ratings deprioritise an intervention", () => {
  const without = planIntervention(base).intervention?.id;
  const withRatings = planIntervention(base, { [without!]: { helpful: 0, unhelpful: 3 } }).intervention?.id;
  assert.notEqual(withRatings, without);
});
test("planner: venting gets no task", () => {
  assert.equal(planIntervention({ ...base, wants: "vent" }).intervention, null);
});
