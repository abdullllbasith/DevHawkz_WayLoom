import { hardConstraints, PLANNING_CONTRACT_VERSION, type PlanningResult } from "@wayloom/planning";

import type { StoredDeferral } from "../domain/deferral.js";
import type { StoredTrip } from "../domain/trip.js";

export function planningResultFromStored(input: {
  operationalDate: string;
  trips: readonly StoredTrip[];
  deferrals: readonly StoredDeferral[];
  deliveryIdByOrderId: ReadonlyMap<string, string>;
}): { ok: true; result: PlanningResult } | { ok: false; summary: string } {
  const summary = storedPlanningSummary(input);
  const trips: PlanningResult["trips"] = [];
  for (const trip of input.trips) {
    if (trip.tripNumber !== 1 && trip.tripNumber !== 2) {
      return { ok: false, summary };
    }
    trips.push({
      vehicleId: trip.vehicleId,
      tripNumber: trip.tripNumber,
      orderIds: trip.stops.map((stop) => stop.orderId),
      stops: trip.stops.map((stop) => ({
        orderId: stop.orderId,
        sequence: stop.sequence,
        plannedArrival: stop.plannedArrival,
      })),
      tripMinutes: "0",
      tripDistanceKm: null,
      fuelUsedL: null,
      projectedWeeklyFuelL: null,
    });
  }
  const unallocated: PlanningResult["unallocated"] = [];
  for (const deferral of input.deferrals) {
    const deliveryId = input.deliveryIdByOrderId.get(deferral.orderId);
    const constraint = constraintForReason(deferral.reason);
    if (deliveryId === undefined || constraint === null) {
      return { ok: false, summary };
    }
    unallocated.push({
      orderId: deferral.orderId,
      deliveryId,
      constraint,
      deferralReason: deferral.reason,
    });
  }
  return {
    ok: true,
    result: {
      contractVersion: PLANNING_CONTRACT_VERSION,
      status: "result",
      operationalDate: input.operationalDate,
      trips,
      unallocated,
      solverStatus: null,
    },
  };
}

export function storedPlanningSummary(input: {
  operationalDate: string;
  trips: readonly StoredTrip[];
  deferrals: readonly StoredDeferral[];
  deliveryIdByOrderId: ReadonlyMap<string, string>;
}): string {
  const served = input.trips.reduce((sum, trip) => sum + trip.stops.length, 0);
  if (input.deferrals.length === 0) {
    return `Planning ${input.operationalDate}: ${served} served orders. No deferred reason was supplied.`;
  }
  const reasons = input.deferrals.map((deferral) => {
    const deliveryId = input.deliveryIdByOrderId.get(deferral.orderId) ?? deferral.orderId;
    return `${deliveryId} ${deferral.reason}`;
  });
  return `Planning ${input.operationalDate}: served ${served}. ${reasons.join("; ")}.`;
}

function constraintForReason(reason: StoredDeferral["reason"]): PlanningResult["unallocated"][number]["constraint"] | null {
  const matches = hardConstraints.filter((item) => item.deferralReason === reason);
  return matches.length === 1 ? matches[0].id : null;
}
