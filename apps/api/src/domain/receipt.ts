import { authorizeStoreManagerOutlet } from "../security/object-authorization.js";
import type { OrderActor, OrderStatusName } from "./order.js";
import { transitionOrder } from "./order-transition.js";

export type ReceiptDomainCode =
  | "invalid_input"
  | "not_found"
  | "authorization_failure"
  | "object_scope_failure"
  | "invalid_transition"
  | "lifecycle_conflict"
  | "concurrency_conflict"
  | "persistence_failure";

export type ReceiptResult =
  | { ok: true; receipt: StoredReceipt }
  | { ok: false; code: ReceiptDomainCode };

export type StoredReceipt = {
  id: string;
  deliveryRecordId: string;
  storeManagerUserId: string;
  confirmedAt: Date;
  result: string;
  issueDetails: string | null;
};

export type ReceiptDelivery = {
  id: string;
  orderId: string;
  orderStatus: OrderStatusName;
  outletId: string;
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
  tempRequirement: "chilled" | "ambient";
  brand: string;
  district: string;
  depot: string;
  outcome: string;
  hasReceipt: boolean;
};

export type ReceiptUnit = {
  orders: import("./order.js").OrderStore;
  findDelivery(id: string): Promise<ReceiptDelivery | null>;
  create(input: {
    deliveryRecordId: string;
    storeManagerUserId: string;
    confirmedAt: Date;
    result: string;
    issueDetails: string | null;
  }): Promise<StoredReceipt | "conflict">;
};

export type ReceiptStore = {
  transaction<T>(work: (unit: ReceiptUnit) => Promise<T>): Promise<T>;
};

const prohibitedCommandFields = [
  "role",
  "actorUserId",
  "outletId",
  "status",
  "storeManagerUserId",
  "confirmedAt",
  "orderUnits",
  "orderWeightKg",
  "orderVolumeM3",
  "tempRequirement",
  "outcome",
  "severity",
] as const;

export async function confirmReceipt(input: {
  actor: OrderActor;
  command: Record<string, unknown>;
  now: Date;
  store: ReceiptStore;
}): Promise<ReceiptResult> {
  if (hasProhibitedField(input.command)) {
    return failure("invalid_input");
  }
  if (input.actor.role !== "STORE_MANAGER") {
    return failure("authorization_failure");
  }
  const deliveryRecordId = requiredText(input.command.deliveryRecordId);
  const result = requiredResult(input.command.result);
  const issueDetails = optionalText(input.command.issueDetails);
  if (deliveryRecordId === null || result === null || issueDetails === null) {
    return failure("invalid_input");
  }
  try {
    return await input.store.transaction(async (unit) => {
      const delivery = await unit.findDelivery(deliveryRecordId);
      if (delivery === null) {
        throw rejected("not_found");
      }
      const outlet = authorizeStoreManagerOutlet({
        role: input.actor.role,
        assignedOutletIds: input.actor.assignedOutletIds,
        outletId: delivery.outletId,
        action: "mutate",
      });
      if (!outlet.allowed) {
        throw rejected("object_scope_failure");
      }
      if (delivery.hasReceipt) {
        throw rejected("lifecycle_conflict");
      }
      if (delivery.orderStatus !== "DELIVERED") {
        throw rejected("invalid_transition");
      }
      const created = await unit.create({
        deliveryRecordId: delivery.id,
        storeManagerUserId: input.actor.userId,
        confirmedAt: input.now,
        result,
        issueDetails: issueDetails ?? null,
      });
      if (created === "conflict") {
        throw rejected("concurrency_conflict");
      }
      const moved = await transitionOrder({
        actor: input.actor,
        orderId: delivery.orderId,
        to: "RECEIPT_CONFIRMED",
        now: input.now,
        store: unit.orders,
      });
      if (!moved.ok) {
        throw rejected(moved.code === "concurrency_conflict" ? "concurrency_conflict" : "invalid_transition");
      }
      return { ok: true as const, receipt: created };
    });
  } catch (error) {
    if (error instanceof ReceiptRejected) {
      return failure(error.code);
    }
    return failure("persistence_failure");
  }
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function requiredResult(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  return value;
}

function hasProhibitedField(command: Record<string, unknown>): boolean {
  return prohibitedCommandFields.some((field) => Object.prototype.hasOwnProperty.call(command, field));
}

class ReceiptRejected extends Error {
  constructor(readonly code: ReceiptDomainCode) {
    super(code);
  }
}

function rejected(code: ReceiptDomainCode): ReceiptRejected {
  return new ReceiptRejected(code);
}

function failure(code: ReceiptDomainCode): ReceiptResult {
  return { ok: false, code };
}
