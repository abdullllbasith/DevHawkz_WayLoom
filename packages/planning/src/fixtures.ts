/**
 * Deterministic planning scenarios for later Phase 5 tests.
 * These values are not production seed data and do not plan a route.
 */
import { CUTOFF_CLOCK, PLANNING_CONTRACT_VERSION } from "./contract.js";

export type ScenarioClassification = "feasible" | "infeasible" | "validation_failure" | "unallocated" | "withheld";

export type PlanningScenario = {
  name: string;
  purpose: string;
  constraint: string;
  classification: ScenarioClassification;
  boundary: string;
  layer: "unit";
  input: unknown;
  expected: {
    plannedArrival?: string;
    tripMinutes?: string;
    tripDistanceKm?: string | null;
    fuelUsedL?: string | null;
    deferralReason?: string | null;
  };
  rejectedResult?: unknown;
};

const orderId = "55555555-5555-4555-8555-555555555555";
const secondOrderId = "66666666-6666-4666-8666-666666666666";
const outletId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const secondOutletId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const vehicleId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const secondVehicleId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

export function planningScenarios(): PlanningScenario[] {
  return structuredClone(scenarios);
}

const scenarios: PlanningScenario[] = [
  scenario("planning_basic_feasible", "A compatible order fits one vehicle.", "weight_capacity", "feasible", "10 kg and 1 m3 are inside 1000 kg and 10 m3"),
  scenario("planning_weight_exact_capacity", "Order weight equals vehicle weight capacity.", "weight_capacity", "feasible", "order_weight_kg == weight_cap_kg", (input) => {
    input.orders[0].orderWeightKg = "1000";
  }),
  scenario("planning_weight_over_capacity", "Order weight exceeds vehicle weight capacity.", "weight_capacity", "infeasible", "1000.1 kg > 1000 kg", (input) => {
    input.orders[0].orderWeightKg = "1000.1";
  }, { deferralReason: "NO_CAPACITY" }),
  scenario("planning_volume_exact_capacity", "Order volume equals vehicle volume capacity.", "volume_capacity", "feasible", "order_volume_m3 == volume_cap_m3", (input) => {
    input.orders[0].orderVolumeM3 = "10";
  }),
  scenario("planning_volume_over_capacity", "Order volume exceeds vehicle volume capacity.", "volume_capacity", "infeasible", "10.1 m3 > 10 m3", (input) => {
    input.orders[0].orderVolumeM3 = "10.1";
  }, { deferralReason: "NO_CAPACITY" }),
  scenario("planning_reefer_compatible", "A chilled order uses a reefer vehicle.", "temperature", "feasible", "chilled + reefer"),
  scenario("planning_reefer_missing", "A chilled order cannot use an ambient vehicle.", "temperature", "infeasible", "chilled + ambient", (input) => {
    input.vehicles[0].temp = "ambient";
  }, { deferralReason: "NO_REEFER" }),
  scenario("planning_van_only_van", "A van-only outlet uses a van.", "van_only", "feasible", "parking_constraint van_only + van", (input) => {
    input.outlets[0].parkingConstraint = "van_only";
  }),
  scenario("planning_van_only_truck", "A van-only outlet rejects a truck.", "van_only", "infeasible", "parking_constraint van_only + truck", (input) => {
    input.outlets[0].parkingConstraint = "van_only";
    input.vehicles[0].type = "truck";
  }, { deferralReason: "VAN_ACCESS" }),
  scenario("planning_depot_mismatch", "The vehicle depot differs from the outlet depot.", "depot_compatibility", "infeasible", "Peliyagoda outlet + Kandy vehicle", (input) => {
    input.vehicles[0].depot = "Kandy";
  }, { deferralReason: "DEPOT_MISMATCH" }),
  scenario("planning_brand_mismatch", "Two orders of different brands cannot share one trip.", "brand_compatibility", "infeasible", "Fresh + Style", (input) => {
    addSecondOrder(input, { brand: "Style", district: "Colombo", depot: "Peliyagoda" });
  }, { deferralReason: null }),
  scenario("planning_district_mismatch", "Two orders from different districts cannot share one trip.", "district_compatibility", "infeasible", "Colombo + Galle", (input) => {
    addSecondOrder(input, { brand: "Fresh", district: "Galle", depot: "Peliyagoda" });
  }, { deferralReason: null }),
  scenario("planning_window_open", "A planned arrival at the window opening is inside the window.", "delivery_window", "feasible", "08:00 == window_open", undefined, { plannedArrival: "08:00" }),
  scenario("planning_window_close", "A planned arrival at the window closing is inside the window.", "delivery_window", "feasible", "12:00 == window_close", undefined, { plannedArrival: "12:00" }),
  scenario("planning_window_outside", "A planned arrival before the window is outside it.", "delivery_window", "infeasible", "07:59 < 08:00", undefined, { plannedArrival: "07:59", deferralReason: "WINDOW_CONFLICT" }),
  scenario("planning_trip_time_formula", "One order uses the approved trip-time formula.", "trip_time", "withheld", "40 + 15 * 0 + 10 = 50 min; no operational minute cap is approved", (input) => {
    input.travel[0].depotToDistrictFreeflowMin = "40";
    input.travel[0].interStopFreeflowMin = "15";
    input.serviceAllowances[0].serviceAllowanceMin = "10";
  }, { tripMinutes: "50", tripDistanceKm: null, fuelUsedL: null }),
  scenario("planning_trip_time_greater", "A larger service allowance increases the approved trip time.", "trip_time", "withheld", "40 + 15 * 0 + 11 = 51 min; no operational minute cap is approved", (input) => {
    input.travel[0].depotToDistrictFreeflowMin = "40";
    input.travel[0].interStopFreeflowMin = "15";
    input.serviceAllowances[0].serviceAllowanceMin = "11";
  }, { tripMinutes: "51", tripDistanceKm: null, fuelUsedL: null }),
  scenario("planning_fuel_exact_quota", "Supplied trip fuel reaches the weekly quota exactly.", "weekly_fuel", "feasible", "95 L + 50 km / 10 km_per_l = 100 L", (input) => {
    input.vehicles[0].kmPerL = "10";
    input.vehicles[0].existingWeeklyFuelL = "95";
    input.vehicles[0].weeklyFuelQuotaL = "100";
  }, { tripDistanceKm: "50", fuelUsedL: "5", deferralReason: null }),
  scenario("planning_fuel_over_quota", "Supplied trip fuel exceeds the weekly quota.", "weekly_fuel", "infeasible", "96 L + 5 L = 101 L", (input) => {
    input.vehicles[0].kmPerL = "10";
    input.vehicles[0].existingWeeklyFuelL = "96";
    input.vehicles[0].weeklyFuelQuotaL = "100";
  }, { tripDistanceKm: "50", fuelUsedL: "5", deferralReason: null }),
  scenario("planning_two_trips_allowed", "The input carries no prior trip, so one proposed trip stays within two.", "two_trips", "feasible", "trip numbers are 1 and 2; the input has no existing trip count"),
  scenario("planning_third_trip_rejected", "A third trip for one vehicle is rejected by the result contract.", "two_trips", "infeasible", "trip number 1 is repeated", undefined, undefined, rejectedThirdTrip()),
  scenario("planning_whole_order", "An order that exceeds capacity stays whole.", "whole_order", "unallocated", "1500 kg is not split", (input) => {
    input.orders[0].orderWeightKg = "1500";
  }, { deferralReason: null }),
  scenario("planning_demand_over_capacity", "Two whole orders together exceed one vehicle.", "weight_capacity", "infeasible", "600 kg + 600 kg > 1000 kg", (input) => {
    input.orders[0].orderWeightKg = "600";
    addSecondOrder(input, { brand: "Fresh", district: "Colombo", depot: "Peliyagoda", orderWeightKg: "600" });
  }, { deferralReason: "NO_CAPACITY" }),
  scenario("planning_cutoff_before", "A submission timestamp is available for a later cutoff test.", "cutoff", "withheld", "2026-06-01T08:00:00.000Z; timeZone is null", (input) => {
    input.orders[0].submittedAt = "2026-06-01T08:00:00.000Z";
  }),
  scenario("planning_cutoff_boundary", "A 16:00:00Z instant is not classified as the operational cutoff.", "cutoff", "withheld", "2026-06-01T16:00:00.000Z; timeZone is null", (input) => {
    input.orders[0].submittedAt = "2026-06-01T16:00:00.000Z";
  }),
  scenario("planning_cutoff_after", "A later submission timestamp is available for a later cutoff test.", "cutoff", "withheld", "2026-06-01T18:00:00.000Z; timeZone is null", (input) => {
    input.orders[0].submittedAt = "2026-06-01T18:00:00.000Z";
  }),
  scenario("planning_determinism", "Equivalent orders and vehicles have stable contract ordering.", "determinism", "feasible", "deliveryId and vehicleId", (input) => {
    addSecondOrder(input, { brand: "Fresh", district: "Colombo", depot: "Peliyagoda" });
    input.vehicles.push({ ...input.vehicles[0], id: secondVehicleId, vehicleId: "VEH002" });
  }),
  scenario("planning_existing_fuel_commitment", "Existing weekly fuel already fills the quota.", "weekly_fuel", "infeasible", "100 L + 10 km / 10 km_per_l = 101 L", (input) => {
    input.vehicles[0].kmPerL = "10";
    input.vehicles[0].existingWeeklyFuelL = "100";
    input.vehicles[0].weeklyFuelQuotaL = "100";
  }, { tripDistanceKm: "10", fuelUsedL: "1", deferralReason: null }),
  invalid("planning_invalid_weight_capacity", "Vehicle weight capacity is required.", "weight_capacity", (input) => {
    delete (input.vehicles[0] as Record<string, unknown>).weightCapKg;
  }),
  invalid("planning_invalid_weight", "Order weight must be a positive kilogram quantity.", "weight_capacity", (input) => {
    input.orders[0].orderWeightKg = "-1";
  }),
  invalid("planning_invalid_volume", "Order volume must be a positive cubic-metre quantity.", "volume_capacity", (input) => {
    input.orders[0].orderVolumeM3 = "0";
  }),
  invalid("planning_invalid_fuel_efficiency", "Fuel efficiency must be greater than zero.", "weekly_fuel", (input) => {
    input.vehicles[0].kmPerL = "0";
  }),
  invalid("planning_invalid_fuel_quota", "The weekly fuel quota is required.", "weekly_fuel", (input) => {
    delete (input.vehicles[0] as Record<string, unknown>).weeklyFuelQuotaL;
  }),
  invalid("planning_invalid_window", "A window needs both bounds.", "delivery_window", (input) => {
    (input.outlets[0] as { windowClose: string | null }).windowClose = null;
  }),
  invalid("planning_invalid_depot", "A vehicle depot must be an approved depot.", "depot_compatibility", (input) => {
    (input.vehicles[0] as { depot: string }).depot = "Negombo";
  }),
  invalid("planning_invalid_date", "The planning date must be a real calendar date.", "calendar", (input) => {
    input.operationalDate = "2026-06-31";
  }),
];

type Mutable = ReturnType<typeof base>;

function scenario(
  name: string,
  purpose: string,
  constraint: string,
  classification: ScenarioClassification,
  boundary: string,
  change?: (input: Mutable) => void,
  expected: PlanningScenario["expected"] = {},
  rejectedResult?: unknown,
): PlanningScenario {
  const input = base();
  change?.(input);
  return { name, purpose, constraint, classification, boundary, layer: "unit", input, expected, ...(rejectedResult === undefined ? {} : { rejectedResult }) };
}

function invalid(name: string, purpose: string, constraint: string, change: (input: Mutable) => void): PlanningScenario {
  return scenario(name, purpose, constraint, "validation_failure", "invalid input", change);
}

function addSecondOrder(input: Mutable, context: { brand: string; district: string; depot: string; orderWeightKg?: string }): void {
  input.outlets.push({
    ...input.outlets[0],
    id: secondOutletId,
    outletId: "OUT002",
    brand: context.brand,
    district: context.district,
    depot: context.depot,
  });
  input.orders.push({
    ...input.orders[0],
    id: secondOrderId,
    deliveryId: "ORD-200",
    outletId: secondOutletId,
    brand: context.brand,
    district: context.district,
    depot: context.depot,
    orderWeightKg: context.orderWeightKg ?? input.orders[0].orderWeightKg,
  });
}

function rejectedThirdTrip(): unknown {
  const trip = {
    vehicleId: "VEH001",
    tripNumber: 1,
    orderIds: [orderId],
    stops: [{ orderId, sequence: 0, plannedArrival: "09:00" }],
    tripMinutes: "50",
    tripDistanceKm: null,
    fuelUsedL: null,
    projectedWeeklyFuelL: null,
  };
  return {
    contractVersion: PLANNING_CONTRACT_VERSION,
    status: "result",
    operationalDate: "2026-06-02",
    trips: [trip, { ...trip, tripNumber: 2, orderIds: [secondOrderId], stops: [{ orderId: secondOrderId, sequence: 0, plannedArrival: "10:00" }] }, trip],
    unallocated: [],
  };
}

function base() {
  return {
    contractVersion: PLANNING_CONTRACT_VERSION,
    operationalDate: "2026-06-02",
    cutoff: { clock: CUTOFF_CLOCK, timeZone: null },
    orders: [
      {
        id: orderId,
        deliveryId: "ORD-100",
        orderDate: "2026-06-02",
        submittedAt: "2026-06-01T08:00:00.000Z",
        outletId,
        brand: "Fresh",
        district: "Colombo",
        depot: "Peliyagoda",
        tempRequirement: "chilled",
        orderUnits: 10,
        orderWeightKg: "10",
        orderVolumeM3: "1",
      },
    ],
    outlets: [
      {
        id: outletId,
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
        id: vehicleId,
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
