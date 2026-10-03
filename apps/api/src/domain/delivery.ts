import { authorizeDriverDelivery, authorizeDriverRoute } from "../security/object-authorization.js";
import { persistenceCode } from "./domain-transaction.js";
import type { OrderActor, OrderStatusName } from "./order.js";
import { transitionOrder } from "./order-transition.js";

export type DeliveryDomainCode =
  | "invalid_input"
  | "not_found"
  | "authorization_failure"
  | "object_scope_failure"
  | "invalid_transition"
  | "lifecycle_conflict"
  | "prerequisite_missing"
  | "concurrency_conflict"
  | "persistence_failure";

export type DeliveryResult =
  | { ok: true; delivery: StoredDelivery }
  | { ok: false; code: DeliveryDomainCode };

export type ProofResult =
  | { ok: true; proof: StoredProof }
  | { ok: false; code: DeliveryDomainCode };

export type StoredDelivery = {
  id: string;
  tripStopId: string;
  driverUserId: string;
  deliveredAt: Date;
  outcome: string;
  deliveredUnits: number | null;
  notes: string | null;
};

export type StoredProof = {
  id: string;
  deliveryRecordId: string;
  evidenceReference: string;
  capturedAt: Date;
  capturedByUserId: string | null;
};

export type DeliveryStop = {
  id: string;
  tripStatus: "PLANNED" | "CONFIRMED";
  vehicleDriverUserId: string | null;
  orderId: string;
  orderStatus: OrderStatusName;
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
  tempRequirement: "chilled" | "ambient";
  brand: string;
  district: string;
  depot: string;
};

export type DeliveryUnit = {
  orders: import("./order.js").OrderStore;
  findStop(id: string): Promise<DeliveryStop | null>;
  findDeliveryByStop(tripStopId: string): Promise<StoredDelivery | null>;
  createDelivery(input: {
    tripStopId: string;
    driverUserId: string;
    deliveredAt: Date;
    outcome: string;
    deliveredUnits: number | null;
    notes: string | null;
  }): Promise<StoredDelivery | "conflict">;
  createProof(input: {
    deliveryRecordId: string;
    evidenceReference: string;
    capturedAt: Date;
    capturedByUserId: string;
  }): Promise<StoredProof>;
};

export type DeliveryStore = {
  transaction<T>(work: (unit: DeliveryUnit) => Promise<T>): Promise<T>;
};

const deliveryProhibited = [
  "status",
  "role",
  "actorUserId",
  "driverUserId",
  "deliveredAt",
  "orderUnits",
  "orderWeightKg",
  "orderVolumeM3",
  "tempRequirement",
  "vehicleId",
  "tripId",
  "evidenceReference",
] as const;

const proofProhibited = [
  "status",
  "role",
  "actorUserId",
  "driverUserId",
  "capturedAt",
  "capturedByUserId",
  "orderUnits",
  "vehicleId",
  "tripId",
] as const;

export async function recordDelivery(input: {
  actor: OrderActor;
  command: Record<string, unknown>;
  now: Date;
  store: DeliveryStore;
}): Promise<DeliveryResult> {
  if (hasField(input.command, deliveryProhibited)) {
    return failure("invalid_input");
  }
  if (input.actor.role !== "DRIVER") {
    return failure("authorization_failure");
  }
  const tripStopId = requiredText(input.command.tripStopId);
  const outcome = requiredOutcome(input.command.outcome);
  const deliveredUnits = optionalUnits(input.command.deliveredUnits);
  const notes = optionalText(input.command.notes);
  if (tripStopId === null || outcome === null || deliveredUnits === null || notes === null) {
    return failure("invalid_input");
  }
  try {
    return await input.store.transaction(async (unit) => {
      const stop = await unit.findStop(tripStopId);
      if (stop === null) {
        throw rejected("not_found");
      }
      if (!assignedToVehicle(input.actor, stop.vehicleDriverUserId)) {
        throw rejected("object_scope_failure");
      }
      const existing = await unit.findDeliveryByStop(stop.id);
      if (existing !== null) {
        throw rejected(existing.driverUserId === input.actor.userId ? "lifecycle_conflict" : "object_scope_failure");
      }
      if (stop.tripStatus !== "CONFIRMED" || stop.orderStatus !== "DISPATCHED") {
        throw rejected("invalid_transition");
      }
      const created = await unit.createDelivery({
        tripStopId: stop.id,
        driverUserId: input.actor.userId,
        deliveredAt: input.now,
        outcome,
        deliveredUnits: deliveredUnits ?? null,
        notes: notes ?? null,
      });
      if (created === "conflict") {
        throw rejected("concurrency_conflict");
      }
      const moved = await transitionOrder({
        actor: input.actor,
        orderId: stop.orderId,
        to: "DELIVERED",
        now: input.now,
        store: unit.orders,
      });
      if (!moved.ok) {
        throw rejected(moved.code === "concurrency_conflict" ? "concurrency_conflict" : "invalid_transition");
      }
      return { ok: true as const, delivery: created };
    });
  } catch (error) {
    if (error instanceof DeliveryRejected) {
      return failure(error.code);
    }
    return failure(persistenceCode(error));
  }
}

export async function recordProof(input: {
  actor: OrderActor;
  command: Record<string, unknown>;
  now: Date;
  store: DeliveryStore;
}): Promise<ProofResult> {
  if (hasField(input.command, proofProhibited)) {
    return { ok: false, code: "invalid_input" };
  }
  if (input.actor.role !== "DRIVER") {
    return { ok: false, code: "authorization_failure" };
  }
  const tripStopId = requiredText(input.command.tripStopId);
  const evidenceReference = requiredEvidence(input.command.evidenceReference);
  if (tripStopId === null || evidenceReference === null) {
    return { ok: false, code: "invalid_input" };
  }
  try {
    return await input.store.transaction(async (unit) => {
      const stop = await unit.findStop(tripStopId);
      if (stop === null) {
        throw rejected("not_found");
      }
      if (!assignedToVehicle(input.actor, stop.vehicleDriverUserId)) {
        throw rejected("object_scope_failure");
      }
      const delivery = await unit.findDeliveryByStop(stop.id);
      if (delivery === null) {
        throw rejected("prerequisite_missing");
      }
      const assigned = authorizeDriverDelivery({
        role: input.actor.role,
        userId: input.actor.userId,
        deliveryDriverUserId: delivery.driverUserId,
        action: "mutate",
      });
      if (!assigned.allowed) {
        throw rejected("object_scope_failure");
      }
      const proof = await unit.createProof({
        deliveryRecordId: delivery.id,
        evidenceReference,
        capturedAt: input.now,
        capturedByUserId: input.actor.userId,
      });
      return { ok: true as const, proof };
    });
  } catch (error) {
    if (error instanceof DeliveryRejected) {
      return { ok: false, code: error.code };
    }
    return { ok: false, code: persistenceCode(error) };
  }
}

function assignedToVehicle(actor: OrderActor, vehicleDriverUserId: string | null): boolean {
  return authorizeDriverRoute({
    role: actor.role,
    userId: actor.userId,
    vehicleDriverUserId,
    action: "mutate",
  }).allowed;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function requiredOutcome(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return value;
}

function requiredEvidence(value: unknown): string | null {
  if (typeof value !== "string" || value.trim() === "") {
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

function optionalUnits(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function hasField(command: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(command, field));
}

class DeliveryRejected extends Error {
  constructor(readonly code: DeliveryDomainCode) {
    super(code);
  }
}

function rejected(code: DeliveryDomainCode): DeliveryRejected {
  return new DeliveryRejected(code);
}

function failure(code: DeliveryDomainCode): DeliveryResult {
  return { ok: false, code };
}
