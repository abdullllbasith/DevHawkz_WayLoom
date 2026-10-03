import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateCandidates } from "./candidates.js";
import { constructTrips } from "./construct.js";
import { explainAllocations } from "./deferral-reason.js";
import { parsePlanningInput, parsePlanningResult, type PlanningInput } from "./contract.js";
import { planningScenarios } from "./fixtures.js";
import { assemblePlanningResult } from "./result.js";

test("a selected trip is a result and a cutoff order is not a deferral", () => {
  const input = scenario("planning_basic_feasible");
  const built = trips(input, { VEH001: 0 });
  const explained = explainAllocations(input, built, { VEH001: 0 });
  assert.equal(explained.ok, true);
  if (!explained.ok) return;
  const run = assemblePlanningResult(input, built, explained.orders);
  assert.equal(run.ok, true);
  if (!run.ok) return;
  assert.equal(run.result.status, "result");
  assert.equal(run.result.solverStatus, null);
  assert.equal(run.result.trips.length, 1);
  assert.equal(run.result.unallocated.length, 0);
  assert.equal(run.result.trips[0]?.tripDistanceKm, "12");
  const late = scenario("planning_cutoff_after");
  const lateExplanation = explainAllocations(late, [], { VEH001: 0 });
  assert.equal(lateExplanation.ok, true);
  if (!lateExplanation.ok) return;
  const waiting = assemblePlanningResult(late, [], lateExplanation.orders);
  assert.equal(waiting.ok && waiting.result.trips.length, 0);
  assert.equal(waiting.ok && waiting.result.unallocated.length, 0);
  assert.equal(waiting.ok && waiting.result.solverStatus, null);
});

test("fuel stays weekly_fuel, failures stay failures, and a contradiction is not repaired", () => {
  const fuel = scenario("planning_basic_feasible");
  const vehicle = fuel.vehicles[0];
  assert.ok(vehicle !== undefined);
  vehicle.kmPerL = "1";
  vehicle.weeklyFuelQuotaL = "1";
  vehicle.existingWeeklyFuelL = "0";
  const quota = explainAllocations(fuel, [], { VEH001: 0 });
  assert.equal(quota.ok, true);
  if (!quota.ok) return;
  const uncovered = assemblePlanningResult(fuel, [], quota.orders);
  assert.equal(uncovered.ok && uncovered.result.unallocated[0]?.constraint, "weekly_fuel");
  assert.equal(uncovered.ok && uncovered.result.unallocated[0]?.deferralReason, null);
  assert.equal(uncovered.ok && uncovered.result.solverStatus, null);
  const invalid = assemblePlanningResult({ ...fuel, contractVersion: "9" }, [], []);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.failure.status, "validation_failure");
    assert.equal(JSON.stringify(invalid.failure).includes("trips"), false);
  }
  const input = scenario("planning_basic_feasible");
  const built = trips(input, { VEH001: 0 });
  const explained = explainAllocations(input, built, { VEH001: 0 });
  assert.equal(explained.ok, true);
  if (!explained.ok || built[0] === undefined) return;
  const duplicated = assemblePlanningResult(input, [built[0], built[0]], explained.orders);
  assert.equal(duplicated.ok, false);
  if (!duplicated.ok) assert.equal(duplicated.failure.status, "service_failure");
  assert.equal(parsePlanningResult({ contractVersion: "1", status: "result", operationalDate: "2026-06-02", trips: [], unallocated: [], solverStatus: "FEASIBLE" }).ok, false);
  assert.equal(parsePlanningResult({ contractVersion: "1", status: "result", operationalDate: "2026-06-02", trips: [], unallocated: [], solverStatus: "SUBOPTIMAL" }).ok, false);
});

test("the same selection returns the same result and the input stays unchanged", () => {
  const input = scenario("planning_weight_over_capacity");
  const explained = explainAllocations(input, [], { VEH001: 0 });
  assert.equal(explained.ok, true);
  if (!explained.ok) return;
  const before = JSON.stringify(input);
  const first = assemblePlanningResult(input, [], explained.orders);
  const second = assemblePlanningResult(input, [], explained.orders);
  assert.equal(first.ok && first.result.unallocated[0]?.deferralReason, "NO_CAPACITY");
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(input), before);
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/result.ts"), "utf8");
  assert.equal(source.includes("ortools"), false);
  assert.equal(source.includes("OPTIMAL"), false);
  assert.equal(source.includes("prisma"), false);
});

function scenario(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  const parsed = parsePlanningInput(found.input);
  if (!parsed.ok) throw new Error(name);
  return parsed.value;
}

function trips(input: PlanningInput, counts: Record<string, number>): import("./construct.js").ConstructedTrip[] {
  const generated = generateCandidates(input, counts);
  if (!generated.ok) throw new Error("candidates");
  const built = constructTrips(input, generated.candidates, counts);
  if (!built.ok) throw new Error("trips");
  return built.trips;
}
