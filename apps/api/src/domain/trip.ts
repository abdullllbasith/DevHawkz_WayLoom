import { authorizeDispatcherOperational } from "../security/object-authorization.js";
import { persistenceCode } from "./domain-transaction.js";
import type { OrderActor, OrderStatusName } from "./order.js";
import { transitionOrder } from "./order-transition.js";

export type TripStatusName = "PLANNED" | "CONFIRMED";

export type TripDomainCode =
  | "invalid_input"
  | "not_found"
  | "authorization_failure"
  | "invalid_transition"
  | "lifecycle_conflict"
  | "invariant_violation"
  | "concurrency_conflict"
  | "persistence_failure";

export type TripResult =
  | { ok: true; trip: StoredTrip }
  | { ok: false; code: TripDomainCode };

export type TripVehicle = {
  id: string;
  type: "truck" | "van";
  temp: "reefer" | "ambient";
  weightCapKg: string;
  volumeCapM3: string;
  depot: string;
  driverUserId: string | null;
};

export type AllocationOrder = {
  id: string;
  status: OrderStatusName;
  tempRequirement: "chilled" | "ambient";
  orderWeightKg: string;
  orderVolumeM3: string;
  brand: string;
  district: string;
  depot: string;
  parkingConstraint: "normal" | "van_only" | "mall_dock";
  windowOpen: string | null;
  windowClose: string | null;
  submittedAt: Date | null;
};

export type StoredStop = {
  id: string;
  tripId: string;
  orderId: string;
  sequence: number;
  plannedArrival: string | null;
};

export type StoredTrip = {
  id: string;
  routeId: string | null;
  operationalDate: string;
  vehicleId: string;
  depot: string;
  tripNumber: number;
  status: TripStatusName;
  stops: StoredStop[];
};

export type TripDispatchAudit = {
  action: "TRIP_DISPATCHED";
  tripId: string;
  actorUserId: string;
  occurredAt: Date;
};

export type TripUnit = {
  orders: import("./order.js").OrderStore;
  findVehicle(id: string): Promise<TripVehicle | null>;
  findAllocationOrder(id: string): Promise<AllocationOrder | null>;
  findTripById(id: string): Promise<StoredTrip | null>;
  tripSlotTaken(vehicleId: string, operationalDate: string, tripNumber: number): Promise<boolean>;
  countTrips(vehicleId: string, operationalDate: string): Promise<number>;
  routeTaken(routeId: string): Promise<boolean>;
  orderHasStop(orderId: string): Promise<boolean>;
  createTrip(input: {
    routeId: string | null;
    operationalDate: string;
    vehicleId: string;
    depot: string;
    tripNumber: number;
  }): Promise<StoredTrip | "conflict">;
  createStop(input: {
    tripId: string;
    orderId: string;
    sequence: number;
    plannedArrival: string | null;
  }): Promise<StoredStop | "conflict">;
  compareAndSetTripStatus(
    id: string,
    expected: TripStatusName,
    next: TripStatusName,
  ): Promise<StoredTrip | null>;
  recordTripDispatched(input: TripDispatchAudit): Promise<void>;
};

export type TripStore = {
  transaction<T>(work: (unit: TripUnit) => Promise<T>): Promise<T>;
};

const prohibitedCommandFields = [
  "status",
  "actorUserId",
  "role",
  "depot",
  "brand",
  "district",
  "fuelUsedL",
  "tripMinutes",
  "orderUnits",
  "orderWeightKg",
  "orderVolumeM3",
  "planningEligible",
] as const;

type ParsedStop = {
  orderId: string;
  sequence: number;
  plannedArrival: string | null;
};

type ParsedCreate = {
  routeId: string | null;
  operationalDate: string;
  vehicleId: string;
  tripNumber: number;
  stops: ParsedStop[];
};

export async function createTrip(input: {
  actor: OrderActor;
  command: Record<string, unknown>;
  store: TripStore;
}): Promise<TripResult> {
  if (!dispatcher(input.actor) || hasProhibitedField(input.command)) {
    return failure(hasProhibitedField(input.command) ? "invalid_input" : "authorization_failure");
  }
  const parsed = parseCreate(input.command);
  if (parsed === null) {
    return failure("invalid_input");
  }
  try {
    return await input.store.transaction(async (unit) => {
      const vehicle = await unit.findVehicle(parsed.vehicleId);
      if (vehicle === null) {
        throw rejected("not_found");
      }
      if (parsed.routeId !== null && (await unit.routeTaken(parsed.routeId))) {
        throw rejected("invariant_violation");
      }
      if (await unit.tripSlotTaken(vehicle.id, parsed.operationalDate, parsed.tripNumber)) {
        throw rejected("invariant_violation");
      }
      if ((await unit.countTrips(vehicle.id, parsed.operationalDate)) >= 2) {
        throw rejected("invariant_violation");
      }
      const orders: AllocationOrder[] = [];
      for (const stop of parsed.stops) {
        const order = await unit.findAllocationOrder(stop.orderId);
        if (order === null) {
          throw rejected("not_found");
        }
        if (await unit.orderHasStop(order.id)) {
          throw rejected("invariant_violation");
        }
        if (order.status !== "CONFIRMED" && order.status !== "DEFERRED") {
          throw rejected("invalid_transition");
        }
        if (!arrivalFits(stop.plannedArrival, order.windowOpen, order.windowClose)) {
          throw rejected("invariant_violation");
        }
        orders.push(order);
      }
      if (!sameContext(orders, vehicle)) {
        throw rejected("invariant_violation");
      }
      if (!fitsCapacity(orders, vehicle) || !fitsVehicle(orders, vehicle)) {
        throw rejected("invariant_violation");
      }
      const trip = await unit.createTrip({
        routeId: parsed.routeId,
        operationalDate: parsed.operationalDate,
        vehicleId: vehicle.id,
        depot: vehicle.depot,
        tripNumber: parsed.tripNumber,
      });
      if (trip === "conflict") {
        throw rejected("concurrency_conflict");
      }
      for (const stop of parsed.stops) {
        const created = await unit.createStop({
          tripId: trip.id,
          orderId: stop.orderId,
          sequence: stop.sequence,
          plannedArrival: stop.plannedArrival,
        });
        if (created === "conflict") {
          throw rejected("concurrency_conflict");
        }
        trip.stops.push(created);
      }
      for (const order of orders) {
        const moved = await transitionOrder({
          actor: input.actor,
          orderId: order.id,
          to: "PLANNED_ALLOCATED",
          now: new Date(0),
          store: unit.orders,
        });
        if (!moved.ok) {
          throw rejected(moved.code === "concurrency_conflict" ? "concurrency_conflict" : "invalid_transition");
        }
      }
      return { ok: true as const, trip };
    });
  } catch (error) {
    if (error instanceof TripRejected) {
      return failure(error.code);
    }
    return failure(persistenceCode(error));
  }
}

export async function confirmTrip(input: {
  actor: OrderActor;
  tripId: string;
  store: TripStore;
  command?: Record<string, unknown>;
}): Promise<TripResult> {
  if (input.command !== undefined && hasProhibitedField(input.command)) {
    return failure("invalid_input");
  }
  if (!dispatcher(input.actor)) {
    return failure("authorization_failure");
  }
  try {
    return await input.store.transaction(async (unit) => {
      const trip = await unit.findTripById(input.tripId);
      if (trip === null) {
        throw rejected("not_found");
      }
      if (trip.status !== "PLANNED") {
        throw rejected("lifecycle_conflict");
      }
      const confirmed = await unit.compareAndSetTripStatus(trip.id, "PLANNED", "CONFIRMED");
      if (confirmed === null) {
        const current = await unit.findTripById(trip.id);
        throw rejected(current === null ? "not_found" : "concurrency_conflict");
      }
      return { ok: true as const, trip: confirmed };
    });
  } catch (error) {
    if (error instanceof TripRejected) {
      return failure(error.code);
    }
      return failure(persistenceCode(error));
  }
}

export async function dispatchTrip(input: {
  actor: OrderActor;
  tripId: string;
  now: Date;
  store: TripStore;
  command?: Record<string, unknown>;
}): Promise<TripResult> {
  if (input.command !== undefined && hasProhibitedField(input.command)) {
    return failure("invalid_input");
  }
  if (!dispatcher(input.actor)) {
    return failure("authorization_failure");
  }
  try {
    return await input.store.transaction(async (unit) => {
      const trip = await unit.findTripById(input.tripId);
      if (trip === null) {
        throw rejected("not_found");
      }
      if (trip.stops.length === 0) {
        throw rejected("lifecycle_conflict");
      }
      const orders = [];
      for (const stop of trip.stops) {
        const order = await unit.orders.findById(stop.orderId);
        if (order === null) {
          throw rejected("not_found");
        }
        orders.push(order);
      }
      if (orders.some((order) => order.status !== "LOADED")) {
        throw rejected("lifecycle_conflict");
      }
      for (const order of orders) {
        const moved = await transitionOrder({
          actor: input.actor,
          orderId: order.id,
          to: "DISPATCHED",
          now: input.now,
          store: unit.orders,
        });
        if (!moved.ok) {
          throw rejected(moved.code === "concurrency_conflict" ? "concurrency_conflict" : "invalid_transition");
        }
      }
      await unit.recordTripDispatched({
        action: "TRIP_DISPATCHED",
        tripId: trip.id,
        actorUserId: input.actor.userId,
        occurredAt: input.now,
      });
      const current = await unit.findTripById(trip.id);
      if (current === null) {
        throw rejected("not_found");
      }
      return { ok: true as const, trip: current };
    });
  } catch (error) {
    if (error instanceof TripRejected) {
      return failure(error.code);
    }
    return failure(persistenceCode(error));
  }
}

function dispatcher(actor: OrderActor): boolean {
  return authorizeDispatcherOperational({
    role: actor.role,
    target: "trip",
    action: "mutate",
  }).allowed;
}

function sameContext(orders: readonly AllocationOrder[], vehicle: TripVehicle): boolean {
  const brand = orders[0]?.brand;
  const district = orders[0]?.district;
  return orders.every(
    (order) => order.brand === brand && order.district === district && order.depot === vehicle.depot,
  );
}

function fitsVehicle(orders: readonly AllocationOrder[], vehicle: TripVehicle): boolean {
  for (const order of orders) {
    if (order.tempRequirement === "chilled" && vehicle.temp !== "reefer") {
      return false;
    }
    if (order.parkingConstraint === "van_only" && vehicle.type !== "van") {
      return false;
    }
  }
  return true;
}

function fitsCapacity(orders: readonly AllocationOrder[], vehicle: TripVehicle): boolean {
  let weight = "0";
  let volume = "0";
  for (const order of orders) {
    weight = addDecimal(weight, order.orderWeightKg);
    volume = addDecimal(volume, order.orderVolumeM3);
  }
  return compareDecimal(weight, vehicle.weightCapKg) <= 0 && compareDecimal(volume, vehicle.volumeCapM3) <= 0;
}

function arrivalFits(arrival: string | null, open: string | null, close: string | null): boolean {
  if (arrival === null || open === null || close === null) {
    return true;
  }
  const arrivalSeconds = clockSeconds(arrival);
  const openSeconds = clockSeconds(open);
  const closeSeconds = clockSeconds(close);
  if (arrivalSeconds === null || openSeconds === null || closeSeconds === null || openSeconds > closeSeconds) {
    return false;
  }
  return arrivalSeconds >= openSeconds && arrivalSeconds <= closeSeconds;
}

function parseCreate(command: Record<string, unknown>): ParsedCreate | null {
  const operationalDate = requiredDate(command.operationalDate);
  const vehicleId = requiredText(command.vehicleId);
  const tripNumber = requiredTripNumber(command.tripNumber);
  const routeId = optionalText(command.routeId);
  const stops = parseStops(command.stops);
  if (
    operationalDate === null ||
    vehicleId === null ||
    tripNumber === null ||
    routeId === null ||
    stops === null
  ) {
    return null;
  }
  return { operationalDate, vehicleId, tripNumber, routeId: routeId ?? null, stops };
}

function parseStops(value: unknown): ParsedStop[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const stops: ParsedStop[] = [];
  const sequences = new Set<number>();
  const orders = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      return null;
    }
    const record = entry as Record<string, unknown>;
    if (hasProhibitedField(record)) {
      return null;
    }
    const orderId = requiredText(record.orderId);
    const sequence = requiredSequence(record.sequence);
    const plannedArrival = optionalClock(record.plannedArrival);
    if (orderId === null || sequence === null || plannedArrival === null) {
      return null;
    }
    if (sequences.has(sequence) || orders.has(orderId)) {
      return null;
    }
    sequences.add(sequence);
    orders.add(orderId);
    stops.push({ orderId, sequence, plannedArrival: plannedArrival ?? null });
  }
  return stops;
}

function requiredTripNumber(value: unknown): number | null {
  if (value !== 1 && value !== 2) {
    return null;
  }
  return value;
}

function requiredSequence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requiredText(value);
}

function optionalClock(value: unknown): string | null | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || clockSeconds(value) === null) {
    return null;
  }
  return value;
}

function requiredDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return value;
}

function clockSeconds(value: string): number | null {
  const match = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.exec(value);
  if (match === null) {
    return null;
  }
  const [hours, minutes, seconds = "0"] = value.split(":");
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function addDecimal(left: string, right: string): string {
  const scale = Math.max(fractionLength(left), fractionLength(right));
  const sum = scaled(left, scale) + scaled(right, scale);
  return fromScaled(sum, scale);
}

function compareDecimal(left: string, right: string): number {
  const scale = Math.max(fractionLength(left), fractionLength(right));
  const a = scaled(left, scale);
  const b = scaled(right, scale);
  return a < b ? -1 : a > b ? 1 : 0;
}

function fractionLength(value: string): number {
  return value.split(".")[1]?.length ?? 0;
}

function scaled(value: string, scale: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(scale, "0"));
}

function fromScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, "0");
  const whole = digits.slice(0, digits.length - scale);
  const fraction = digits.slice(digits.length - scale).replace(/0+$/, "");
  const text = fraction.length === 0 ? whole : `${whole}.${fraction}`;
  return negative ? `-${text}` : text;
}

function hasProhibitedField(command: Record<string, unknown>): boolean {
  return prohibitedCommandFields.some((field) => Object.prototype.hasOwnProperty.call(command, field));
}

class TripRejected extends Error {
  constructor(readonly code: TripDomainCode) {
    super(code);
  }
}

function rejected(code: TripDomainCode): TripRejected {
  return new TripRejected(code);
}

function failure(code: TripDomainCode): TripResult {
  return { ok: false, code };
}
