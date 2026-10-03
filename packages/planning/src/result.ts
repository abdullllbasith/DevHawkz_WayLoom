/**
 * Build the versioned planning result from a supplied selection.
 * This does not choose trips, run a solver, or persist a plan.
 */
import type { AllocationExplanation } from "./deferral-reason.js";
import type { ConstructedTrip } from "./construct.js";
import { PLANNING_CONTRACT_VERSION, parsePlanningResult, type PlanningFailure, type PlanningResult } from "./contract.js";
import { validatePlanningInput } from "./validate.js";

const secretKeys = new Set(["password", "passwordhash", "session", "sessionid", "cookie", "csrf", "csrftoken", "authorization", "token", "secret"]);

export type PlanningRun =
  | { ok: true; result: PlanningResult }
  | { ok: false; failure: PlanningFailure };

export function assemblePlanningResult(
  value: unknown,
  selectedTrips: readonly ConstructedTrip[],
  explanations: readonly AllocationExplanation[],
): PlanningRun {
  if (containsSecret(value) || containsSecret(selectedTrips) || containsSecret(explanations)) return failure("service_failure");
  const validated = validatePlanningInput(value);
  if (!validated.ok) return failure("validation_failure");
  const orderIds = validated.input.orders.map((order) => order.id);
  if (explanations.length !== orderIds.length || explanations.some((item) => !orderIds.includes(item.orderId))) return failure("service_failure");
  if (new Set(explanations.map((item) => item.orderId)).size !== explanations.length) return failure("service_failure");
  const covered = selectedTrips.flatMap((trip) => trip.orderIds);
  if (new Set(covered).size !== covered.length) return failure("service_failure");
  const slots = selectedTrips.map((trip) => `${trip.vehicleId}\u0000${trip.tripNumber}`);
  if (new Set(slots).size !== slots.length) return failure("service_failure");
  const allocated = new Set(explanations.filter((item) => item.outcome === "allocated").map((item) => item.orderId));
  const uncovered = explanations.filter((item) => item.outcome === "unallocated");
  if (allocated.size !== covered.length || covered.some((id) => !allocated.has(id))) return failure("service_failure");
  if (uncovered.some((item) => allocated.has(item.orderId) || item.constraint === null)) return failure("service_failure");
  if (explanations.some((item) => item.outcome === "following_run" && (allocated.has(item.orderId) || item.deferralReason !== null))) return failure("service_failure");
  for (const trip of selectedTrips) {
    if (!validated.input.vehicles.some((vehicle) => vehicle.vehicleId === trip.vehicleId)) return failure("service_failure");
    if (trip.orderIds.some((id) => !orderIds.includes(id))) return failure("service_failure");
  }
  const parsed = parsePlanningResult({
    contractVersion: PLANNING_CONTRACT_VERSION,
    status: "result",
    operationalDate: validated.input.operationalDate,
    trips: selectedTrips.map((trip) => ({
      vehicleId: trip.vehicleId,
      tripNumber: trip.tripNumber,
      orderIds: trip.orderIds,
      stops: trip.stops.map((stop) => ({ orderId: stop.orderId, sequence: stop.sequence, plannedArrival: stop.plannedArrival })),
      tripMinutes: trip.tripMinutes,
      tripDistanceKm: trip.tripDistanceKm,
      fuelUsedL: trip.fuelUsedL,
      projectedWeeklyFuelL: trip.projectedWeeklyFuelL,
    })),
    unallocated: uncovered.map((item) => ({
      orderId: item.orderId,
      deliveryId: item.deliveryId,
      constraint: item.constraint,
      deferralReason: item.deferralReason,
    })),
  });
  if (!parsed.ok || parsed.value.solverStatus !== null) return failure("service_failure");
  return { ok: true, result: parsed.value };
}

function failure(status: PlanningFailure["status"]): PlanningRun {
  return { ok: false, failure: { contractVersion: PLANNING_CONTRACT_VERSION, status } };
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret((value as Record<string, unknown>)[key]));
}
