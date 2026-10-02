import { authorizeDispatcherOperational, authorizeStoreManagerOutlet } from "../security/object-authorization.js";

export const orderStatuses = [
  "DRAFT",
  "SUBMITTED",
  "CONFIRMED",
  "DEFERRED",
  "PLANNED_ALLOCATED",
  "LOADING",
  "EXCEPTION_REPORTED",
  "LOADED",
  "DISPATCHED",
  "DELIVERED",
  "RECEIPT_CONFIRMED",
] as const;

export type OrderStatusName = (typeof orderStatuses)[number];

export type OrderTemperature = "chilled" | "ambient";

export type OrderActor = {
  userId: string;
  role: string;
  assignedOutletIds: readonly string[];
};

export type OrderOutlet = {
  id: string;
  outletCode: string;
  brand: string;
  district: string;
  depot: string;
};

export type StoredOrder = {
  id: string;
  deliveryId: string;
  orderDate: string;
  outletId: string;
  outletCode: string;
  brand: string;
  district: string;
  depot: string;
  createdByUserId: string;
  status: OrderStatusName;
  tempRequirement: OrderTemperature;
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
  submittedAt: Date | null;
};

export type OrderStore = {
  findOutletById(id: string): Promise<OrderOutlet | null>;
  findByDeliveryId(deliveryId: string): Promise<StoredOrder | null>;
  findById(id: string): Promise<StoredOrder | null>;
  create(input: {
    deliveryId: string;
    orderDate: string;
    outletId: string;
    createdByUserId: string;
    tempRequirement: OrderTemperature;
    orderUnits: number;
    orderWeightKg: string;
    orderVolumeM3: string;
  }): Promise<StoredOrder>;
  markSubmitted(id: string, submittedAt: Date): Promise<StoredOrder>;
};

export type OrderDomainCode =
  | "invalid_input"
  | "not_found"
  | "authorization_failure"
  | "lifecycle_conflict"
  | "invariant_violation"
  | "persistence_failure";

export type OrderResult =
  | { ok: true; order: StoredOrder }
  | { ok: false; code: OrderDomainCode };

const prohibitedCommandFields = [
  "status",
  "submittedAt",
  "actorUserId",
  "role",
  "tripId",
  "vehicleId",
  "routeId",
  "seqInRoute",
  "deferralReason",
  "planningEligible",
  "dispatchDate",
  "dispatchStatus",
] as const;

const temperatures = ["chilled", "ambient"] as const;

export async function createOrder(input: {
  actor: OrderActor;
  command: Record<string, unknown>;
  store: OrderStore;
}): Promise<OrderResult> {
  if (hasProhibitedField(input.command)) {
    return failure("invalid_input");
  }
  const parsed = parseCreateCommand(input.command);
  if (parsed === null) {
    return failure("invalid_input");
  }
  let outlet: OrderOutlet | null;
  try {
    outlet = await input.store.findOutletById(parsed.outletId);
  } catch {
    return failure("persistence_failure");
  }
  if (outlet === null) {
    return failure("not_found");
  }
  if (!canMutateOutlet(input.actor, outlet.id)) {
    return failure("authorization_failure");
  }
  if (!contextMatches(parsed, outlet)) {
    return failure("invariant_violation");
  }
  try {
    const existing = await input.store.findByDeliveryId(parsed.deliveryId);
    if (existing !== null) {
      return failure("invariant_violation");
    }
    const order = await input.store.create({
      deliveryId: parsed.deliveryId,
      orderDate: parsed.orderDate,
      outletId: outlet.id,
      createdByUserId: input.actor.userId,
      tempRequirement: parsed.tempRequirement,
      orderUnits: parsed.orderUnits,
      orderWeightKg: parsed.orderWeightKg,
      orderVolumeM3: parsed.orderVolumeM3,
    });
    return { ok: true, order };
  } catch {
    return failure("persistence_failure");
  }
}

export async function submitOrder(input: {
  actor: OrderActor;
  orderId: string;
  now: Date;
  store: OrderStore;
}): Promise<OrderResult> {
  let order: StoredOrder | null;
  try {
    order = await input.store.findById(input.orderId);
  } catch {
    return failure("persistence_failure");
  }
  if (order === null) {
    return failure("not_found");
  }
  if (!canMutateOutlet(input.actor, order.outletId)) {
    return failure("authorization_failure");
  }
  if (order.status !== "DRAFT") {
    return failure("lifecycle_conflict");
  }
  try {
    const submitted = await input.store.markSubmitted(input.orderId, input.now);
    return { ok: true, order: submitted };
  } catch {
    return failure("persistence_failure");
  }
}

export async function getOrder(input: {
  actor: OrderActor;
  orderId: string;
  store: OrderStore;
}): Promise<OrderResult> {
  let order: StoredOrder | null;
  try {
    order = await input.store.findById(input.orderId);
  } catch {
    return failure("persistence_failure");
  }
  if (order === null) {
    return failure("not_found");
  }
  const dispatcher = authorizeDispatcherOperational({
    role: input.actor.role,
    target: "order",
    action: "read",
  });
  const manager = authorizeStoreManagerOutlet({
    role: input.actor.role,
    assignedOutletIds: input.actor.assignedOutletIds,
    outletId: order.outletId,
    action: "read",
  });
  if (!dispatcher.allowed && !manager.allowed) {
    return failure("authorization_failure");
  }
  return { ok: true, order };
}

function canMutateOutlet(actor: OrderActor, outletId: string): boolean {
  return authorizeStoreManagerOutlet({
    role: actor.role,
    assignedOutletIds: actor.assignedOutletIds,
    outletId,
    action: "mutate",
  }).allowed;
}

type ParsedCreate = {
  deliveryId: string;
  orderDate: string;
  outletId: string;
  tempRequirement: OrderTemperature;
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
  brand: string | undefined;
  district: string | undefined;
  depot: string | undefined;
};

function parseCreateCommand(command: Record<string, unknown>): ParsedCreate | null {
  const deliveryId = requiredText(command.deliveryId);
  const orderDate = requiredDate(command.orderDate);
  const outletId = requiredText(command.outletId);
  const tempRequirement = requiredTemperature(command.tempRequirement);
  const orderUnits = requiredUnits(command.orderUnits);
  const orderWeightKg = requiredQuantity(command.orderWeightKg);
  const orderVolumeM3 = requiredQuantity(command.orderVolumeM3);
  const brand = optionalText(command.brand);
  const district = optionalText(command.district);
  const depot = optionalText(command.depot);
  if (
    deliveryId === null ||
    orderDate === null ||
    outletId === null ||
    tempRequirement === null ||
    orderUnits === null ||
    orderWeightKg === null ||
    orderVolumeM3 === null ||
    brand === null ||
    district === null ||
    depot === null
  ) {
    return null;
  }
  return {
    deliveryId,
    orderDate,
    outletId,
    tempRequirement,
    orderUnits,
    orderWeightKg,
    orderVolumeM3,
    brand,
    district,
    depot,
  };
}

function contextMatches(parsed: ParsedCreate, outlet: OrderOutlet): boolean {
  if (parsed.brand !== undefined && parsed.brand !== outlet.brand) {
    return false;
  }
  if (parsed.district !== undefined && parsed.district !== outlet.district) {
    return false;
  }
  if (parsed.depot !== undefined && parsed.depot !== outlet.depot) {
    return false;
  }
  return true;
}

function hasProhibitedField(command: Record<string, unknown>): boolean {
  return prohibitedCommandFields.some((field) => Object.prototype.hasOwnProperty.call(command, field));
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
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
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return value;
}

function requiredTemperature(value: unknown): OrderTemperature | null {
  if (typeof value !== "string") {
    return null;
  }
  return temperatures.some((temperature) => temperature === value) ? (value as OrderTemperature) : null;
}

function requiredUnits(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function requiredQuantity(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return null;
  }
  if (Number(value) <= 0) {
    return null;
  }
  return value;
}

function failure(code: OrderDomainCode): OrderResult {
  return { ok: false, code };
}
