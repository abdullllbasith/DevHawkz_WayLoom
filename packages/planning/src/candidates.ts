/**
 * Bounded feasible candidate trips for one planning input.
 * This does not choose a final plan, persist a trip, or create a deferral.
 * Stop order follows deliveryId. Each stop arrival is that outlet's window opening.
 */
import { addDecimal, multiplyDecimal } from "./decimal.js";
import { cutoffEligibleOrders } from "./cutoff.js";
import { evaluateFeasibility, type FeasibilityResult } from "./feasibility.js";
import { validateWeeklyFuel } from "./fuel.js";
import { tripTimeForOrders } from "./trip-time.js";
import { validatePlanningInput } from "./validate.js";
import type { PlanningInput, PlanningOrder, PlanningVehicle } from "./contract.js";

const nonNegative = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const secretKeys = new Set(["password", "passwordhash", "session", "sessionid", "cookie", "csrf", "csrftoken", "authorization", "token", "secret"]);

export type GeneratedCandidate = {
  id: string;
  vehicleId: string;
  tripNumber: 1 | 2;
  orderIds: string[];
  stops: { orderId: string; sequence: number; plannedArrival: string | null }[];
  weightKg: string;
  volumeM3: string;
  tripMinutes: string;
  tripDistanceKm: string;
  fuelUsedL: string;
  projectedWeeklyFuelL: string;
  feasibility: FeasibilityResult;
};

export type UnallocatedOrder = {
  orderId: string;
  deliveryId: string;
  deferralReason: null;
  constraint: string | null;
};

export type CandidateGenerationResult =
  | { ok: true; candidates: GeneratedCandidate[]; unallocated: UnallocatedOrder[] }
  | { ok: false; code: "invalid_input" | "invalid_cutoff" | "invalid_value"; path: string };

export function generateCandidates(value: unknown, committedTripCounts: Readonly<Record<string, number | null>>): CandidateGenerationResult {
  if (containsSecret(value) || containsSecret(committedTripCounts)) return { ok: false, code: "invalid_value", path: "secret" };
  const validated = validatePlanningInput(value);
  if (!validated.ok) return { ok: false, code: "invalid_input", path: validated.failures[0]?.path ?? "input" };
  const input = validated.input;
  const eligible = cutoffEligibleOrders(input);
  if (!eligible.ok) return { ok: false, code: "invalid_cutoff", path: eligible.path };
  const eligibleOrders = input.orders.filter((order) => eligible.eligibleOrderIds.includes(order.id));
  const failures = new Map<string, string | null>();
  const candidates: GeneratedCandidate[] = [];
  const seen = new Set<string>();
  for (const vehicle of input.vehicles) {
    const slot = nextTripNumber(committedTripCounts[vehicle.vehicleId]);
    if (slot.tripNumber === null) {
      for (const order of eligibleOrders) failures.set(order.id, failures.get(order.id) ?? slot.constraint);
      continue;
    }
    const tripNumber = slot.tripNumber;
    for (let start = 0; start < eligibleOrders.length; start += 1) {
      let current: PlanningOrder[] = [];
      for (let index = start; index < eligibleOrders.length; index += 1) {
        const order = eligibleOrders[index];
        if (order === undefined) continue;
        const next = [...current, order];
        const built = buildCandidate(input, vehicle, tripNumber, next, committedTripCounts[vehicle.vehicleId] ?? null);
        if (built.candidate === null) {
          if (next.length === 1) failures.set(order.id, failures.get(order.id) ?? built.constraint);
          continue;
        }
        current = next;
        if (!seen.has(built.candidate.id)) {
          seen.add(built.candidate.id);
          candidates.push(built.candidate);
        }
      }
    }
  }
  const placed = new Set(candidates.flatMap((candidate) => candidate.orderIds));
  const unallocated = eligibleOrders
    .filter((order) => !placed.has(order.id))
    .map((order) => ({ orderId: order.id, deliveryId: order.deliveryId, deferralReason: null as null, constraint: failures.get(order.id) ?? null }));
  candidates.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return { ok: true, candidates, unallocated };
}

export function tripDistanceKm(depotToDistrictKm: string, interStopKm: string, stopCount: number): string | null {
  if (!Number.isInteger(stopCount) || stopCount < 1) return null;
  if (!nonNegative.test(depotToDistrictKm) || !nonNegative.test(interStopKm)) return null;
  if (stopCount === 1) return depotToDistrictKm;
  return addDecimal(depotToDistrictKm, multiplyDecimal(interStopKm, stopCount - 1));
}

function nextTripNumber(existing: number | null | undefined): { tripNumber: 1 | 2 | null; constraint: string } {
  if (existing === undefined || existing === null || !Number.isInteger(existing) || existing < 0) {
    return { tripNumber: null, constraint: "missing_existing_trip_count" };
  }
  if (existing === 0) return { tripNumber: 1, constraint: "two_trips" };
  if (existing === 1) return { tripNumber: 2, constraint: "two_trips" };
  return { tripNumber: null, constraint: "two_trips" };
}

function buildCandidate(
  input: PlanningInput,
  vehicle: PlanningVehicle,
  tripNumber: 1 | 2,
  orders: readonly PlanningOrder[],
  existingTripCount: number | null,
): { candidate: GeneratedCandidate | null; constraint: string | null } {
  const first = orders[0];
  if (first === undefined) return { candidate: null, constraint: null };
  const travel = input.travel.find((item) => item.depot === first.depot && item.district === first.district);
  if (travel === undefined) return { candidate: null, constraint: "missing_distance" };
  const distance = tripDistanceKm(travel.depotToDistrictKm, travel.interStopKm, orders.length);
  if (distance === null) return { candidate: null, constraint: "invalid_distance" };
  const stops = orders.map((order) => {
    const outlet = input.outlets.find((item) => item.id === order.outletId);
    return { orderId: order.id, plannedArrival: outlet?.windowOpen ?? null };
  });
  const feasibility = evaluateFeasibility(input, {
    vehicleId: vehicle.vehicleId,
    orderIds: orders.map((order) => order.id),
    stops,
    tripDistanceKm: distance,
    existingTripCount,
  });
  if (feasibility.status !== "feasible") {
    const failed = feasibility.constraints.find((item) => item.status === "infeasible" || item.status === "invalid");
    return { candidate: null, constraint: failed?.id ?? feasibility.status };
  }
  const timed = tripTimeForOrders(input, orders);
  const fuel = validateWeeklyFuel({
    vehicleId: vehicle.vehicleId,
    kmPerL: vehicle.kmPerL,
    weeklyFuelQuotaL: vehicle.weeklyFuelQuotaL,
    existingWeeklyFuelL: vehicle.existingWeeklyFuelL,
    trips: [{ tripDistanceKm: distance }],
  });
  if (!timed.ok || !fuel.ok) return { candidate: null, constraint: !timed.ok ? timed.code : "weekly_fuel" };
  const orderIds = orders.map((order) => order.id);
  return {
    candidate: {
      id: `${vehicle.vehicleId}|${tripNumber}|${orderIds.join("|")}`,
      vehicleId: vehicle.vehicleId,
      tripNumber,
      orderIds,
      stops: stops.map((stop, sequence) => ({ ...stop, sequence })),
      weightKg: orders.reduce((total, order) => addDecimal(total, order.orderWeightKg), "0"),
      volumeM3: orders.reduce((total, order) => addDecimal(total, order.orderVolumeM3), "0"),
      tripMinutes: timed.tripMinutes,
      tripDistanceKm: distance,
      fuelUsedL: fuel.fuelUsedL,
      projectedWeeklyFuelL: fuel.projectedWeeklyFuelL,
      feasibility,
    },
    constraint: null,
  };
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret((value as Record<string, unknown>)[key]));
}
