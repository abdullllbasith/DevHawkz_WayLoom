import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateCandidates, tripDistanceKm } from "./candidates.js";
import { constructTrips, type ConstructedTrip } from "./construct.js";
import { classifyCutoff, cutoffEligibleOrders } from "./cutoff.js";
import { explainAllocations } from "./deferral-reason.js";
import { evaluateFeasibility, type PlanningCandidate } from "./feasibility.js";
import { validateWeeklyFuel } from "./fuel.js";
import { assemblePlanningResult } from "./result.js";
import { hardConstraints, parsePlanningInput, parsePlanningResult, planningAuthority, type PlanningInput, type PlanningOrder } from "./contract.js";
import { planningScenarios, type PlanningScenario } from "./fixtures.js";
import { tripTimeForOrders } from "./trip-time.js";

const countsFor = (input: PlanningInput, count: number): Record<string, number> =>
  Object.fromEntries(input.vehicles.map((vehicle) => [vehicle.vehicleId, count]));

test("every approved fixture keeps its existing classification", () => {
  for (const item of planningScenarios()) {
    const before = JSON.stringify(item.input);
    const parsed = parsePlanningInput(item.input);
    if (item.classification === "validation_failure") {
      assert.equal(parsed.ok, false, item.name);
      assert.equal(generateCandidates(item.input, { VEH001: 0 }).ok, false, item.name);
      const run = assemblePlanningResult(item.input, [], []);
      assert.equal(run.ok, false, item.name);
      if (!run.ok) {
        assert.equal(run.failure.status, "validation_failure", item.name);
        assert.equal(JSON.stringify(run.failure).includes("trips"), false, item.name);
      }
      assert.equal(JSON.stringify(item.input), before, item.name);
      continue;
    }
    assert.equal(parsed.ok, true, item.name);
    if (!parsed.ok) continue;
    const input = parsed.value;
    if (item.constraint === "cutoff") checkCutoff(item, input);
    else if (item.constraint === "trip_time") checkTripTime(item, input);
    else if (item.constraint === "weekly_fuel") checkFuel(item, input);
    else if (item.name === "planning_third_trip_rejected") checkThirdTrip(item, input);
    else if (item.name === "planning_two_trips_allowed") checkTwoTrips(input);
    else if (item.name === "planning_window_outside") checkWindowOutside(item, input);
    else if (item.name === "planning_window_open" || item.name === "planning_window_close") checkWindow(item, input);
    else if (item.name === "planning_whole_order") checkWholeOrder(input);
    else if (input.orders.length > 1 && item.classification === "infeasible") checkCombined(item, input);
    else if (item.classification === "infeasible") checkUnallocated(item, input);
    else if (item.name === "planning_determinism") checkDeterminism(input);
    else checkAllocated(item, input);
    assert.equal(JSON.stringify(item.input), before, item.name);
  }
});

test("cutoff equality waits, and planning does not confirm or call a solver", () => {
  const before = classifyCutoff({ operationalDate: "2026-06-02", timeZone: "Asia/Colombo", submittedAt: "2026-06-01T10:29:59.000Z" });
  const exact = classifyCutoff({ operationalDate: "2026-06-02", timeZone: "Asia/Colombo", submittedAt: "2026-06-01T10:30:00.000Z" });
  const after = classifyCutoff({ operationalDate: "2026-06-02", timeZone: "Asia/Colombo", submittedAt: "2026-06-01T10:30:01.000Z" });
  assert.equal(before.ok && before.planningRun, "next");
  assert.equal(exact.ok && exact.planningRun, "following");
  assert.equal(after.ok && after.planningRun, "following");
  assert.equal(planningAuthority.feasibility, "deterministic_engine");
  assert.equal(planningAuthority.confirmation, "dispatcher");
  assert.equal(planningAuthority.objective, null);
  assert.equal(planningAuthority.ai, "decision_support");
  const input = scenario("planning_basic_feasible");
  const selected = allocatedTrips(input);
  const explained = explainAllocations(input, [], countsFor(input, 0));
  assert.equal(explained.ok, false);
  if (!explained.ok) assert.equal(explained.code, "no_evidence");
  const missing = generateCandidates(input, {});
  assert.equal(missing.ok && missing.candidates.length, 0);
  assert.equal(missing.ok && missing.unallocated[0]?.constraint, "missing_existing_trip_count");
  const run = assemblePlanningResult(input, selected, explainAllocated(input, selected).orders);
  assert.equal(run.ok && run.result.solverStatus, null);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
  for (const file of readdirSync(root).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))) {
    const source = readFileSync(resolve(root, file), "utf8");
    assert.equal(source.includes("prisma"), false, file);
    assert.equal(source.includes("ortools"), false, file);
    assert.equal(source.includes("fetch("), false, file);
  }
});

function checkCutoff(item: PlanningScenario, input: PlanningInput): void {
  const cutoff = cutoffEligibleOrders(input);
  assert.equal(cutoff.ok, true, item.name);
  if (!cutoff.ok) return;
  const eligible = item.name === "planning_cutoff_before";
  assert.equal(cutoff.eligibleOrderIds.length, eligible ? input.orders.length : 0, item.name);
  if (eligible) {
    checkAllocated(item, input);
    return;
  }
  const explained = explainAllocations(input, [], countsFor(input, 0));
  assert.equal(explained.ok, true, item.name);
  if (!explained.ok) return;
  assert.equal(explained.orders.every((order) => order.outcome === "following_run" && order.deferralReason === null), true, item.name);
  const run = assemblePlanningResult(input, [], explained.orders);
  assert.equal(run.ok && run.result.unallocated.length, 0, item.name);
  assert.equal(run.ok && run.result.solverStatus, null, item.name);
}

function checkTripTime(item: PlanningScenario, input: PlanningInput): void {
  const timed = tripTimeForOrders(input, input.orders);
  assert.equal(timed.ok && timed.tripMinutes, item.expected.tripMinutes, item.name);
  const feasibility = evaluateFeasibility(input, candidate(input, input.orders, input.outlets[0]?.windowOpen ?? null));
  assert.equal(feasibility.status, "feasible", item.name);
  assert.equal(feasibility.constraints.find((constraint) => constraint.id === "trip_time")?.status, "withheld", item.name);
  const generated = generateCandidates(input, countsFor(input, 0));
  assert.equal(generated.ok && generated.candidates.length, 1, item.name);
}

function checkFuel(item: PlanningScenario, input: PlanningInput): void {
  const vehicle = input.vehicles[0];
  assert.ok(vehicle !== undefined, item.name);
  const fuel = validateWeeklyFuel({
    vehicleId: vehicle.vehicleId,
    kmPerL: vehicle.kmPerL,
    weeklyFuelQuotaL: vehicle.weeklyFuelQuotaL,
    existingWeeklyFuelL: vehicle.existingWeeklyFuelL,
    trips: [{ tripDistanceKm: item.expected.tripDistanceKm ?? null }],
  });
  assert.equal(fuel.ok, true, item.name);
  if (!fuel.ok) return;
  assert.equal(fuel.fuelUsedL, item.expected.fuelUsedL, item.name);
  assert.equal(fuel.status, item.classification === "feasible" ? "feasible" : "infeasible", item.name);
  assert.equal(hardConstraints.find((constraint) => constraint.id === "weekly_fuel")?.deferralReason, null);
  assert.equal(JSON.stringify(fuel).includes("FUEL_QUOTA"), false, item.name);
}

function checkThirdTrip(item: PlanningScenario, input: PlanningInput): void {
  assert.equal(parsePlanningResult(item.rejectedResult).ok, false, item.name);
  const blocked = generateCandidates(input, countsFor(input, 2));
  assert.equal(blocked.ok && blocked.candidates.length, 0, item.name);
  assert.equal(blocked.ok && blocked.unallocated[0]?.constraint, "two_trips", item.name);
  assert.equal(blocked.ok && blocked.unallocated[0]?.deferralReason, null, item.name);
}

function checkTwoTrips(input: PlanningInput): void {
  const first = generateCandidates(input, countsFor(input, 0));
  const second = generateCandidates(input, countsFor(input, 1));
  assert.equal(first.ok && first.candidates[0]?.tripNumber, 1);
  assert.equal(second.ok && second.candidates[0]?.tripNumber, 2);
  assert.equal(JSON.stringify(first), JSON.stringify(generateCandidates(input, countsFor(input, 0))));
}

function checkWindowOutside(item: PlanningScenario, input: PlanningInput): void {
  const feasibility = evaluateFeasibility(input, candidate(input, input.orders, item.expected.plannedArrival ?? null));
  const window = feasibility.constraints.find((constraint) => constraint.id === "delivery_window");
  assert.equal(window?.status, "infeasible", item.name);
  assert.equal(window?.deferralReason, "WINDOW_CONFLICT", item.name);
}

function checkWindow(item: PlanningScenario, input: PlanningInput): void {
  const feasibility = evaluateFeasibility(input, candidate(input, input.orders, item.expected.plannedArrival ?? null));
  assert.equal(feasibility.constraints.find((constraint) => constraint.id === "delivery_window")?.status, "feasible", item.name);
  checkAllocated(item, input);
}

function checkWholeOrder(input: PlanningInput): void {
  const generated = generateCandidates(input, countsFor(input, 0));
  assert.equal(generated.ok && generated.candidates.length, 0);
  assert.equal(generated.ok && generated.unallocated.length, 1);
  assert.equal(generated.ok && generated.unallocated[0]?.orderId, input.orders[0]?.id);
  assert.equal(generated.ok && generated.unallocated[0]?.deferralReason, null);
  const explained = explainAllocations(input, [], countsFor(input, 0));
  assert.equal(explained.ok && explained.orders[0]?.constraint, "weight_capacity");
  assert.equal(explained.ok && explained.orders[0]?.deferralReason, "NO_CAPACITY");
  assert.equal(hardConstraints.find((constraint) => constraint.id === "whole_order")?.deferralReason, null);
}

function checkCombined(item: PlanningScenario, input: PlanningInput): void {
  const feasibility = evaluateFeasibility(input, candidate(input, input.orders, input.outlets[0]?.windowOpen ?? null));
  const constraint = feasibility.constraints.find((entry) => entry.id === item.constraint);
  assert.equal(constraint?.status, "infeasible", item.name);
  assert.equal(constraint?.deferralReason, item.expected.deferralReason ?? null, item.name);
  const generated = generateCandidates(input, countsFor(input, 0));
  assert.equal(generated.ok, true, item.name);
  if (!generated.ok) return;
  assert.equal(generated.candidates.some((entry) => entry.orderIds.length === input.orders.length), false, item.name);
  assert.equal(generated.candidates.length > 0, true, item.name);
  const unexplained = explainAllocations(input, [], countsFor(input, 0));
  assert.equal(unexplained.ok, false, item.name);
  if (!unexplained.ok) assert.equal(unexplained.code, "no_evidence", item.name);
}

function checkUnallocated(item: PlanningScenario, input: PlanningInput): void {
  const generated = generateCandidates(input, countsFor(input, 0));
  assert.equal(generated.ok && generated.candidates.length, 0, item.name);
  const explained = explainAllocations(input, [], countsFor(input, 0));
  assert.equal(explained.ok, true, item.name);
  if (!explained.ok) return;
  assert.equal(explained.orders[0]?.outcome, "unallocated", item.name);
  assert.equal(explained.orders[0]?.constraint, item.constraint, item.name);
  assert.equal(explained.orders[0]?.deferralReason, item.expected.deferralReason ?? null, item.name);
  const run = assemblePlanningResult(input, [], explained.orders);
  assert.equal(run.ok && run.result.trips.length, 0, item.name);
  assert.equal(run.ok && run.result.unallocated.length, 1, item.name);
  assert.equal(run.ok && run.result.solverStatus, null, item.name);
}

function checkAllocated(item: PlanningScenario, input: PlanningInput): void {
  const selected = allocatedTrips(input);
  assert.equal(selected.length > 0, true, item.name);
  const explained = explainAllocated(input, selected);
  const run = assemblePlanningResult(input, selected, explained.orders);
  assert.equal(run.ok, true, item.name);
  if (!run.ok) return;
  const covered = new Set(run.result.trips.flatMap((trip) => trip.orderIds));
  assert.equal(run.result.unallocated.some((order) => covered.has(order.orderId)), false, item.name);
  assert.equal(run.result.solverStatus, null, item.name);
  assert.equal(JSON.stringify(run), JSON.stringify(assemblePlanningResult(input, selected, explained.orders)), item.name);
  const named = evaluateFeasibility(input, candidate(input, input.orders.filter((order) => selected[0]?.orderIds.includes(order.id)), input.outlets[0]?.windowOpen ?? null));
  if (hardConstraints.some((constraint) => constraint.id === item.constraint)) {
    assert.equal(named.constraints.find((constraint) => constraint.id === item.constraint)?.status, "feasible", item.name);
  }
}

function checkDeterminism(input: PlanningInput): void {
  const first = generateCandidates(input, countsFor(input, 0));
  const second = generateCandidates(input, countsFor(input, 0));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.ok && first.candidates.length > 1, true);
  if (!first.ok) return;
  const built = constructTrips(input, first.candidates, countsFor(input, 0));
  assert.equal(built.ok && built.trips.length, first.candidates.length);
  const vehicles = new Set(first.candidates.filter((entry) => entry.orderIds.length === input.orders.length).map((entry) => entry.vehicleId));
  assert.equal(vehicles.size > 1, true);
}

function allocatedTrips(input: PlanningInput): ConstructedTrip[] {
  const generated = generateCandidates(input, countsFor(input, 0));
  if (!generated.ok) throw new Error("candidates");
  const built = constructTrips(input, generated.candidates, countsFor(input, 0));
  if (!built.ok) throw new Error("trips");
  const covering = built.trips.find((trip) => trip.orderIds.length === input.orders.length) ?? built.trips[0];
  return covering === undefined ? [] : [covering];
}

function explainAllocated(input: PlanningInput, selected: readonly ConstructedTrip[]) {
  const explained = explainAllocations(input, selected, countsFor(input, 0));
  if (!explained.ok) throw new Error(explained.code);
  return explained;
}

function candidate(input: PlanningInput, orders: readonly PlanningOrder[], arrival: string | null): PlanningCandidate {
  const first = orders[0];
  const travel = input.travel.find((item) => item.depot === first?.depot && item.district === first.district);
  return {
    vehicleId: input.vehicles[0]?.vehicleId ?? "",
    orderIds: orders.map((order) => order.id),
    stops: orders.map((order) => ({ orderId: order.id, plannedArrival: arrival })),
    tripDistanceKm: travel === undefined ? null : tripDistanceKm(travel.depotToDistrictKm, travel.interStopKm, orders.length),
    existingTripCount: 0,
  };
}

function scenario(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  const parsed = parsePlanningInput(found.input);
  if (!parsed.ok) throw new Error(name);
  return parsed.value;
}
