import {
  CUTOFF_CLOCK,
  CUTOFF_TIME_ZONE,
  PLANNING_CONTRACT_VERSION,
  type PlanningInput,
} from "@wayloom/planning";

import type { StoredOrder } from "./order.js";

export type PlanningContextLoadResult =
  | {
      ok: true;
      input: PlanningInput;
      vehicleUuidBySourceId: ReadonlyMap<string, string>;
      committedTripCounts: Readonly<Record<string, number | null>>;
    }
  | { ok: false; code: "planning_input_unavailable" };

export type PlanningMasterSnapshot = {
  operationalDate: string;
  calendar: PlanningInput["calendar"];
  travel: PlanningInput["travel"];
  serviceAllowances: PlanningInput["serviceAllowances"];
  vehicles: PlanningInput["vehicles"];
  outlets: PlanningInput["outlets"];
  vehicleUuidBySourceId: ReadonlyMap<string, string>;
};

export function buildPlanningInput(
  operationalDate: string,
  orders: readonly StoredOrder[],
  master: PlanningMasterSnapshot,
  committedTripCounts: Readonly<Record<string, number | null>>,
): PlanningContextLoadResult {
  if (master.calendar.date !== operationalDate) {
    return { ok: false, code: "planning_input_unavailable" };
  }
  const eligibleOrders = orders.filter(
    (order) =>
      order.orderDate === operationalDate &&
      order.status === "CONFIRMED" &&
      order.submittedAt !== null,
  );
  const outletIds = new Set(eligibleOrders.map((order) => order.outletId));
  const outlets = master.outlets.filter((outlet) => outletIds.has(outlet.id));
  if (outlets.length !== outletIds.size) {
    return { ok: false, code: "planning_input_unavailable" };
  }
  const input: PlanningInput = {
    contractVersion: PLANNING_CONTRACT_VERSION,
    operationalDate,
    cutoff: { clock: CUTOFF_CLOCK, timeZone: CUTOFF_TIME_ZONE },
    orders: eligibleOrders.map((order) => ({
      id: order.id,
      deliveryId: order.deliveryId,
      orderDate: order.orderDate,
      submittedAt: order.submittedAt?.toISOString() ?? "",
      outletId: order.outletId,
      brand: order.brand as PlanningInput["orders"][number]["brand"],
      district: order.district,
      depot: order.depot as PlanningInput["orders"][number]["depot"],
      tempRequirement: order.tempRequirement,
      orderUnits: order.orderUnits,
      orderWeightKg: order.orderWeightKg,
      orderVolumeM3: order.orderVolumeM3,
    })),
    outlets,
    vehicles: master.vehicles,
    calendar: master.calendar,
    travel: master.travel,
    serviceAllowances: master.serviceAllowances,
  };
  return {
    ok: true,
    input,
    vehicleUuidBySourceId: master.vehicleUuidBySourceId,
    committedTripCounts,
  };
}
