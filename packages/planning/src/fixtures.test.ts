import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalPlanningInput, parsePlanningInput, parsePlanningResult } from "./contract.js";
import { planningScenarios } from "./fixtures.js";

const required = [
  "planning_basic_feasible",
  "planning_weight_exact_capacity",
  "planning_weight_over_capacity",
  "planning_volume_exact_capacity",
  "planning_volume_over_capacity",
  "planning_reefer_compatible",
  "planning_reefer_missing",
  "planning_van_only_van",
  "planning_van_only_truck",
  "planning_depot_mismatch",
  "planning_brand_mismatch",
  "planning_district_mismatch",
  "planning_window_open",
  "planning_window_close",
  "planning_window_outside",
  "planning_trip_time_formula",
  "planning_trip_time_greater",
  "planning_fuel_exact_quota",
  "planning_fuel_over_quota",
  "planning_two_trips_allowed",
  "planning_third_trip_rejected",
  "planning_whole_order",
  "planning_demand_over_capacity",
  "planning_cutoff_before",
  "planning_cutoff_boundary",
  "planning_cutoff_after",
  "planning_determinism",
  "planning_existing_fuel_commitment",
  "planning_invalid_weight_capacity",
  "planning_invalid_weight",
  "planning_invalid_volume",
  "planning_invalid_fuel_efficiency",
  "planning_invalid_fuel_quota",
  "planning_invalid_window",
  "planning_invalid_depot",
  "planning_invalid_date",
];

test("planning scenarios are unique, contract-shaped, and isolated from production data", () => {
  const scenarios = planningScenarios();
  const names = scenarios.map((item) => item.name);
  assert.equal(new Set(names).size, names.length);
  for (const name of required) assert.equal(names.includes(name), true, name);
  for (const item of scenarios) {
    assert.equal(item.layer, "unit");
    assert.equal(JSON.stringify(item).includes("FUEL_LIMIT"), false);
    assert.equal(JSON.stringify(item.input).includes("speed_index"), false);
    assert.equal(JSON.stringify(item.input).includes("disruption_index"), false);
    const parsed = parsePlanningInput(item.input);
    assert.equal(parsed.ok, item.classification !== "validation_failure", item.name);
  }
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/fixtures.ts"), "utf8");
  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("database/seed"), false);
});

test("the same fixture normalizes to the same input and a copy can change", () => {
  const [first, second] = [planningScenarios(), planningScenarios()];
  const scenario = first.find((item) => item.name === "planning_determinism");
  const again = second.find((item) => item.name === "planning_determinism");
  assert.ok(scenario !== undefined && again !== undefined);
  const parsed = parsePlanningInput(scenario.input);
  const repeated = parsePlanningInput(structuredClone(scenario.input));
  assert.equal(parsed.ok && repeated.ok, true);
  if (!parsed.ok || !repeated.ok) return;
  assert.equal(canonicalPlanningInput(parsed.value), canonicalPlanningInput(repeated.value));
  const orders = (scenario.input as { orders: { orderUnits: number }[] }).orders;
  const firstOrder = orders[0];
  assert.ok(firstOrder !== undefined);
  firstOrder.orderUnits = 99;
  const untouched = (again.input as { orders: { orderUnits: number }[] }).orders[0];
  assert.equal(untouched?.orderUnits, 10);
});

test("fuel, trip time, and a third trip stay inside the approved contract", () => {
  const scenarios = planningScenarios();
  const exact = scenarios.find((item) => item.name === "planning_fuel_exact_quota");
  const over = scenarios.find((item) => item.name === "planning_fuel_over_quota");
  const time = scenarios.find((item) => item.name === "planning_trip_time_formula");
  const greater = scenarios.find((item) => item.name === "planning_trip_time_greater");
  const third = scenarios.find((item) => item.name === "planning_third_trip_rejected");
  assert.equal(exact?.expected.fuelUsedL, "5");
  assert.equal(exact?.expected.tripDistanceKm, "50");
  assert.notEqual(travelKm(exact?.input), "50");
  assert.equal(over?.expected.deferralReason, null);
  assert.equal(time?.expected.tripMinutes, "50");
  assert.equal(greater?.expected.tripMinutes, "51");
  assert.equal(time?.classification, "withheld");
  assert.equal(parsePlanningResult(third?.rejectedResult).ok, false);
});

function travelKm(input: unknown): string | undefined {
  const travel = (input as { travel?: { depotToDistrictKm?: string }[] } | undefined)?.travel;
  return travel?.[0]?.depotToDistrictKm;
}
