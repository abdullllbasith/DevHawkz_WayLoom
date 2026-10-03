import { executePlanningEngine, type DeferralReason } from "@wayloom/planning";

import type { DeferralReasonName, DeferralStore } from "./deferral.js";
import { recordDeferral } from "./deferral.js";
import type { OrderActor } from "./order.js";
import type { PlanningContextLoadResult } from "./planning-context.js";
import { createTrip, type TripStore } from "./trip.js";

export type PlanningRunDomainCode =
  | "planning_input_unavailable"
  | "planning_validation_failure"
  | "planning_service_failure"
  | "invalid_input"
  | "not_found"
  | "authorization_failure"
  | "invalid_transition"
  | "lifecycle_conflict"
  | "invariant_violation"
  | "concurrency_conflict"
  | "persistence_failure";

export type PlanningRunResult =
  | { ok: true }
  | { ok: false; code: PlanningRunDomainCode };

export async function executePlanningRun(input: {
  actor: OrderActor;
  context: PlanningContextLoadResult;
  now: Date;
  trips: TripStore;
  deferrals: DeferralStore;
}): Promise<PlanningRunResult> {
  if (!input.context.ok) {
    return { ok: false, code: input.context.code };
  }
  const run = executePlanningEngine(input.context.input, input.context.committedTripCounts);
  if (!run.ok) {
    return {
      ok: false,
      code: run.failure.status === "validation_failure" ? "planning_validation_failure" : "planning_service_failure",
    };
  }
  for (const trip of run.result.trips) {
    const vehicleUuid = input.context.vehicleUuidBySourceId.get(trip.vehicleId);
    if (vehicleUuid === undefined) {
      return { ok: false, code: "planning_service_failure" };
    }
    const created = await createTrip({
      actor: input.actor,
      command: {
        operationalDate: run.result.operationalDate,
        vehicleId: vehicleUuid,
        tripNumber: trip.tripNumber,
        routeId: null,
        stops: trip.stops.map((stop) => ({
          orderId: stop.orderId,
          sequence: stop.sequence,
          plannedArrival: stop.plannedArrival,
        })),
      },
      store: input.trips,
    });
    if (!created.ok) {
      return { ok: false, code: created.code };
    }
  }
  for (const unallocated of run.result.unallocated) {
    if (unallocated.deferralReason === null) {
      continue;
    }
    const reason = mapDeferralReason(unallocated.deferralReason);
    if (reason === null) {
      continue;
    }
    const deferred = await recordDeferral({
      actor: input.actor,
      command: { orderId: unallocated.orderId, reason },
      now: input.now,
      store: input.deferrals,
    });
    if (!deferred.ok) {
      return { ok: false, code: deferred.code };
    }
  }
  return { ok: true };
}

function mapDeferralReason(value: DeferralReason): DeferralReasonName | null {
  const allowed: DeferralReasonName[] = [
    "NO_CAPACITY",
    "NO_REEFER",
    "VAN_ACCESS",
    "WINDOW_CONFLICT",
    "DEPOT_MISMATCH",
    "TIME_BUDGET",
  ];
  return allowed.some((reason) => reason === value) ? (value as DeferralReasonName) : null;
}
