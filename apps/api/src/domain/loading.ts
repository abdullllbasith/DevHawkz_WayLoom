import { authorizeLoaderTask } from "../security/object-authorization.js";
import type { OrderActor, OrderStatusName } from "./order.js";
import { transitionOrder } from "./order-transition.js";

export type LoadingDomainCode =
  | "invalid_input"
  | "not_found"
  | "authorization_failure"
  | "object_scope_failure"
  | "invalid_transition"
  | "lifecycle_conflict"
  | "prerequisite_missing"
  | "concurrency_conflict"
  | "persistence_failure";

export type LoadingResult =
  | { ok: true; loading: StoredLoading }
  | { ok: false; code: LoadingDomainCode };

export type StoredLoading = {
  id: string;
  tripStopId: string;
  loaderUserId: string;
  expectedUnits: number;
  loadedUnits: number;
  shortfallUnits: number | null;
  verifiedAt: Date;
  shortfallReportedAt: Date | null;
  details: string | null;
};

export type LoadingStop = {
  id: string;
  tripStatus: "PLANNED" | "CONFIRMED";
  orderId: string;
  orderStatus: OrderStatusName;
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
  brand: string;
  district: string;
  depot: string;
};

export type LoadingUnit = {
  orders: import("./order.js").OrderStore;
  findStop(id: string): Promise<LoadingStop | null>;
  findByStop(tripStopId: string): Promise<StoredLoading | null>;
  create(input: {
    tripStopId: string;
    loaderUserId: string;
    expectedUnits: number;
    loadedUnits: number;
    verifiedAt: Date;
  }): Promise<StoredLoading | "conflict">;
  recordShortfall(input: {
    id: string;
    shortfallUnits: number;
    reportedAt: Date;
    details: string | null;
  }): Promise<StoredLoading | null>;
};

export type LoadingStore = {
  transaction<T>(work: (unit: LoadingUnit) => Promise<T>): Promise<T>;
};

const verifyProhibited = [
  "status",
  "role",
  "actorUserId",
  "expectedUnits",
  "loaderUserId",
  "verifiedAt",
  "orderUnits",
  "orderWeightKg",
  "orderVolumeM3",
  "shortfallUnits",
  "vehicleId",
  "tripId",
] as const;

const shortfallProhibited = [
  "status",
  "role",
  "actorUserId",
  "expectedUnits",
  "loadedUnits",
  "loaderUserId",
  "verifiedAt",
  "orderUnits",
  "orderWeightKg",
  "orderVolumeM3",
  "vehicleId",
  "tripId",
] as const;

export async function verifyLoading(input: {
  actor: OrderActor;
  command: Record<string, unknown>;
  now: Date;
  store: LoadingStore;
}): Promise<LoadingResult> {
  if (hasField(input.command, verifyProhibited)) {
    return failure("invalid_input");
  }
  if (input.actor.role !== "LOADER") {
    return failure("authorization_failure");
  }
  const tripStopId = requiredText(input.command.tripStopId);
  const loadedUnits = requiredUnits(input.command.loadedUnits);
  if (tripStopId === null || loadedUnits === null) {
    return failure("invalid_input");
  }
  try {
    return await input.store.transaction(async (unit) => {
      const stop = await unit.findStop(tripStopId);
      if (stop === null) {
        throw rejected("not_found");
      }
      const existing = await unit.findByStop(stop.id);
      if (existing !== null) {
        throw rejected(existing.loaderUserId === input.actor.userId ? "lifecycle_conflict" : "object_scope_failure");
      }
      if (stop.tripStatus !== "CONFIRMED" || stop.orderStatus !== "PLANNED_ALLOCATED") {
        throw rejected("invalid_transition");
      }
      const created = await unit.create({
        tripStopId: stop.id,
        loaderUserId: input.actor.userId,
        expectedUnits: stop.orderUnits,
        loadedUnits,
        verifiedAt: input.now,
      });
      if (created === "conflict") {
        throw rejected("concurrency_conflict");
      }
      for (const to of ["LOADING", "LOADED"] as const) {
        const moved = await transitionOrder({
          actor: input.actor,
          orderId: stop.orderId,
          to,
          now: input.now,
          store: unit.orders,
        });
        if (!moved.ok) {
          throw rejected(moved.code === "concurrency_conflict" ? "concurrency_conflict" : "invalid_transition");
        }
      }
      return { ok: true as const, loading: created };
    });
  } catch (error) {
    if (error instanceof LoadingRejected) {
      return failure(error.code);
    }
    return failure("persistence_failure");
  }
}

export async function reportShortfall(input: {
  actor: OrderActor;
  command: Record<string, unknown>;
  now: Date;
  store: LoadingStore;
}): Promise<LoadingResult> {
  if (hasField(input.command, shortfallProhibited)) {
    return failure("invalid_input");
  }
  if (input.actor.role !== "LOADER") {
    return failure("authorization_failure");
  }
  const tripStopId = requiredText(input.command.tripStopId);
  const shortfallUnits = requiredUnits(input.command.shortfallUnits);
  const details = optionalText(input.command.details);
  if (tripStopId === null || shortfallUnits === null || details === null) {
    return failure("invalid_input");
  }
  try {
    return await input.store.transaction(async (unit) => {
      const stop = await unit.findStop(tripStopId);
      if (stop === null) {
        throw rejected("not_found");
      }
      const existing = await unit.findByStop(stop.id);
      if (existing === null) {
        throw rejected("prerequisite_missing");
      }
      const assigned = authorizeLoaderTask({
        role: input.actor.role,
        userId: input.actor.userId,
        loaderUserId: existing.loaderUserId,
        action: "mutate",
      });
      if (!assigned.allowed) {
        throw rejected("object_scope_failure");
      }
      if (existing.shortfallReportedAt !== null) {
        throw rejected("lifecycle_conflict");
      }
      const updated = await unit.recordShortfall({
        id: existing.id,
        shortfallUnits,
        reportedAt: input.now,
        details: details ?? null,
      });
      if (updated === null) {
        throw rejected("concurrency_conflict");
      }
      return { ok: true as const, loading: updated };
    });
  } catch (error) {
    if (error instanceof LoadingRejected) {
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

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  return value;
}

function requiredUnits(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function hasField(command: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(command, field));
}

class LoadingRejected extends Error {
  constructor(readonly code: LoadingDomainCode) {
    super(code);
  }
}

function rejected(code: LoadingDomainCode): LoadingRejected {
  return new LoadingRejected(code);
}

function failure(code: LoadingDomainCode): LoadingResult {
  return { ok: false, code };
}
