/**
 * Normalize one candidate into a planning trip and recheck feasibility.
 * This does not choose among competing candidates or persist a trip.
 */
import { addDecimal } from "./decimal.js";
import type { GeneratedCandidate } from "./candidates.js";
import { tripDistanceKm } from "./candidates.js";
import { evaluateFeasibility, type FeasibilityResult } from "./feasibility.js";
import { validateWeeklyFuel } from "./fuel.js";
import { tripTimeForOrders } from "./trip-time.js";
import { validatePlanningInput } from "./validate.js";
import type { PlanningInput, PlanningOrder } from "./contract.js";

const secretKeys = new Set(["password", "passwordhash", "session", "sessionid", "cookie", "csrf", "csrftoken", "authorization", "token", "secret"]);

export type ConstructedTrip = {
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

export type TripConstructionResult =
  | { ok: true; trips: ConstructedTrip[]; rejected: { id: string; code: string }[] }
  | { ok: false; code: "invalid_input" | "invalid_value"; path: string };

export function constructTrips(
  value: unknown,
  candidates: readonly unknown[],
  committedTripCounts: Readonly<Record<string, number | null>>,
): TripConstructionResult {
  if (containsSecret(value) || containsSecret(candidates) || containsSecret(committedTripCounts)) return { ok: false, code: "invalid_value", path: "secret" };
  const validated = validatePlanningInput(value);
  if (!validated.ok) return { ok: false, code: "invalid_input", path: validated.failures[0]?.path ?? "input" };
  const trips: ConstructedTrip[] = [];
  const rejected: { id: string; code: string }[] = [];
  for (const candidate of candidates) {
    const built = constructOne(validated.input, candidate, committedTripCounts);
    if (built.trip === null) rejected.push({ id: built.id, code: built.code });
    else trips.push(built.trip);
  }
  trips.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return { ok: true, trips, rejected };
}

function constructOne(
  input: PlanningInput,
  candidate: unknown,
  committedTripCounts: Readonly<Record<string, number | null>>,
): { trip: ConstructedTrip | null; id: string; code: string } {
  const parsed = parseCandidate(candidate);
  if (parsed === null) return { trip: null, id: "invalid", code: "invalid_candidate" };
  const existing = committedTripCounts[parsed.vehicleId];
  const expected = existing === 0 ? 1 : existing === 1 ? 2 : null;
  if (expected === null || parsed.tripNumber !== expected) return { trip: null, id: parsed.id, code: "two_trips" };
  const orders = parsed.orderIds.map((id) => input.orders.find((order) => order.id === id) ?? null);
  if (orders.some((order) => order === null)) return { trip: null, id: parsed.id, code: "invalid_candidate" };
  const resolved = orders.filter((order): order is PlanningOrder => order !== null);
  const first = resolved[0];
  if (first === undefined) return { trip: null, id: parsed.id, code: "invalid_candidate" };
  const travel = input.travel.find((item) => item.depot === first.depot && item.district === first.district);
  if (travel === undefined) return { trip: null, id: parsed.id, code: "missing_distance" };
  const distance = tripDistanceKm(travel.depotToDistrictKm, travel.interStopKm, resolved.length);
  if (distance === null) return { trip: null, id: parsed.id, code: "invalid_distance" };
  const feasibility = evaluateFeasibility(input, {
    vehicleId: parsed.vehicleId,
    orderIds: parsed.orderIds,
    stops: parsed.stops.map((stop) => ({ orderId: stop.orderId, plannedArrival: stop.plannedArrival })),
    tripDistanceKm: distance,
    existingTripCount: existing ?? null,
  });
  if (feasibility.status !== "feasible") {
    const failed = feasibility.constraints.find((item) => item.status === "infeasible" || item.status === "invalid");
    return { trip: null, id: parsed.id, code: failed?.id ?? feasibility.status };
  }
  const timed = tripTimeForOrders(input, resolved);
  const fuel = validateWeeklyFuel({
    vehicleId: parsed.vehicleId,
    kmPerL: input.vehicles.find((item) => item.vehicleId === parsed.vehicleId)?.kmPerL ?? null,
    weeklyFuelQuotaL: input.vehicles.find((item) => item.vehicleId === parsed.vehicleId)?.weeklyFuelQuotaL ?? null,
    existingWeeklyFuelL: input.vehicles.find((item) => item.vehicleId === parsed.vehicleId)?.existingWeeklyFuelL ?? null,
    trips: [{ tripDistanceKm: distance }],
  });
  if (!timed.ok || !fuel.ok) return { trip: null, id: parsed.id, code: !timed.ok ? timed.code : "weekly_fuel" };
  return {
    trip: {
      id: `${parsed.vehicleId}|${parsed.tripNumber}|${parsed.orderIds.join("|")}`,
      vehicleId: parsed.vehicleId,
      tripNumber: parsed.tripNumber,
      orderIds: [...parsed.orderIds],
      stops: parsed.stops.map((stop) => ({ ...stop })),
      weightKg: resolved.reduce((total, order) => addDecimal(total, order.orderWeightKg), "0"),
      volumeM3: resolved.reduce((total, order) => addDecimal(total, order.orderVolumeM3), "0"),
      tripMinutes: timed.tripMinutes,
      tripDistanceKm: distance,
      fuelUsedL: fuel.fuelUsedL,
      projectedWeeklyFuelL: fuel.projectedWeeklyFuelL,
      feasibility,
    },
    id: parsed.id,
    code: "feasible",
  };
}

function parseCandidate(value: unknown): GeneratedCandidate | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as GeneratedCandidate;
  if (typeof body.vehicleId !== "string" || body.vehicleId.length === 0) return null;
  if (body.tripNumber !== 1 && body.tripNumber !== 2) return null;
  if (!Array.isArray(body.orderIds) || body.orderIds.length === 0 || body.orderIds.some((id) => typeof id !== "string")) return null;
  if (new Set(body.orderIds).size !== body.orderIds.length) return null;
  if (!Array.isArray(body.stops) || body.stops.length !== body.orderIds.length) return null;
  for (let index = 0; index < body.stops.length; index += 1) {
    const stop = body.stops[index];
    if (stop === undefined || stop.orderId !== body.orderIds[index] || stop.sequence !== index) return null;
    if (stop.plannedArrival !== null && typeof stop.plannedArrival !== "string") return null;
  }
  return body;
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret((value as Record<string, unknown>)[key]));
}
