/**
 * Planning contract version 1.
 * This module checks the Node ↔ Python planning payload. It does not plan.
 */

export const PLANNING_CONTRACT_VERSION = "1" as const;

export const planningUnits = {
  weight: "kg",
  volume: "m3",
  distance: "km",
  time: "min",
  fuel: "L",
  fuelEfficiency: "km_per_l",
} as const;

export const TRIP_TIME_FORMULA =
  "depot_to_district_freeflow_min + inter_stop_freeflow_min * (orders - 1) + sum(service_allowance_min(brand, dock_type))" as const;

export const FUEL_FORMULA = "trip_distance_km / km_per_l" as const;

export const PROJECTED_FUEL_FORMULA = "existing_weekly_fuel_l + fuel_used_l" as const;

/** Booklet cutoff clock. Equality waits for the following run. Asia/Colombo is UTC+05:30. */
export const CUTOFF_CLOCK = "16:00:00" as const;

export const CUTOFF_TIME_ZONE = "Asia/Colombo" as const;

export const deferralReasons = [
  "NO_CAPACITY",
  "NO_REEFER",
  "VAN_ACCESS",
  "WINDOW_CONFLICT",
  "DEPOT_MISMATCH",
  "TIME_BUDGET",
] as const;

export type DeferralReason = (typeof deferralReasons)[number];

export const hardConstraints = [
  { id: "depot_compatibility", deferralReason: "DEPOT_MISMATCH" },
  { id: "brand_compatibility", deferralReason: null },
  { id: "district_compatibility", deferralReason: null },
  { id: "temperature", deferralReason: "NO_REEFER" },
  { id: "van_only", deferralReason: "VAN_ACCESS" },
  { id: "weight_capacity", deferralReason: "NO_CAPACITY" },
  { id: "volume_capacity", deferralReason: "NO_CAPACITY" },
  { id: "whole_order", deferralReason: null },
  { id: "delivery_window", deferralReason: "WINDOW_CONFLICT" },
  { id: "trip_time", deferralReason: "TIME_BUDGET" },
  { id: "weekly_fuel", deferralReason: null },
  { id: "two_trips", deferralReason: null },
] as const;

export type HardConstraintId = (typeof hardConstraints)[number]["id"];

export const planningDatasets = [
  { dataset: "outlets", consumption: "required" },
  { dataset: "vehicles", consumption: "required" },
  { dataset: "calendar", consumption: "required" },
  { dataset: "district_travel", consumption: "required" },
  { dataset: "service_allowance", consumption: "required" },
  { dataset: "traffic_speed", consumption: "not_consumed" },
  { dataset: "road_conditions", consumption: "not_consumed" },
] as const;

export const planningAuthority = {
  feasibility: "deterministic_engine",
  confirmation: "dispatcher",
  ai: "decision_support",
} as const;

const secretKeys = new Set([
  "password",
  "passwordhash",
  "session",
  "sessionid",
  "cookie",
  "csrf",
  "csrftoken",
  "authorization",
  "token",
  "secret",
]);

export type ContractResult<T> = { ok: true; value: T } | { ok: false; code: "invalid_input" };

export type PlanningOrder = {
  id: string;
  deliveryId: string;
  orderDate: string;
  submittedAt: string;
  outletId: string;
  brand: "Fresh" | "Style" | "Tech";
  district: string;
  depot: "Peliyagoda" | "Kandy";
  tempRequirement: "chilled" | "ambient";
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
};

export type PlanningOutlet = {
  id: string;
  outletId: string;
  brand: "Fresh" | "Style" | "Tech";
  district: string;
  depot: "Peliyagoda" | "Kandy";
  dockType: "rear_dock" | "street" | "mall_bay";
  parkingConstraint: "normal" | "van_only" | "mall_dock";
  mallWindow: string | null;
  windowOpen: string | null;
  windowClose: string | null;
};

export type PlanningVehicle = {
  id: string;
  vehicleId: string;
  type: "truck" | "van";
  temp: "reefer" | "ambient";
  weightCapKg: string;
  volumeCapM3: string;
  fuelType: string;
  kmPerL: string;
  weeklyFuelQuotaL: string;
  existingWeeklyFuelL: string;
  depot: "Peliyagoda" | "Kandy";
};

export type PlanningCalendar = {
  date: string;
  dow: number;
  dowName: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";
  isWeekend: 0 | 1;
  isoYear: number;
  isoWeek: number;
  isPayday: 0 | 1;
  festival: string;
  festivalRamp: string;
  isHoliday: 0 | 1;
  monsoon: 0 | 1;
  isOperating: 0 | 1;
};

export type PlanningTravel = {
  depot: string;
  district: string;
  depotToDistrictKm: string;
  depotToDistrictFreeflowMin: string;
  interStopKm: string;
  interStopFreeflowMin: string;
};

export type PlanningServiceAllowance = {
  brand: string;
  dockType: string;
  serviceAllowanceMin: string;
};

export type PlanningInput = {
  contractVersion: typeof PLANNING_CONTRACT_VERSION;
  operationalDate: string;
  cutoff: { clock: typeof CUTOFF_CLOCK; timeZone: typeof CUTOFF_TIME_ZONE };
  orders: PlanningOrder[];
  outlets: PlanningOutlet[];
  vehicles: PlanningVehicle[];
  calendar: PlanningCalendar;
  travel: PlanningTravel[];
  serviceAllowances: PlanningServiceAllowance[];
};

export type PlanningStop = {
  orderId: string;
  sequence: number;
  plannedArrival: string | null;
};

export type PlanningTrip = {
  vehicleId: string;
  tripNumber: 1 | 2;
  orderIds: string[];
  stops: PlanningStop[];
  tripMinutes: string;
  tripDistanceKm: string | null;
  fuelUsedL: string | null;
  projectedWeeklyFuelL: string | null;
};

export type UnallocatedOrder = {
  orderId: string;
  deliveryId: string;
  constraint: HardConstraintId;
  deferralReason: DeferralReason | null;
};

export type PlanningResult = {
  contractVersion: typeof PLANNING_CONTRACT_VERSION;
  status: "result";
  operationalDate: string;
  trips: PlanningTrip[];
  unallocated: UnallocatedOrder[];
};

export type PlanningFailure = {
  contractVersion: typeof PLANNING_CONTRACT_VERSION;
  status: "validation_failure" | "service_failure";
};

export function parsePlanningInput(value: unknown): ContractResult<PlanningInput> {
  if (containsSecret(value) || !isRecord(value)) return invalid();
  const record = allow(value, [
    "contractVersion",
    "operationalDate",
    "cutoff",
    "orders",
    "outlets",
    "vehicles",
    "calendar",
    "travel",
    "serviceAllowances",
  ]);
  if (record === null || record.contractVersion !== PLANNING_CONTRACT_VERSION) return invalid();
  const operationalDate = dateOnly(record.operationalDate);
  const cutoff = parseCutoff(record.cutoff);
  const orders = parseList(record.orders, parseOrder);
  const outlets = parseList(record.outlets, parseOutlet);
  const vehicles = parseList(record.vehicles, parseVehicle);
  const calendar = parseCalendar(record.calendar);
  const travel = parseList(record.travel, parseTravel);
  const serviceAllowances = parseList(record.serviceAllowances, parseAllowance);
  if (
    operationalDate === null ||
    cutoff === null ||
    orders === null ||
    outlets === null ||
    vehicles === null ||
    calendar === null ||
    calendar.date !== operationalDate ||
    travel === null ||
    serviceAllowances === null
  ) {
    return invalid();
  }
  return {
    ok: true,
    value: {
      contractVersion: PLANNING_CONTRACT_VERSION,
      operationalDate,
      cutoff,
      orders: sortBy(orders, (item) => item.deliveryId),
      outlets: sortBy(outlets, (item) => item.outletId),
      vehicles: sortBy(vehicles, (item) => item.vehicleId),
      calendar,
      travel: sortBy(travel, (item) => `${item.depot}\u0000${item.district}`),
      serviceAllowances: sortBy(serviceAllowances, (item) => `${item.brand}\u0000${item.dockType}`),
    },
  };
}

export function parsePlanningResult(value: unknown): ContractResult<PlanningResult> {
  if (containsSecret(value) || !isRecord(value)) return invalid();
  const record = allow(value, ["contractVersion", "status", "operationalDate", "trips", "unallocated"]);
  if (record === null || record.contractVersion !== PLANNING_CONTRACT_VERSION || record.status !== "result") return invalid();
  const operationalDate = dateOnly(record.operationalDate);
  const trips = parseList(record.trips, parseTrip);
  const unallocated = parseList(record.unallocated, parseUnallocated);
  if (operationalDate === null || trips === null || unallocated === null || !tripLimits(trips) || !wholeOrders(trips, unallocated)) return invalid();
  const orderedTrips = sortBy(trips, (item) => `${item.vehicleId}\u0000${item.tripNumber}`);
  const orderedUnallocated = sortBy(unallocated, (item) => item.deliveryId);
  if (!sameOrder(trips, orderedTrips, (item) => `${item.vehicleId}\u0000${item.tripNumber}`)) return invalid();
  if (!sameOrder(unallocated, orderedUnallocated, (item) => item.deliveryId)) return invalid();
  return {
    ok: true,
    value: { contractVersion: PLANNING_CONTRACT_VERSION, status: "result", operationalDate, trips: orderedTrips, unallocated: orderedUnallocated },
  };
}

export function parsePlanningFailure(value: unknown): ContractResult<PlanningFailure> {
  if (containsSecret(value) || !isRecord(value)) return invalid();
  const record = allow(value, ["contractVersion", "status"]);
  if (record === null || record.contractVersion !== PLANNING_CONTRACT_VERSION) return invalid();
  if (record.status !== "validation_failure" && record.status !== "service_failure") return invalid();
  return { ok: true, value: { contractVersion: PLANNING_CONTRACT_VERSION, status: record.status } };
}

export function canonicalPlanningInput(value: PlanningInput): string {
  return JSON.stringify(value);
}

function parseCutoff(value: unknown): PlanningInput["cutoff"] | null {
  if (!isRecord(value)) return null;
  const record = allow(value, ["clock", "timeZone"]);
  if (record === null || record.clock !== CUTOFF_CLOCK || record.timeZone !== CUTOFF_TIME_ZONE) return null;
  return { clock: CUTOFF_CLOCK, timeZone: CUTOFF_TIME_ZONE };
}

function parseOrder(value: unknown): PlanningOrder | null {
  if (!isRecord(value)) return null;
  const record = allow(value, [
    "id",
    "deliveryId",
    "orderDate",
    "submittedAt",
    "outletId",
    "brand",
    "district",
    "depot",
    "tempRequirement",
    "orderUnits",
    "orderWeightKg",
    "orderVolumeM3",
  ]);
  if (record === null) return null;
  const id = uuid(record.id);
  const outletId = uuid(record.outletId);
  const deliveryId = requiredText(record.deliveryId);
  const orderDate = dateOnly(record.orderDate);
  const submittedAt = instant(record.submittedAt);
  const brand = oneOf(record.brand, ["Fresh", "Style", "Tech"] as const);
  const district = requiredText(record.district);
  const depot = oneOf(record.depot, ["Peliyagoda", "Kandy"] as const);
  const tempRequirement = oneOf(record.tempRequirement, ["chilled", "ambient"] as const);
  const orderUnits = positiveInteger(record.orderUnits);
  const orderWeightKg = decimal(record.orderWeightKg, "positive");
  const orderVolumeM3 = decimal(record.orderVolumeM3, "positive");
  if (
    id === null ||
    outletId === null ||
    deliveryId === null ||
    orderDate === null ||
    submittedAt === null ||
    brand === null ||
    district === null ||
    depot === null ||
    tempRequirement === null ||
    orderUnits === null ||
    orderWeightKg === null ||
    orderVolumeM3 === null
  ) {
    return null;
  }
  return { id, deliveryId, orderDate, submittedAt, outletId, brand, district, depot, tempRequirement, orderUnits, orderWeightKg, orderVolumeM3 };
}

function parseOutlet(value: unknown): PlanningOutlet | null {
  if (!isRecord(value)) return null;
  const record = allow(value, [
    "id",
    "outletId",
    "brand",
    "district",
    "depot",
    "dockType",
    "parkingConstraint",
    "mallWindow",
    "windowOpen",
    "windowClose",
  ]);
  if (record === null) return null;
  const id = uuid(record.id);
  const outletId = requiredText(record.outletId);
  const brand = oneOf(record.brand, ["Fresh", "Style", "Tech"] as const);
  const district = requiredText(record.district);
  const depot = oneOf(record.depot, ["Peliyagoda", "Kandy"] as const);
  const dockType = oneOf(record.dockType, ["rear_dock", "street", "mall_bay"] as const);
  const parkingConstraint = oneOf(record.parkingConstraint, ["normal", "van_only", "mall_dock"] as const);
  const mallWindow = mallWindowValue(record.mallWindow);
  const windowOpen = record.windowOpen === null ? null : clock(record.windowOpen);
  const windowClose = record.windowClose === null ? null : clock(record.windowClose);
  if (
    id === null ||
    outletId === null ||
    brand === null ||
    district === null ||
    depot === null ||
    dockType === null ||
    parkingConstraint === null ||
    mallWindow === undefined ||
    (record.windowOpen !== null && windowOpen === null) ||
    (record.windowClose !== null && windowClose === null) ||
    (windowOpen === null) !== (windowClose === null)
  ) {
    return null;
  }
  if (windowOpen !== null && windowClose !== null && clockSeconds(windowOpen) > clockSeconds(windowClose)) return null;
  return { id, outletId, brand, district, depot, dockType, parkingConstraint, mallWindow, windowOpen, windowClose };
}

function parseVehicle(value: unknown): PlanningVehicle | null {
  if (!isRecord(value)) return null;
  const record = allow(value, [
    "id",
    "vehicleId",
    "type",
    "temp",
    "weightCapKg",
    "volumeCapM3",
    "fuelType",
    "kmPerL",
    "weeklyFuelQuotaL",
    "existingWeeklyFuelL",
    "depot",
  ]);
  if (record === null) return null;
  const id = uuid(record.id);
  const vehicleId = requiredText(record.vehicleId);
  const type = oneOf(record.type, ["truck", "van"] as const);
  const temp = oneOf(record.temp, ["reefer", "ambient"] as const);
  const weightCapKg = decimal(record.weightCapKg, "positive");
  const volumeCapM3 = decimal(record.volumeCapM3, "positive");
  const fuelType = requiredText(record.fuelType);
  const kmPerL = decimal(record.kmPerL, "positive");
  const weeklyFuelQuotaL = decimal(record.weeklyFuelQuotaL, "non_negative");
  const existingWeeklyFuelL = decimal(record.existingWeeklyFuelL, "non_negative");
  const depot = oneOf(record.depot, ["Peliyagoda", "Kandy"] as const);
  if (
    id === null ||
    vehicleId === null ||
    type === null ||
    temp === null ||
    weightCapKg === null ||
    volumeCapM3 === null ||
    fuelType === null ||
    kmPerL === null ||
    weeklyFuelQuotaL === null ||
    existingWeeklyFuelL === null ||
    depot === null
  ) {
    return null;
  }
  return { id, vehicleId, type, temp, weightCapKg, volumeCapM3, fuelType, kmPerL, weeklyFuelQuotaL, existingWeeklyFuelL, depot };
}

function parseCalendar(value: unknown): PlanningCalendar | null {
  if (!isRecord(value)) return null;
  const record = allow(value, [
    "date",
    "dow",
    "dowName",
    "isWeekend",
    "isoYear",
    "isoWeek",
    "isPayday",
    "festival",
    "festivalRamp",
    "isHoliday",
    "monsoon",
    "isOperating",
  ]);
  if (record === null) return null;
  const date = dateOnly(record.date);
  const dowName = oneOf(record.dowName, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const);
  const isWeekend = flag(record.isWeekend);
  const isPayday = flag(record.isPayday);
  const isHoliday = flag(record.isHoliday);
  const monsoon = flag(record.monsoon);
  const isOperating = flag(record.isOperating);
  if (
    date === null ||
    !Number.isInteger(record.dow) ||
    (record.dow as number) < 0 ||
    (record.dow as number) > 6 ||
    dowName === null ||
    isWeekend === null ||
    !Number.isInteger(record.isoYear) ||
    !Number.isInteger(record.isoWeek) ||
    isPayday === null ||
    typeof record.festival !== "string" ||
    typeof record.festivalRamp !== "string" ||
    isHoliday === null ||
    monsoon === null ||
    isOperating === null
  ) {
    return null;
  }
  return {
    date,
    dow: record.dow as number,
    dowName,
    isWeekend,
    isoYear: record.isoYear as number,
    isoWeek: record.isoWeek as number,
    isPayday,
    festival: record.festival,
    festivalRamp: record.festivalRamp,
    isHoliday,
    monsoon,
    isOperating,
  };
}

function parseTravel(value: unknown): PlanningTravel | null {
  if (!isRecord(value)) return null;
  const record = allow(value, ["depot", "district", "depotToDistrictKm", "depotToDistrictFreeflowMin", "interStopKm", "interStopFreeflowMin"]);
  if (record === null) return null;
  const depot = requiredText(record.depot);
  const district = requiredText(record.district);
  const depotToDistrictKm = decimal(record.depotToDistrictKm, "non_negative");
  const depotToDistrictFreeflowMin = decimal(record.depotToDistrictFreeflowMin, "non_negative");
  const interStopKm = decimal(record.interStopKm, "non_negative");
  const interStopFreeflowMin = decimal(record.interStopFreeflowMin, "non_negative");
  if (
    depot === null ||
    district === null ||
    depotToDistrictKm === null ||
    depotToDistrictFreeflowMin === null ||
    interStopKm === null ||
    interStopFreeflowMin === null
  ) {
    return null;
  }
  return { depot, district, depotToDistrictKm, depotToDistrictFreeflowMin, interStopKm, interStopFreeflowMin };
}

function parseAllowance(value: unknown): PlanningServiceAllowance | null {
  if (!isRecord(value)) return null;
  const record = allow(value, ["brand", "dockType", "serviceAllowanceMin"]);
  if (record === null) return null;
  const brand = requiredText(record.brand);
  const dockType = requiredText(record.dockType);
  const serviceAllowanceMin = decimal(record.serviceAllowanceMin, "non_negative");
  if (brand === null || dockType === null || serviceAllowanceMin === null) return null;
  return { brand, dockType, serviceAllowanceMin };
}

function parseTrip(value: unknown): PlanningTrip | null {
  if (!isRecord(value)) return null;
  const record = allow(value, [
    "vehicleId",
    "tripNumber",
    "orderIds",
    "stops",
    "tripMinutes",
    "tripDistanceKm",
    "fuelUsedL",
    "projectedWeeklyFuelL",
  ]);
  if (record === null) return null;
  const vehicleId = requiredText(record.vehicleId);
  const tripNumber = record.tripNumber === 1 || record.tripNumber === 2 ? record.tripNumber : null;
  const orderIds = stringList(record.orderIds);
  const stops = parseList(record.stops, parseStop);
  const tripMinutes = decimal(record.tripMinutes, "non_negative");
  const tripDistanceKm = record.tripDistanceKm === null ? null : decimal(record.tripDistanceKm, "non_negative");
  const fuelUsedL = record.fuelUsedL === null ? null : decimal(record.fuelUsedL, "non_negative");
  const projectedWeeklyFuelL = record.projectedWeeklyFuelL === null ? null : decimal(record.projectedWeeklyFuelL, "non_negative");
  if (
    vehicleId === null ||
    tripNumber === null ||
    orderIds === null ||
    stops === null ||
    tripMinutes === null ||
    (record.tripDistanceKm !== null && tripDistanceKm === null) ||
    (record.fuelUsedL !== null && fuelUsedL === null) ||
    (record.projectedWeeklyFuelL !== null && projectedWeeklyFuelL === null) ||
    (tripDistanceKm === null && (fuelUsedL !== null || projectedWeeklyFuelL !== null)) ||
    (tripDistanceKm !== null && (fuelUsedL === null || projectedWeeklyFuelL === null))
  ) {
    return null;
  }
  const orderedStops = sortBy(stops, (item) => String(item.sequence).padStart(6, "0"));
  if (!sequences(orderedStops) || !sameMembers(orderIds, orderedStops.map((item) => item.orderId))) return null;
  return { vehicleId, tripNumber, orderIds: [...orderIds].sort(), stops: orderedStops, tripMinutes, tripDistanceKm, fuelUsedL, projectedWeeklyFuelL };
}

function parseStop(value: unknown): PlanningStop | null {
  if (!isRecord(value)) return null;
  const record = allow(value, ["orderId", "sequence", "plannedArrival"]);
  if (record === null) return null;
  const orderId = uuid(record.orderId);
  const plannedArrival = record.plannedArrival === null ? null : clock(record.plannedArrival);
  if (orderId === null || !Number.isInteger(record.sequence) || (record.sequence as number) < 0 || (record.plannedArrival !== null && plannedArrival === null)) {
    return null;
  }
  return { orderId, sequence: record.sequence as number, plannedArrival };
}

function parseUnallocated(value: unknown): UnallocatedOrder | null {
  if (!isRecord(value)) return null;
  const record = allow(value, ["orderId", "deliveryId", "constraint", "deferralReason"]);
  if (record === null) return null;
  const orderId = uuid(record.orderId);
  const deliveryId = requiredText(record.deliveryId);
  const constraint = hardConstraints.find((item) => item.id === record.constraint);
  if (orderId === null || deliveryId === null || constraint === undefined) return null;
  if (record.deferralReason !== constraint.deferralReason) return null;
  return { orderId, deliveryId, constraint: constraint.id, deferralReason: constraint.deferralReason };
}

function tripLimits(trips: readonly PlanningTrip[]): boolean {
  const counts = new Map<string, number>();
  for (const trip of trips) {
    const key = `${trip.vehicleId}\u0000${trip.tripNumber}`;
    if (counts.has(key)) return false;
    counts.set(trip.vehicleId, (counts.get(trip.vehicleId) ?? 0) + 1);
  }
  return [...counts.values()].every((count) => count <= 2);
}

function wholeOrders(trips: readonly PlanningTrip[], unallocated: readonly UnallocatedOrder[]): boolean {
  const seen = new Set<string>();
  for (const trip of trips) {
    for (const orderId of trip.orderIds) {
      if (seen.has(orderId)) return false;
      seen.add(orderId);
    }
  }
  return unallocated.every((item) => !seen.has(item.orderId));
}

function sequences(stops: readonly PlanningStop[]): boolean {
  return stops.every((stop, index) => stop.sequence === index);
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item) => right.includes(item)) && new Set(left).size === left.length;
}

function sameOrder<T>(actual: readonly T[], expected: readonly T[], key: (item: T) => string): boolean {
  return actual.every((item, index) => key(item) === key(expected[index] as T));
}

function parseList<T>(value: unknown, parse: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const items: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed === null) return null;
    items.push(parsed);
  }
  return items;
}

function sortBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  return [...items].sort((left, right) => key(left).localeCompare(key(right)));
}

function allow(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> | null {
  const present = Object.keys(value);
  if (present.length !== keys.length || present.some((key) => !keys.includes(key))) return null;
  return value;
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (!isRecord(value)) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret(value[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uuid(value: unknown): string | null {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return null;
  return value.toLowerCase();
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) return null;
  return value;
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== (month ?? 1) - 1 || parsed.getUTCDate() !== day) return null;
  return value;
}

function instant(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
}

function clock(value: unknown): string | null {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  return value;
}

function clockSeconds(value: string): number {
  const [hour, minute, second] = value.split(":");
  return Number(hour) * 3600 + Number(minute) * 60 + Number(second ?? 0);
}

function mallWindowValue(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  return value;
}

function decimal(value: unknown, mode: "positive" | "non_negative"): string | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null;
  const negativeZero = value === "0" || /^0\.0+$/.test(value);
  if (mode === "positive" && negativeZero) return null;
  return value;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function flag(value: unknown): 0 | 1 | null {
  return value === 0 || value === 1 ? value : null;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return allowed.find((item) => item === value) ?? null;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => uuid(item) === null)) return null;
  return value.map((item) => uuid(item) as string);
}

function invalid(): ContractResult<never> {
  return { ok: false, code: "invalid_input" };
}
