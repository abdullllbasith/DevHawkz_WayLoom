/**
 * Deterministic feasibility for one supplied candidate.
 * This does not choose routes, allocate a plan, or persist a result.
 */
import { hardConstraints, type DeferralReason, type HardConstraintId } from "./contract.js";
import { addDecimal, compareDecimal, divideDecimalCeil } from "./decimal.js";
import { tripTimeForOrders } from "./trip-time.js";
import { validatePlanningInput } from "./validate.js";
import type { PlanningInput, PlanningOrder, PlanningVehicle } from "./contract.js";

const evaluationOrder = [
  "whole_order",
  "depot_compatibility",
  "brand_compatibility",
  "district_compatibility",
  "temperature",
  "van_only",
  "weight_capacity",
  "volume_capacity",
  "delivery_window",
  "trip_time",
  "weekly_fuel",
  "two_trips",
] as const satisfies readonly HardConstraintId[];

export type ConstraintStatus = "feasible" | "infeasible" | "invalid" | "withheld";

export type ConstraintEvaluation = {
  id: HardConstraintId;
  status: ConstraintStatus;
  measured: string | null;
  limit: string | null;
  deferralReason: DeferralReason | null;
};

export type FeasibilityResult = {
  status: "feasible" | "infeasible" | "invalid";
  constraints: ConstraintEvaluation[];
};

export type PlanningCandidate = {
  vehicleId: string;
  orderIds: string[];
  stops: { orderId: string; plannedArrival: string | null }[];
  tripDistanceKm: string | null;
  existingTripCount: number | null;
};

const secretKeys = new Set(["password", "passwordhash", "session", "sessionid", "cookie", "csrf", "csrftoken", "authorization", "token", "secret"]);

export function evaluateFeasibility(value: unknown, candidateValue: unknown): FeasibilityResult {
  const validated = validatePlanningInput(value);
  const candidate = parseCandidate(candidateValue);
  if (!validated.ok || candidate === null) return { status: "invalid", constraints: [] };
  const vehicle = validated.input.vehicles.find((item) => item.vehicleId === candidate.vehicleId);
  const orders = candidate.orderIds.map((id) => validated.input.orders.find((item) => item.id === id) ?? null);
  if (vehicle === undefined || orders.some((item) => item === null)) return { status: "invalid", constraints: [] };
  const resolved = orders.filter((item): item is PlanningOrder => item !== null);
  const constraints = evaluationOrder.map((id) => evaluate(id, validated.input, vehicle, resolved, candidate));
  return { status: overall(constraints), constraints };
}

function evaluate(
  id: HardConstraintId,
  input: PlanningInput,
  vehicle: PlanningVehicle,
  orders: readonly PlanningOrder[],
  candidate: PlanningCandidate,
): ConstraintEvaluation {
  if (id === "whole_order") return wholeOrder(candidate);
  if (id === "depot_compatibility") return sameContext(orders, vehicle.depot, id);
  if (id === "brand_compatibility") return sameValue(orders.map((item) => item.brand), id);
  if (id === "district_compatibility") return sameValue(orders.map((item) => item.district), id);
  if (id === "temperature") return temperature(orders, vehicle);
  if (id === "van_only") return vanOnly(input, orders, vehicle);
  if (id === "weight_capacity") return capacity(orders.map((item) => item.orderWeightKg), vehicle.weightCapKg, id);
  if (id === "volume_capacity") return capacity(orders.map((item) => item.orderVolumeM3), vehicle.volumeCapM3, id);
  if (id === "delivery_window") return windows(input, candidate);
  if (id === "trip_time") return tripTime(input, orders);
  if (id === "weekly_fuel") return fuel(vehicle, candidate.tripDistanceKm);
  return tripLimit(candidate.existingTripCount);
}

function wholeOrder(candidate: PlanningCandidate): ConstraintEvaluation {
  const unique = new Set(candidate.orderIds);
  const stopIds = candidate.stops.map((item) => item.orderId);
  const same = unique.size === candidate.orderIds.length && unique.size === stopIds.length && stopIds.every((id) => unique.has(id));
  return row("whole_order", same ? "feasible" : "infeasible", String(candidate.orderIds.length), String(unique.size));
}

function sameContext(orders: readonly PlanningOrder[], vehicleDepot: string, id: HardConstraintId): ConstraintEvaluation {
  const values = orders.map((item) => item.depot);
  const matched = values.every((value) => value === vehicleDepot);
  return row(id, matched ? "feasible" : "infeasible", values.find((value) => value !== vehicleDepot) ?? vehicleDepot, vehicleDepot);
}

function sameValue(values: readonly string[], id: HardConstraintId): ConstraintEvaluation {
  const first = values[0] ?? null;
  const matched = first !== null && values.every((value) => value === first);
  return row(id, matched ? "feasible" : "infeasible", first, first);
}

function temperature(orders: readonly PlanningOrder[], vehicle: PlanningVehicle): ConstraintEvaluation {
  const chilled = orders.some((item) => item.tempRequirement === "chilled");
  const matched = !chilled || vehicle.temp === "reefer";
  return row("temperature", matched ? "feasible" : "infeasible", chilled ? "chilled" : "ambient", vehicle.temp);
}

function vanOnly(input: PlanningInput, orders: readonly PlanningOrder[], vehicle: PlanningVehicle): ConstraintEvaluation {
  const outlets = orders.map((item) => input.outlets.find((outlet) => outlet.id === item.outletId));
  const restricted = outlets.some((item) => item?.parkingConstraint === "van_only");
  const matched = !restricted || vehicle.type === "van";
  return row("van_only", matched ? "feasible" : "infeasible", restricted ? "van_only" : "normal", vehicle.type);
}

function capacity(values: readonly string[], limit: string, id: HardConstraintId): ConstraintEvaluation {
  const measured = values.reduce((total, value) => addDecimal(total, value), "0");
  return row(id, compareDecimal(measured, limit) <= 0 ? "feasible" : "infeasible", measured, limit);
}

function windows(input: PlanningInput, candidate: PlanningCandidate): ConstraintEvaluation {
  for (const stop of candidate.stops) {
    const order = input.orders.find((item) => item.id === stop.orderId);
    const outlet = input.outlets.find((item) => item.id === order?.outletId);
    if (order === undefined || outlet === undefined || stop.plannedArrival === null || outlet.windowOpen === null || outlet.windowClose === null) {
      return row("delivery_window", "invalid", stop.plannedArrival, null);
    }
    const arrival = clockSeconds(stop.plannedArrival);
    const open = clockSeconds(outlet.windowOpen);
    const close = clockSeconds(outlet.windowClose);
    if (arrival === null || open === null || close === null || arrival < open || arrival > close) {
      return row("delivery_window", "infeasible", stop.plannedArrival, `${outlet.windowOpen}-${outlet.windowClose}`);
    }
  }
  const first = candidate.stops[0]?.plannedArrival ?? null;
  return row("delivery_window", "feasible", first, null);
}

function tripTime(input: PlanningInput, orders: readonly PlanningOrder[]): ConstraintEvaluation {
  const calculated = tripTimeForOrders(input, orders);
  if (!calculated.ok) return row("trip_time", "invalid", null, null);
  return row("trip_time", "withheld", calculated.tripMinutes, null);
}

function fuel(vehicle: PlanningVehicle, distance: string | null): ConstraintEvaluation {
  if (distance === null || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(distance)) return row("weekly_fuel", "invalid", null, vehicle.weeklyFuelQuotaL);
  const used = divideDecimalCeil(distance, vehicle.kmPerL);
  const projected = addDecimal(vehicle.existingWeeklyFuelL, used);
  const status = compareDecimal(projected, vehicle.weeklyFuelQuotaL) <= 0 ? "feasible" : "infeasible";
  return row("weekly_fuel", status, projected, vehicle.weeklyFuelQuotaL);
}

function tripLimit(existing: number | null): ConstraintEvaluation {
  if (existing === null || !Number.isInteger(existing) || existing < 0) return row("two_trips", "invalid", null, "2");
  const proposed = existing + 1;
  return row("two_trips", proposed <= 2 ? "feasible" : "infeasible", String(proposed), "2");
}

function overall(constraints: readonly ConstraintEvaluation[]): FeasibilityResult["status"] {
  if (constraints.some((item) => item.status === "invalid")) return "invalid";
  if (constraints.some((item) => item.status === "infeasible")) return "infeasible";
  return "feasible";
}

function row(id: HardConstraintId, status: ConstraintStatus, measured: string | null, limit: string | null): ConstraintEvaluation {
  const reason = hardConstraints.find((item) => item.id === id)?.deferralReason ?? null;
  return {
    id,
    status,
    measured,
    limit,
    deferralReason: status === "infeasible" ? reason : null,
  };
}

function parseCandidate(value: unknown): PlanningCandidate | null {
  if (containsSecret(value) || !isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 5 || ["vehicleId", "orderIds", "stops", "tripDistanceKm", "existingTripCount"].some((key) => !keys.includes(key))) return null;
  if (typeof value.vehicleId !== "string" || value.vehicleId.length === 0) return null;
  if (!Array.isArray(value.orderIds) || value.orderIds.some((item) => typeof item !== "string")) return null;
  if (!Array.isArray(value.stops)) return null;
  const stops: PlanningCandidate["stops"] = [];
  for (const stop of value.stops) {
    if (!isRecord(stop) || typeof stop.orderId !== "string") return null;
    if (stop.plannedArrival !== null && typeof stop.plannedArrival !== "string") return null;
    stops.push({ orderId: stop.orderId, plannedArrival: stop.plannedArrival as string | null });
  }
  const distance = value.tripDistanceKm;
  if (distance !== null && typeof distance !== "string") return null;
  const existing = value.existingTripCount;
  if (existing !== null && typeof existing !== "number") return null;
  return {
    vehicleId: value.vehicleId,
    orderIds: value.orderIds as string[],
    stops,
    tripDistanceKm: distance as string | null,
    existingTripCount: existing as number | null,
  };
}

function clockSeconds(value: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(value);
  if (match === null) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] ?? 0);
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (!isRecord(value)) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret(value[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
