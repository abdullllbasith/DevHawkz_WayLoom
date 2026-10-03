import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { PlanningInput } from "./contract.js";
import { evaluateFeasibility } from "./feasibility.js";
import { planningScenarios } from "./fixtures.js";
import { validateVehicleFuel, validateWeeklyFuel, type FuelContext, type FuelResult } from "./fuel.js";

test("supplied distance and efficiency produce litres without understating a remainder", () => {
  const exact = validateWeeklyFuel(context("VEH001", "10", "100", "0", ["50"]));
  assert.equal(exact.ok && exact.fuelUsedL, "5");
  assert.equal(exact.ok && exact.status, "feasible");
  const decimal = validateWeeklyFuel(context("VEH001", "2.5", "100", "0", ["12.5"]));
  assert.equal(decimal.ok && decimal.fuelUsedL, "5");
  const remainder = validateWeeklyFuel(context("VEH001", "3", "100", "0", ["1"]));
  assert.equal(remainder.ok && remainder.fuelUsedL, "0.333334");
  const zero = validateWeeklyFuel(context("VEH001", "8.5", "0", "0", ["0"]));
  assert.equal(zero.ok && zero.fuelUsedL, "0");
  assert.equal(zero.ok && zero.status, "feasible");
});

test("quota equality is feasible and a larger projection is not", () => {
  const below = validateWeeklyFuel(context("VEH001", "1", "100", "0", ["1"]));
  assert.equal(below.ok && below.projectedWeeklyFuelL, "1");
  assert.equal(below.ok && below.status, "feasible");
  const exact = input("planning_fuel_exact_quota");
  const atQuota = evaluateFeasibility(exact, candidate(exact, "50"));
  assert.equal(atQuota.constraints.find((item) => item.id === "weekly_fuel")?.status, "feasible");
  assert.equal(atQuota.constraints.find((item) => item.id === "weekly_fuel")?.deferralReason, null);
  const over = input("planning_fuel_over_quota");
  const above = evaluateFeasibility(over, candidate(over, "50"));
  assert.equal(above.constraints.find((item) => item.id === "weekly_fuel")?.status, "infeasible");
  assert.equal(above.constraints.find((item) => item.id === "weekly_fuel")?.measured, "101");
  assert.equal(above.constraints.find((item) => item.id === "weekly_fuel")?.deferralReason, null);
  const withExisting = validateWeeklyFuel(context("VEH001", "1", "100", "95", ["5"]));
  assert.equal(withExisting.ok && withExisting.status, "feasible");
  const overExisting = validateWeeklyFuel(context("VEH001", "1", "100", "96", ["5"]));
  assert.equal(overExisting.ok && overExisting.status, "infeasible");
});

test("several trips accumulate for one vehicle and vehicles stay separate", () => {
  const combined = validateWeeklyFuel(context("VEH001", "1", "100", "70", ["20", "15"]));
  assert.equal(combined.ok && combined.fuelUsedL, "35");
  assert.equal(combined.ok && combined.projectedWeeklyFuelL, "105");
  assert.equal(combined.ok && combined.status, "infeasible");
  const alone = validateWeeklyFuel(context("VEH001", "1", "100", "70", ["20"]));
  assert.equal(alone.ok && alone.status, "feasible");
  const reversed = validateWeeklyFuel(context("VEH001", "1", "100", "70", ["15", "20"]));
  assert.equal(reversed.ok && reversed.projectedWeeklyFuelL, combined.ok && combined.projectedWeeklyFuelL);
  assert.equal(reversed.ok && reversed.status, "infeasible");
  const within = validateWeeklyFuel(context("VEH001", "1", "100", "70", ["20", "10"]));
  assert.equal(within.ok && within.status, "feasible");
  const vehicles = validateVehicleFuel([context("VEH001", "1", "100", "0", ["10"]), context("VEH002", "1", "10", "0", ["20"])]);
  assert.equal(vehicles[0]?.ok && vehicles[0].status, "feasible");
  assert.equal(vehicles[1]?.ok && vehicles[1].status, "infeasible");
  const duplicated = validateVehicleFuel([context("VEH001", "1", "100", "0", ["10"]), context("VEH001", "1", "100", "0", ["10"])]);
  assert.equal(duplicated[0]?.status, "invalid");
  assert.equal(duplicated[1]?.status, "invalid");
});

test("missing or invalid fuel inputs fail closed and the input stays unchanged", () => {
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "10", "100", "0", [null]))), "missing_distance");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "10", "100", "0", ["-1"]))), "invalid_distance");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "10", "100", "0", ["NaN"]))), "invalid_distance");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "10", "100", "0", ["Infinity"]))), "invalid_distance");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", null, "100", "0", ["50"]))), "missing_efficiency");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "0", "100", "0", ["50"]))), "invalid_efficiency");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "-1", "100", "0", ["50"]))), "invalid_efficiency");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "Infinity", "100", "0", ["50"]))), "invalid_efficiency");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "10", null, "0", ["50"]))), "missing_quota");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "10", "-1", "0", ["50"]))), "invalid_quota");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "10", "100", null, ["50"]))), "missing_existing_fuel");
  assert.equal(failureCode(validateWeeklyFuel(context("VEH001", "10", "100", "-1", ["50"]))), "invalid_existing_fuel");
  assert.equal(validateWeeklyFuel(context("VEH001", "10", null, "0", ["50"])).status, "invalid");
  const body = context("VEH001", "10", "100", "95", ["5"]);
  const before = JSON.stringify(body);
  const first = validateWeeklyFuel(body);
  const second = validateWeeklyFuel(body);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(body), before);
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/fuel.ts"), "utf8");
  assert.equal(source.includes("FUEL_LIMIT"), false);
  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("trip_minutes"), false);
  assert.equal(source.includes("depotToDistrictKm"), false);
});

function context(vehicleId: string, kmPerL: string | null, weeklyFuelQuotaL: string | null, existingWeeklyFuelL: string | null, distances: (string | null)[]): FuelContext {
  return { vehicleId, kmPerL, weeklyFuelQuotaL, existingWeeklyFuelL, trips: distances.map((tripDistanceKm) => ({ tripDistanceKm })) };
}

function failureCode(result: FuelResult): string | null {
  return result.ok ? null : result.code;
}

function input(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  return found.input as PlanningInput;
}

function candidate(value: PlanningInput, tripDistanceKm: string): unknown {
  const vehicle = value.vehicles[0];
  if (vehicle === undefined) throw new Error("vehicle");
  return {
    vehicleId: vehicle.vehicleId,
    orderIds: value.orders.map((order) => order.id),
    stops: value.orders.map((order) => ({ orderId: order.id, plannedArrival: "09:00" })),
    tripDistanceKm,
    existingTripCount: 0,
  };
}
