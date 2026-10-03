import assert from "node:assert/strict";
import test from "node:test";

import { constructTrips } from "./construct.js";
import { generateCandidates } from "./candidates.js";
import { parsePlanningInput, type PlanningInput } from "./contract.js";
import { planningScenarios } from "./fixtures.js";
import { selectDeterministicTripIds } from "./selection.js";
import { executePlanningEngine } from "./execute.js";

test("selectDeterministicTripIds avoids overlapping orders and vehicle slots", () => {
  const input = scenario("planning_basic_feasible");
  const generated = generateCandidates(input, { VEH001: 0 });
  assert.equal(generated.ok, true);
  if (!generated.ok) return;
  const constructed = constructTrips(input, generated.candidates, { VEH001: 0 });
  assert.equal(constructed.ok, true);
  if (!constructed.ok) return;
  const ids = selectDeterministicTripIds(constructed.trips);
  assert.equal(ids.length > 0, true);
  const selected = constructed.trips.filter((trip) => ids.includes(trip.id));
  const covered = selected.flatMap((trip) => trip.orderIds);
  assert.equal(new Set(covered).size, covered.length);
});

test("executePlanningEngine allocates a feasible order and defers infeasible weight", () => {
  const feasible = executePlanningEngine(scenario("planning_basic_feasible"), { VEH001: 0 });
  assert.equal(feasible.ok, true);
  if (feasible.ok) {
    assert.equal(feasible.result.trips.length, 1);
    assert.equal(feasible.result.unallocated.length, 0);
  }
  const infeasible = executePlanningEngine(scenario("planning_weight_over_capacity"), { VEH001: 0 });
  assert.equal(infeasible.ok, true);
  if (infeasible.ok) {
    assert.equal(infeasible.result.trips.length, 0);
    assert.equal(infeasible.result.unallocated[0]?.deferralReason, "NO_CAPACITY");
  }
});

function scenario(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  const parsed = parsePlanningInput(found.input);
  if (!parsed.ok) throw new Error(name);
  return parsed.value;
}
