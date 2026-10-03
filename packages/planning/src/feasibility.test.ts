import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { divideDecimalCeil } from "./decimal.js";
import { evaluateFeasibility, type FeasibilityResult } from "./feasibility.js";
import { planningScenarios } from "./fixtures.js";

test("a compatible candidate is feasible and an incompatible one keeps constraint order", () => {
  const basic = scenario("planning_basic_feasible");
  const matched = evaluateFeasibility(basic, propose(basic, {}));
  assert.equal(matched.status, "feasible");
  assert.equal(constraint(matched, "trip_time")?.status, "withheld");
  assert.equal(constraint(matched, "trip_time")?.limit, null);
  assert.equal(constraint(matched, "weight_capacity")?.status, "feasible");

  const exactWeight = scenario("planning_weight_exact_capacity");
  assert.equal(evaluateFeasibility(exactWeight, propose(exactWeight, {})).status, "feasible");
  const overWeight = scenario("planning_weight_over_capacity");
  const heavy = evaluateFeasibility(overWeight, propose(overWeight, {}));
  assert.equal(constraint(heavy, "weight_capacity")?.status, "infeasible");
  assert.equal(constraint(heavy, "weight_capacity")?.deferralReason, "NO_CAPACITY");

  const exactVolume = scenario("planning_volume_exact_capacity");
  assert.equal(evaluateFeasibility(exactVolume, propose(exactVolume, {})).status, "feasible");
  const overVolume = scenario("planning_volume_over_capacity");
  assert.equal(constraint(evaluateFeasibility(overVolume, propose(overVolume, {})), "volume_capacity")?.status, "infeasible");

  assert.equal(evaluateFeasibility(scenario("planning_reefer_compatible"), propose(scenario("planning_reefer_compatible"), {})).status, "feasible");
  assert.equal(constraint(evaluateFeasibility(scenario("planning_reefer_missing"), propose(scenario("planning_reefer_missing"), {})), "temperature")?.deferralReason, "NO_REEFER");
  assert.equal(evaluateFeasibility(scenario("planning_van_only_van"), propose(scenario("planning_van_only_van"), {})).status, "feasible");
  assert.equal(constraint(evaluateFeasibility(scenario("planning_van_only_truck"), propose(scenario("planning_van_only_truck"), {})), "van_only")?.deferralReason, "VAN_ACCESS");
  assert.equal(constraint(evaluateFeasibility(scenario("planning_depot_mismatch"), propose(scenario("planning_depot_mismatch"), {})), "depot_compatibility")?.deferralReason, "DEPOT_MISMATCH");
  assert.equal(constraint(evaluateFeasibility(scenario("planning_brand_mismatch"), propose(scenario("planning_brand_mismatch"), {})), "brand_compatibility")?.status, "infeasible");
  assert.equal(constraint(evaluateFeasibility(scenario("planning_brand_mismatch"), propose(scenario("planning_brand_mismatch"), {})), "brand_compatibility")?.deferralReason, null);
  assert.equal(constraint(evaluateFeasibility(scenario("planning_district_mismatch"), propose(scenario("planning_district_mismatch"), {})), "district_compatibility")?.status, "infeasible");
});

test("windows, fuel, trip count, and missing inputs stay fail-closed", () => {
  const basic = scenario("planning_basic_feasible");
  assert.equal(evaluateFeasibility(basic, propose(basic, { stops: stops(basic, "08:00") })).status, "feasible");
  assert.equal(evaluateFeasibility(basic, propose(basic, { stops: stops(basic, "12:00") })).status, "feasible");
  assert.equal(constraint(evaluateFeasibility(basic, propose(basic, { stops: stops(basic, "07:59") })), "delivery_window")?.status, "infeasible");
  assert.equal(constraint(evaluateFeasibility(basic, propose(basic, { stops: stops(basic, "12:01") })), "delivery_window")?.deferralReason, "WINDOW_CONFLICT");

  const time = scenario("planning_trip_time_formula");
  assert.equal(constraint(evaluateFeasibility(time, propose(time, {})), "trip_time")?.measured, "50");
  const greater = scenario("planning_trip_time_greater");
  assert.equal(constraint(evaluateFeasibility(greater, propose(greater, {})), "trip_time")?.measured, "51");
  const removed = structuredClone(time) as { serviceAllowances: unknown[] };
  removed.serviceAllowances = [];
  assert.equal(evaluateFeasibility(removed, propose(time, {})).status, "invalid");

  assert.equal(divideDecimalCeil("50", "10"), "5");
  const exactFuel = scenario("planning_fuel_exact_quota");
  assert.equal(constraint(evaluateFeasibility(exactFuel, propose(exactFuel, { tripDistanceKm: "50" })), "weekly_fuel")?.status, "feasible");
  const overFuel = scenario("planning_fuel_over_quota");
  const over = evaluateFeasibility(overFuel, propose(overFuel, { tripDistanceKm: "50" }));
  assert.equal(constraint(over, "weekly_fuel")?.status, "infeasible");
  assert.equal(constraint(over, "weekly_fuel")?.deferralReason, null);
  assert.equal(evaluateFeasibility(basic, propose(basic, { tripDistanceKm: "1" })).status, "feasible");
  assert.equal(evaluateFeasibility(basic, propose(basic, { tripDistanceKm: null })).status, "invalid");

  assert.equal(evaluateFeasibility(basic, propose(basic, { existingTripCount: 0 })).status, "feasible");
  assert.equal(evaluateFeasibility(basic, propose(basic, { existingTripCount: 1 })).status, "feasible");
  assert.equal(constraint(evaluateFeasibility(basic, propose(basic, { existingTripCount: 2 })), "two_trips")?.status, "infeasible");
  assert.equal(evaluateFeasibility(basic, propose(basic, { existingTripCount: null })).status, "invalid");
});

test("duplicate orders, several violations, and repetition stay deterministic", () => {
  const basic = scenario("planning_basic_feasible");
  const proposed = propose(basic, {});
  const orderId = proposed.orderIds[0];
  assert.ok(orderId !== undefined);
  const duplicated = evaluateFeasibility(basic, { ...proposed, orderIds: [orderId, orderId], stops: [proposed.stops[0], proposed.stops[0]] });
  assert.equal(constraint(duplicated, "whole_order")?.status, "infeasible");
  const partial = evaluateFeasibility(basic, { ...proposed, stops: [] });
  assert.equal(constraint(partial, "whole_order")?.status, "infeasible");

  const heavyDepot = structuredClone(basic) as { vehicles: { depot: string }[]; orders: { orderWeightKg: string }[] };
  const vehicle = heavyDepot.vehicles[0];
  const order = heavyDepot.orders[0];
  assert.ok(vehicle !== undefined && order !== undefined);
  vehicle.depot = "Kandy";
  order.orderWeightKg = "1000.1";
  const both = evaluateFeasibility(heavyDepot, propose(heavyDepot, {}));
  const ids = both.constraints.map((item) => item.id);
  assert.equal(ids.indexOf("depot_compatibility") < ids.indexOf("weight_capacity"), true);
  assert.equal(constraint(both, "depot_compatibility")?.status, "infeasible");
  assert.equal(constraint(both, "weight_capacity")?.status, "infeasible");

  const before = JSON.stringify(basic);
  const first = evaluateFeasibility(basic, proposed);
  const second = evaluateFeasibility(basic, proposed);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(basic), before);

  const many = scenario("planning_determinism");
  assert.equal(evaluateFeasibility(many, propose(many, {})).status, "feasible");
  const ambient = structuredClone(basic) as { orders: { tempRequirement: string }[]; vehicles: { temp: string; type: string }[] };
  const ambientOrder = ambient.orders[0];
  const ambientVehicle = ambient.vehicles[0];
  assert.ok(ambientOrder !== undefined && ambientVehicle !== undefined);
  ambientOrder.tempRequirement = "ambient";
  ambientVehicle.temp = "ambient";
  ambientVehicle.type = "truck";
  assert.equal(evaluateFeasibility(ambient, propose(ambient, {})).status, "feasible");

  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/feasibility.ts"), "utf8");
  assert.equal(source.includes("FUEL_LIMIT"), false);
  assert.equal(source.includes("ortools"), false);
  assert.equal(source.includes("prisma"), false);
});

function scenario(name: string): unknown {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  return found.input;
}

function propose(input: unknown, extra: Record<string, unknown>): { vehicleId: string; orderIds: string[]; stops: { orderId: string; plannedArrival: string | null }[]; tripDistanceKm: string | null; existingTripCount: number | null } {
  const body = input as { vehicles: { vehicleId: string }[]; orders: { id: string }[] };
  const vehicle = body.vehicles[0];
  if (vehicle === undefined) throw new Error("vehicle");
  const orderIds = body.orders.map((item) => item.id);
  return {
    vehicleId: vehicle.vehicleId,
    orderIds,
    stops: orderIds.map((orderId) => ({ orderId, plannedArrival: "09:00" })),
    tripDistanceKm: "0",
    existingTripCount: 0,
    ...extra,
  };
}

function stops(input: unknown, plannedArrival: string): { orderId: string; plannedArrival: string }[] {
  const body = input as { orders: { id: string }[] };
  return body.orders.map((item) => ({ orderId: item.id, plannedArrival }));
}

function constraint(result: FeasibilityResult, id: string): FeasibilityResult["constraints"][number] | undefined {
  return result.constraints.find((item) => item.id === id);
}
