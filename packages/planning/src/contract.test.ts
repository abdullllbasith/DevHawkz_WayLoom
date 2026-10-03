import assert from "node:assert/strict";
import test from "node:test";

import {
  CUTOFF_TIME_ZONE,
  FUEL_FORMULA,
  PLANNING_CONTRACT_VERSION,
  TRIP_DISTANCE_FORMULA,
  TRIP_TIME_FORMULA,
  canonicalPlanningInput,
  parsePlanningFailure,
  parsePlanningInput,
  parsePlanningResult,
  planningAuthority,
  planningDatasets,
} from "./contract.js";

const orderId = "55555555-5555-4555-8555-555555555555";
const outletUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const vehicleUuid = "ffffffff-ffff-4fff-8fff-ffffffffffff";

test("a versioned planning input accepts approved fields and sorts them", () => {
  const body = input();
  const orders = body.orders as Record<string, unknown>[];
  const vehicles = body.vehicles as Record<string, unknown>[];
  const first = parsePlanningInput(body);
  const second = parsePlanningInput({ ...body, orders: [...orders].reverse(), vehicles: [...vehicles].reverse() });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.value.contractVersion, PLANNING_CONTRACT_VERSION);
  assert.equal(first.value.cutoff.timeZone, CUTOFF_TIME_ZONE);
  assert.equal(canonicalPlanningInput(first.value), canonicalPlanningInput(second.value));
  assert.equal(TRIP_TIME_FORMULA.includes("service_allowance_min"), true);
  assert.equal(TRIP_DISTANCE_FORMULA, "depot_to_district_km + inter_stop_km * (number_of_stops - 1)");
  assert.equal(FUEL_FORMULA, "trip_distance_km / km_per_l");
  assert.equal(planningDatasets.find((item) => item.dataset === "traffic_speed")?.consumption, "not_consumed");
  assert.equal(planningDatasets.find((item) => item.dataset === "road_conditions")?.consumption, "not_consumed");
  assert.equal(planningAuthority.objective, null);
  assert.equal(planningAuthority.feasibility, "deterministic_engine");
  assert.equal(planningAuthority.confirmation, "dispatcher");
  assert.equal(planningAuthority.ai, "decision_support");
});

test("missing vehicle fuel, a partial window, and a secret are rejected", () => {
  const body = input();
  const vehicle = (body.vehicles as Record<string, unknown>[])[0];
  const order = (body.orders as Record<string, unknown>[])[0];
  const outlet = (body.outlets as Record<string, unknown>[])[0];
  if (vehicle === undefined || order === undefined || outlet === undefined) throw new Error("fixture");
  const withoutEfficiency = { ...vehicle };
  delete withoutEfficiency.kmPerL;
  assert.equal(parsePlanningInput({ ...body, vehicles: [withoutEfficiency] }).ok, false);
  assert.equal(parsePlanningInput({ ...body, orders: [{ ...order, orderWeightKg: "-1" }] }).ok, false);
  const withoutUsage = { ...vehicle };
  delete withoutUsage.existingWeeklyFuelL;
  assert.equal(parsePlanningInput({ ...body, vehicles: [withoutUsage] }).ok, false);
  assert.equal(parsePlanningInput({ ...body, outlets: [{ ...outlet, windowClose: null }] }).ok, false);
  assert.equal(parsePlanningInput({ ...input(), password: "secret" }).ok, false);
  assert.equal(JSON.stringify(parsePlanningInput({ ...input(), password: "secret" })).includes("secret"), false);
});

test("a planning result keeps one whole order, an unallocated order, and no invented deferral reason", () => {
  const result = parsePlanningResult({
    contractVersion: "1",
    status: "result",
    operationalDate: "2026-06-02",
    trips: [
      {
        vehicleId: "VEH001",
        tripNumber: 1,
        orderIds: [orderId],
        stops: [{ orderId, sequence: 0, plannedArrival: "09:30" }],
        tripMinutes: "42",
        tripDistanceKm: null,
        fuelUsedL: null,
        projectedWeeklyFuelL: null,
      },
    ],
    unallocated: [
      { orderId: "66666666-6666-4666-8666-666666666666", deliveryId: "ORD-100", constraint: "weekly_fuel", deferralReason: null },
      { orderId: "77777777-7777-4777-8777-777777777777", deliveryId: "ORD-200", constraint: "weight_capacity", deferralReason: "NO_CAPACITY" },
    ],
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.unallocated[0]?.deliveryId, "ORD-100");
  assert.equal(result.value.unallocated[0]?.deferralReason, null);
  assert.equal(parsePlanningResult({ ...result.value, unallocated: [{ ...result.value.unallocated[1], deferralReason: "FUEL_QUOTA" }] }).ok, false);
  assert.equal(parsePlanningFailure({ contractVersion: "1", status: "validation_failure" }).ok, true);
  assert.equal(parsePlanningFailure({ contractVersion: "1", status: "service_failure", message: "select * from sessions" }).ok, false);
});

function input(): Record<string, unknown> {
  return {
    contractVersion: "1",
    operationalDate: "2026-06-02",
    cutoff: { clock: "16:00:00", timeZone: "Asia/Colombo" },
    orders: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        deliveryId: "ORD-200",
        orderDate: "2026-06-02",
        submittedAt: "2026-06-01T08:00:00.000Z",
        outletId: outletUuid,
        brand: "Fresh",
        district: "Colombo",
        depot: "Peliyagoda",
        tempRequirement: "ambient",
        orderUnits: 4,
        orderWeightKg: "4",
        orderVolumeM3: "0.4",
      },
      {
        id: orderId,
        deliveryId: "ORD-100",
        orderDate: "2026-06-02",
        submittedAt: "2026-06-01T08:00:00.000Z",
        outletId: outletUuid,
        brand: "Fresh",
        district: "Colombo",
        depot: "Peliyagoda",
        tempRequirement: "chilled",
        orderUnits: 10,
        orderWeightKg: "12.5",
        orderVolumeM3: "1.25",
      },
    ],
    outlets: [
      {
        id: outletUuid,
        outletId: "OUT001",
        brand: "Fresh",
        district: "Colombo",
        depot: "Peliyagoda",
        dockType: "rear_dock",
        parkingConstraint: "normal",
        mallWindow: null,
        windowOpen: "08:00",
        windowClose: "12:00",
      },
    ],
    vehicles: [
      {
        id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        vehicleId: "VEH002",
        type: "truck",
        temp: "ambient",
        weightCapKg: "2000",
        volumeCapM3: "20",
        fuelType: "diesel",
        kmPerL: "6",
        weeklyFuelQuotaL: "300",
        existingWeeklyFuelL: "10",
        depot: "Peliyagoda",
      },
      {
        id: vehicleUuid,
        vehicleId: "VEH001",
        type: "van",
        temp: "reefer",
        weightCapKg: "1000",
        volumeCapM3: "10",
        fuelType: "diesel",
        kmPerL: "8.5",
        weeklyFuelQuotaL: "200",
        existingWeeklyFuelL: "0",
        depot: "Peliyagoda",
      },
    ],
    calendar: {
      date: "2026-06-02",
      dow: 2,
      dowName: "Tue",
      isWeekend: 0,
      isoYear: 2026,
      isoWeek: 23,
      isPayday: 0,
      festival: "",
      festivalRamp: "0.0",
      isHoliday: 0,
      monsoon: 0,
      isOperating: 1,
    },
    travel: [
      {
        depot: "Peliyagoda",
        district: "Colombo",
        depotToDistrictKm: "12",
        depotToDistrictFreeflowMin: "30",
        interStopKm: "2",
        interStopFreeflowMin: "5",
      },
    ],
    serviceAllowances: [{ brand: "Fresh", dockType: "rear_dock", serviceAllowanceMin: "12" }],
  };
}
