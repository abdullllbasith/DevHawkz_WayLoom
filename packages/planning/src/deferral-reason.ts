/**
 * Explain an eligible order that was not in the supplied selection.
 * This does not choose the selection, persist a deferral, or add a reason code.
 */
import { tripDistanceKm } from "./candidates.js";
import { classifyCutoff } from "./cutoff.js";
import { evaluateFeasibility } from "./feasibility.js";
import { validatePlanningInput } from "./validate.js";
import { hardConstraints, type DeferralReason, type HardConstraintId, type PlanningInput, type PlanningOrder, type PlanningVehicle } from "./contract.js";

const precedence = [
  "depot_compatibility",
  "temperature",
  "van_only",
  "delivery_window",
  "trip_time",
  "weekly_fuel",
  "weight_capacity",
  "volume_capacity",
] as const satisfies readonly HardConstraintId[];

const secretKeys = new Set(["password", "passwordhash", "session", "sessionid", "cookie", "csrf", "csrftoken", "authorization", "token", "secret"]);

export type AllocationExplanation = {
  orderId: string;
  deliveryId: string;
  outcome: "allocated" | "following_run" | "unallocated";
  constraint: HardConstraintId | null;
  deferralReason: DeferralReason | null;
};

export type DeferralExplanationResult =
  | { ok: true; orders: AllocationExplanation[] }
  | { ok: false; code: "invalid_input" | "invalid_value" | "duplicate_selection" | "no_evidence"; path: string };

export function explainAllocations(
  value: unknown,
  selected: readonly { orderIds: readonly string[] }[],
  committedTripCounts: Readonly<Record<string, number | null>>,
): DeferralExplanationResult {
  if (containsSecret(value) || containsSecret(selected) || containsSecret(committedTripCounts)) return { ok: false, code: "invalid_value", path: "secret" };
  const validated = validatePlanningInput(value);
  if (!validated.ok) return { ok: false, code: "invalid_input", path: validated.failures[0]?.path ?? "input" };
  const selectedIds = selected.flatMap((trip) => [...trip.orderIds]);
  if (new Set(selectedIds).size !== selectedIds.length) return { ok: false, code: "duplicate_selection", path: "orderIds" };
  const selectedSet = new Set(selectedIds);
  const orders: AllocationExplanation[] = [];
  for (const order of validated.input.orders) {
    const explained = explainOrder(validated.input, order, selectedSet, committedTripCounts);
    if (explained.ok === false) return { ok: false, code: "no_evidence", path: order.id };
    orders.push(explained.explanation);
  }
  return { ok: true, orders };
}

function explainOrder(
  input: PlanningInput,
  order: PlanningOrder,
  selected: ReadonlySet<string>,
  committedTripCounts: Readonly<Record<string, number | null>>,
): { ok: true; explanation: AllocationExplanation } | { ok: false } {
  const cutoff = classifyCutoff({ operationalDate: input.operationalDate, timeZone: input.cutoff.timeZone, submittedAt: order.submittedAt });
  if (!cutoff.ok) return { ok: false };
  if (cutoff.planningRun === "following") {
    return { ok: true, explanation: { orderId: order.id, deliveryId: order.deliveryId, outcome: "following_run", constraint: null, deferralReason: null } };
  }
  if (selected.has(order.id)) {
    return { ok: true, explanation: { orderId: order.id, deliveryId: order.deliveryId, outcome: "allocated", constraint: null, deferralReason: null } };
  }
  const evidenced = new Set<HardConstraintId>();
  let feasiblePath = false;
  for (const vehicle of input.vehicles) {
    const existing = committedTripCounts[vehicle.vehicleId];
    if (existing === undefined || existing === null || !Number.isInteger(existing) || existing < 0 || existing >= 2) {
      evidenced.add("two_trips");
      continue;
    }
    const attempt = singleOrder(input, order, vehicle, existing);
    if (attempt === "feasible") feasiblePath = true;
    else if (attempt !== null) evidenced.add(attempt);
  }
  if (feasiblePath) return { ok: false };
  const constraint = primary(evidenced);
  if (constraint === null) return { ok: false };
  return {
    ok: true,
    explanation: {
      orderId: order.id,
      deliveryId: order.deliveryId,
      outcome: "unallocated",
      constraint,
      deferralReason: hardConstraints.find((item) => item.id === constraint)?.deferralReason ?? null,
    },
  };
}

function singleOrder(input: PlanningInput, order: PlanningOrder, vehicle: PlanningVehicle, existingTripCount: number): HardConstraintId | "feasible" | null {
  const outlet = input.outlets.find((item) => item.id === order.outletId);
  const travel = input.travel.find((item) => item.depot === order.depot && item.district === order.district);
  if (outlet === undefined || travel === undefined) return null;
  const distance = tripDistanceKm(travel.depotToDistrictKm, travel.interStopKm, 1);
  if (distance === null) return null;
  const result = evaluateFeasibility(input, {
    vehicleId: vehicle.vehicleId,
    orderIds: [order.id],
    stops: [{ orderId: order.id, plannedArrival: outlet.windowOpen }],
    tripDistanceKm: distance,
    existingTripCount,
  });
  if (result.status === "feasible") return "feasible";
  return result.constraints.find((item) => item.status === "infeasible")?.id ?? null;
}

function primary(evidenced: ReadonlySet<HardConstraintId>): HardConstraintId | null {
  for (const id of precedence) {
    if (evidenced.has(id)) return id;
  }
  for (const item of hardConstraints) {
    if (evidenced.has(item.id)) return item.id;
  }
  return null;
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret((value as Record<string, unknown>)[key]));
}
