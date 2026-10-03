import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { constructTrips } from "./construct.js";
import { generateCandidates } from "./candidates.js";
import { explainAllocations } from "./deferral-reason.js";
import { parsePlanningInput, type PlanningInput } from "./contract.js";
import { planningScenarios } from "./fixtures.js";

test("a selected order is allocated and an ineligible order is not deferred", () => {
  const input = scenario("planning_basic_feasible");
  const generated = generateCandidates(input, { VEH001: 0 });
  assert.equal(generated.ok, true);
  if (!generated.ok) return;
  const built = constructTrips(input, generated.candidates, { VEH001: 0 });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const selected = explainAllocations(input, built.trips, { VEH001: 0 });
  assert.equal(selected.ok && selected.orders[0]?.outcome, "allocated");
  assert.equal(selected.ok && selected.orders[0]?.deferralReason, null);
  const late = explainAllocations(scenario("planning_cutoff_after"), [], { VEH001: 0 });
  assert.equal(late.ok && late.orders[0]?.outcome, "following_run");
  assert.equal(late.ok && late.orders[0]?.deferralReason, null);
  const open = explainAllocations(input, [], { VEH001: 0 });
  assert.equal(open.ok, false);
  if (!open.ok) assert.equal(open.code, "no_evidence");
});

test("depot, reefer, capacity, and fuel keep the approved explanation", () => {
  const depot = explainAllocations(scenario("planning_depot_mismatch"), [], { VEH001: 0 });
  assert.equal(depot.ok && depot.orders[0]?.deferralReason, "DEPOT_MISMATCH");
  const reefer = explainAllocations(scenario("planning_reefer_missing"), [], { VEH001: 0 });
  assert.equal(reefer.ok && reefer.orders[0]?.deferralReason, "NO_REEFER");
  const heavy = explainAllocations(scenario("planning_weight_over_capacity"), [], { VEH001: 0 });
  assert.equal(heavy.ok && heavy.orders[0]?.constraint, "weight_capacity");
  assert.equal(heavy.ok && heavy.orders[0]?.deferralReason, "NO_CAPACITY");
  const fuel = scenario("planning_basic_feasible");
  const vehicle = fuel.vehicles[0];
  assert.ok(vehicle !== undefined);
  vehicle.kmPerL = "1";
  vehicle.weeklyFuelQuotaL = "1";
  vehicle.existingWeeklyFuelL = "0";
  const quota = explainAllocations(fuel, [], { VEH001: 0 });
  assert.equal(quota.ok && quota.orders[0]?.constraint, "weekly_fuel");
  assert.equal(quota.ok && quota.orders[0]?.deferralReason, null);
  const both = scenario("planning_basic_feasible");
  const only = both.vehicles[0];
  const order = both.orders[0];
  assert.ok(only !== undefined && order !== undefined);
  only.depot = "Kandy";
  order.orderWeightKg = "1000.1";
  const primary = explainAllocations(both, [], { VEH001: 0 });
  assert.equal(primary.ok && primary.orders[0]?.deferralReason, "DEPOT_MISMATCH");
});

test("the same explanation repeats and the input stays unchanged", () => {
  const input = scenario("planning_van_only_truck");
  const before = JSON.stringify(input);
  const first = explainAllocations(input, [], { VEH001: 0 });
  const second = explainAllocations(input, [], { VEH001: 0 });
  assert.equal(first.ok && first.orders[0]?.deferralReason, "VAN_ACCESS");
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(input), before);
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/deferral-reason.ts"), "utf8");
  assert.equal(source.includes("FUEL_LIMIT"), false);
  assert.equal(source.includes("FUEL_QUOTA"), false);
  assert.equal(source.includes("prisma"), false);
});

function scenario(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  const parsed = parsePlanningInput(found.input);
  if (!parsed.ok) throw new Error(name);
  return parsed.value;
}
