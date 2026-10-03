import { authorizeDispatcherOperational } from "../security/object-authorization.js";
import { persistenceCode } from "./domain-transaction.js";
import type { OrderActor, OrderStatusName } from "./order.js";
import { transitionOrder } from "./order-transition.js";

export const deferralReasons = [
  "NO_CAPACITY",
  "NO_REEFER",
  "VAN_ACCESS",
  "WINDOW_CONFLICT",
  "DEPOT_MISMATCH",
  "TIME_BUDGET",
] as const;

export type DeferralReasonName = (typeof deferralReasons)[number];

export type DeferralDomainCode =
  | "invalid_input"
  | "not_found"
  | "authorization_failure"
  | "invalid_transition"
  | "lifecycle_conflict"
  | "invariant_violation"
  | "concurrency_conflict"
  | "persistence_failure";

export type DeferralResult =
  | { ok: true; deferral: StoredDeferral }
  | { ok: false; code: DeferralDomainCode };

export type StoredDeferral = {
  id: string;
  orderId: string;
  reason: DeferralReasonName;
  reportedAt: Date;
};

export type DeferralOrder = {
  id: string;
  status: OrderStatusName;
  hasTripStop: boolean;
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
  tempRequirement: "chilled" | "ambient";
  brand: string;
  district: string;
  depot: string;
};

export type DeferralUnit = {
  orders: import("./order.js").OrderStore;
  findOrder(id: string): Promise<DeferralOrder | null>;
  listByOrder(orderId: string): Promise<StoredDeferral[]>;
  create(input: { orderId: string; reason: DeferralReasonName; reportedAt: Date }): Promise<StoredDeferral>;
};

export type DeferralStore = {
  transaction<T>(work: (unit: DeferralUnit) => Promise<T>): Promise<T>;
};

const prohibitedCommandFields = [
  "status",
  "role",
  "actorUserId",
  "reportedAt",
  "orderUnits",
  "orderWeightKg",
  "orderVolumeM3",
  "tempRequirement",
  "tripId",
  "vehicleId",
  "planningEligible",
] as const;

export async function recordDeferral(input: {
  actor: OrderActor;
  command: Record<string, unknown>;
  now: Date;
  store: DeferralStore;
}): Promise<DeferralResult> {
  if (hasProhibitedField(input.command)) {
    return failure("invalid_input");
  }
  if (!dispatcher(input.actor)) {
    return failure("authorization_failure");
  }
  const orderId = requiredText(input.command.orderId);
  const reason = requiredReason(input.command.reason);
  if (orderId === null || reason === null) {
    return failure("invalid_input");
  }
  try {
    return await input.store.transaction(async (unit) => {
      const order = await unit.findOrder(orderId);
      if (order === null) {
        throw rejected("not_found");
      }
      if (order.hasTripStop) {
        throw rejected("invariant_violation");
      }
      const history = await unit.listByOrder(order.id);
      if (order.status === "DEFERRED") {
        if (history.some((deferral) => deferral.reason === reason)) {
          throw rejected("lifecycle_conflict");
        }
        const created = await unit.create({ orderId: order.id, reason, reportedAt: input.now });
        return { ok: true as const, deferral: created };
      }
      if (order.status !== "CONFIRMED") {
        throw rejected("invalid_transition");
      }
      const created = await unit.create({ orderId: order.id, reason, reportedAt: input.now });
      const moved = await transitionOrder({
        actor: input.actor,
        orderId: order.id,
        to: "DEFERRED",
        now: input.now,
        store: unit.orders,
      });
      if (!moved.ok) {
        throw rejected(moved.code === "concurrency_conflict" ? "concurrency_conflict" : "invalid_transition");
      }
      return { ok: true as const, deferral: created };
    });
  } catch (error) {
    if (error instanceof DeferralRejected) {
      return failure(error.code);
    }
    return failure(persistenceCode(error));
  }
}

function dispatcher(actor: OrderActor): boolean {
  return authorizeDispatcherOperational({
    role: actor.role,
    target: "deferral",
    action: "mutate",
  }).allowed;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function requiredReason(value: unknown): DeferralReasonName | null {
  if (typeof value !== "string") {
    return null;
  }
  return deferralReasons.some((reason) => reason === value) ? (value as DeferralReasonName) : null;
}

function hasProhibitedField(command: Record<string, unknown>): boolean {
  return prohibitedCommandFields.some((field) => Object.prototype.hasOwnProperty.call(command, field));
}

class DeferralRejected extends Error {
  constructor(readonly code: DeferralDomainCode) {
    super(code);
  }
}

function rejected(code: DeferralDomainCode): DeferralRejected {
  return new DeferralRejected(code);
}

function failure(code: DeferralDomainCode): DeferralResult {
  return { ok: false, code };
}
