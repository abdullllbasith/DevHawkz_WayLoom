import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { PlanningInput, PlanningOrder } from "./contract.js";
import { evaluateFeasibility } from "./feasibility.js";
import { planningScenarios } from "./fixtures.js";
import { calculateTripTime, tripTimeForOrders, type TripTimeRequest, type TripTimeResult } from "./trip-time.js";

const approvedAllowances = [
  ["Fresh", "rear_dock", "15"],
  ["Fresh", "street", "16"],
  ["Fresh", "mall_bay", "18"],
  ["Style", "rear_dock", "38"],
  ["Style", "street", "46"],
  ["Style", "mall_bay", "59"],
  ["Tech", "rear_dock", "43"],
  ["Tech", "street", "55"],
  ["Tech", "mall_bay", "55"],
] as const;

test("one order omits the inter-stop term and two or more orders add it once per gap", () => {
  const single = input("planning_trip_time_formula");
  const one = tripTimeForOrders(single, single.orders);
  assert.equal(one.ok, true);
  if (!one.ok) return;
  assert.equal(one.tripMinutes, "50");
  assert.equal(one.components.interStopMinutes, "0");
  assert.equal(one.components.orderCount, 1);
  assert.equal(one.components.stops.length, 1);

  const two = calculateTripTime(request("40", "15", [stop("Fresh", "rear_dock", "10"), stop("Fresh", "street", "20")]));
  assert.equal(two.ok && two.tripMinutes, "85");
  assert.equal(two.ok && two.components.interStopMinutes, "15");

  const three = calculateTripTime(request("40", "15", [stop("Fresh", "rear_dock", "10"), stop("Fresh", "rear_dock", "10"), stop("Tech", "mall_bay", "10")]));
  assert.equal(three.ok && three.tripMinutes, "100");
  assert.equal(three.ok && three.components.interStopMinutes, "30");
  assert.equal(three.ok && three.components.serviceAllowanceMin, "30");
  assert.equal(three.ok && three.components.stops[2]?.serviceAllowanceMin, "10");
});

test("each approved brand and dock keeps its own allowance", () => {
  for (const [brand, dockType, serviceAllowanceMin] of approvedAllowances) {
    const result = calculateTripTime(request("0", "0", [stop(brand, dockType, serviceAllowanceMin)]));
    assert.equal(result.ok && result.tripMinutes, serviceAllowanceMin);
    assert.equal(result.ok && result.components.stops[0]?.brand, brand);
    assert.equal(result.ok && result.components.stops[0]?.dockType, dockType);
  }
  const mixed = calculateTripTime(request("40", "15", [stop("Fresh", "rear_dock", "15"), stop("Style", "street", "46")]));
  assert.equal(mixed.ok && mixed.tripMinutes, "116");
  const zero = calculateTripTime(request("0", "0", [stop("Fresh", "rear_dock", "0")]));
  assert.equal(zero.ok && zero.tripMinutes, "0");
});

test("a missing budget stays withheld while invalid inputs fail closed", () => {
  const within = input("planning_trip_time_formula");
  const above = input("planning_trip_time_greater");
  const withinResult = evaluateFeasibility(within, candidate(within));
  const aboveResult = evaluateFeasibility(above, candidate(above));
  assert.equal(withinResult.constraints.find((item) => item.id === "trip_time")?.status, "withheld");
  assert.equal(withinResult.constraints.find((item) => item.id === "trip_time")?.measured, "50");
  assert.equal(withinResult.constraints.find((item) => item.id === "trip_time")?.limit, null);
  assert.equal(aboveResult.constraints.find((item) => item.id === "trip_time")?.measured, "51");
  assert.equal(aboveResult.constraints.find((item) => item.id === "trip_time")?.limit, null);

  assert.equal(failureCode(calculateTripTime(request(null, "15", [stop("Fresh", "rear_dock", "10")]))), "missing_depot_travel");
  assert.equal(failureCode(calculateTripTime(request("40", null, [stop("Fresh", "rear_dock", "10")]))), "missing_inter_stop_travel");
  assert.equal(failureCode(calculateTripTime(request("40", "15", [stop("Fresh", "rear_dock", null)]))), "missing_service_allowance");
  assert.equal(failureCode(calculateTripTime(request("-1", "15", [stop("Fresh", "rear_dock", "10")]))), "invalid_travel_time");
  assert.equal(failureCode(calculateTripTime(request("40", "NaN", [stop("Fresh", "rear_dock", "10")]))), "invalid_travel_time");
  assert.equal(failureCode(calculateTripTime(request("40", "Infinity", [stop("Fresh", "rear_dock", "10")]))), "invalid_travel_time");
  assert.equal(failureCode(calculateTripTime(request("40", "15", [stop("Fresh", "rear_dock", "-5")]))), "invalid_service_allowance");
  assert.equal(failureCode(calculateTripTime({ ...request("40", "15", []), orderCount: 0 })), "invalid_order_count");
  assert.equal(failureCode(calculateTripTime({ ...request("40", "15", [stop("Fresh", "rear_dock", "10")]), orderCount: 1.5 })), "invalid_order_count");
  assert.equal(failureCode(calculateTripTime(request("40", "15", [stop("Wholesale", "rear_dock", "10")]))), "unknown_brand");
  assert.equal(failureCode(calculateTripTime(request("40", "15", [stop("Fresh", "side_door", "10")]))), "unknown_dock_type");
  const removed = structuredClone(within);
  removed.serviceAllowances = [];
  assert.equal(tripTimeForOrders(removed, removed.orders).ok, false);
});

test("the same input returns the same minutes and stays unchanged", () => {
  const body = request("40", "15", [stop("Fresh", "rear_dock", "10"), stop("Style", "mall_bay", "20")]);
  const before = JSON.stringify(body);
  const first = calculateTripTime(body);
  const second = calculateTripTime(body);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(body), before);
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/trip-time.ts"), "utf8");
  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("fetch("), false);
  assert.equal(source.includes("ortools"), false);
  assert.equal(source.includes("mallWindow"), false);
  assert.equal(source.includes("TIME_BUDGET"), false);
});

function failureCode(result: TripTimeResult): string | null {
  return result.ok ? null : result.code;
}

function input(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  return found.input as PlanningInput;
}

function candidate(value: PlanningInput): unknown {
  const vehicle = value.vehicles[0];
  if (vehicle === undefined) throw new Error("vehicle");
  return {
    vehicleId: vehicle.vehicleId,
    orderIds: value.orders.map((order: PlanningOrder) => order.id),
    stops: value.orders.map((order: PlanningOrder) => ({ orderId: order.id, plannedArrival: "09:00" })),
    tripDistanceKm: "0",
    existingTripCount: 0,
  };
}

function stop(brand: string, dockType: string, serviceAllowanceMin: string | null): TripTimeRequest["stops"][number] {
  return { brand, dockType, serviceAllowanceMin };
}

function request(depotToDistrictFreeflowMin: string | null, interStopFreeflowMin: string | null, stops: TripTimeRequest["stops"]): TripTimeRequest {
  return { depotToDistrictFreeflowMin, interStopFreeflowMin, orderCount: stops.length, stops };
}
