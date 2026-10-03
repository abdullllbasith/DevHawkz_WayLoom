import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateCandidates, tripDistanceKm } from "./candidates.js";
import { parsePlanningInput, type PlanningInput } from "./contract.js";
import { planningScenarios } from "./fixtures.js";

test("one eligible order becomes one trip and fuel uses the approved distance", () => {
  const input = scenario("planning_basic_feasible");
  assert.equal(tripDistanceKm("12", "2", 1), "12");
  assert.equal(tripDistanceKm("12", "2", 2), "14");
  const result = generateCandidates(input, { VEH001: 0 });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.tripNumber, 1);
  assert.equal(result.candidates[0]?.tripDistanceKm, "12");
  assert.equal(result.candidates[0]?.orderIds.length, 1);
  assert.equal(result.unallocated.length, 0);
  assert.equal(result.candidates[0]?.feasibility.status, "feasible");
});

test("fuel over the quota, trip slots, and missing distance stay fail-closed", () => {
  const tight = scenario("planning_basic_feasible");
  const vehicle = tight.vehicles[0];
  assert.ok(vehicle !== undefined);
  vehicle.kmPerL = "1";
  vehicle.weeklyFuelQuotaL = "1";
  vehicle.existingWeeklyFuelL = "0";
  const rejected = generateCandidates(tight, { VEH001: 0 });
  assert.equal(rejected.ok && rejected.candidates.length, 0);
  assert.equal(rejected.ok && rejected.unallocated[0]?.constraint, "weekly_fuel");
  assert.equal(rejected.ok && rejected.unallocated[0]?.deferralReason, null);

  const basic = scenario("planning_basic_feasible");
  const second = generateCandidates(basic, { VEH001: 1 });
  assert.equal(second.ok && second.candidates[0]?.tripNumber, 2);
  const full = generateCandidates(basic, { VEH001: 2 });
  assert.equal(full.ok && full.candidates.length, 0);
  assert.equal(full.ok && full.unallocated[0]?.constraint, "two_trips");
  assert.equal(full.ok && full.unallocated[0]?.deferralReason, null);
  const missing = generateCandidates(basic, {});
  assert.equal(missing.ok && missing.candidates.length, 0);
  assert.equal(missing.ok && missing.unallocated[0]?.constraint, "missing_existing_trip_count");

  const removed = scenario("planning_basic_feasible");
  removed.travel = [];
  const noDistance = generateCandidates(removed, { VEH001: 0 });
  assert.equal(noDistance.ok, false);
  if (!noDistance.ok) assert.equal(noDistance.code, "invalid_input");
  assert.equal(tripDistanceKm("-1", "2", 1), null);
  assert.equal(tripDistanceKm("12", "2", 0), null);
  const invalid = scenario("planning_basic_feasible");
  const travel = invalid.travel[0];
  assert.ok(travel !== undefined);
  travel.depotToDistrictKm = "-1";
  assert.equal(generateCandidates(invalid, { VEH001: 0 }).ok, false);
});

test("the same input returns the same candidates and does not change", () => {
  const input = scenario("planning_determinism");
  const counts = { VEH001: 0, VEH002: 0 };
  const before = JSON.stringify(input);
  const first = generateCandidates(input, counts);
  const second = generateCandidates(input, counts);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(input), before);
  assert.equal(first.ok && first.candidates.some((candidate) => candidate.orderIds.length > 1), true);
  const late = scenario("planning_cutoff_after");
  const waiting = generateCandidates(late, { VEH001: 0 });
  assert.equal(waiting.ok && waiting.candidates.length, 0);
  assert.equal(waiting.ok && waiting.unallocated.length, 0);
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/candidates.ts"), "utf8");
  assert.equal(source.includes("FUEL_LIMIT"), false);
  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("ortools"), false);
});

function scenario(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  const parsed = parsePlanningInput(found.input);
  if (!parsed.ok) throw new Error(name);
  return parsed.value;
}
