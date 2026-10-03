import { parseResourceId } from "../contracts/api-contracts.js";
import { authorizeDriverRoute } from "../security/object-authorization.js";
import type { DeliveryStore } from "./delivery.js";
import { recordDelivery, recordProof } from "./delivery.js";
import type { OrderActor } from "./order.js";
import { parseSyncEvent, type SyncEventDraft, type SyncEventTypeName } from "./sync-event.js";

export const syncResultNames = [
  "applied",
  "already applied",
  "validation rejected",
  "unauthorized",
  "conflict",
  "temporary server failure",
] as const;

export type SyncResultName = (typeof syncResultNames)[number];

export type SyncEventResult = {
  clientEventId: string | null;
  result: SyncResultName;
  errorCode?: string;
};

export type SyncStatusEntry =
  | { clientEventId: string; recorded: false }
  | { clientEventId: string; recorded: true; result: SyncResultName; errorCode: string | null };

export type StoredSyncEvent = {
  clientEventId: string;
  eventType: SyncEventTypeName;
  targetType: "TripStop";
  targetId: string;
  clientCreatedAt: Date;
  receivedAt: Date;
  errorCode: string | null;
  errorMessage: string | null;
  lastAttemptAt: Date | null;
  attemptCount: number | null;
};

export type SyncBatchUnit = {
  deliveries: DeliveryStore;
  findByClientEventId(clientEventId: string): Promise<StoredSyncEvent | null>;
  claim(event: StoredSyncEvent): Promise<"ok" | "conflict">;
  release(clientEventId: string): Promise<void>;
  recordError(clientEventId: string, errorCode: string): Promise<void>;
};

export type SyncBatchStore = {
  findByClientEventId(clientEventId: string): Promise<StoredSyncEvent | null>;
  transaction<T>(work: (unit: SyncBatchUnit) => Promise<T>): Promise<T>;
};

const forbiddenBatchKeys = ["password", "passwordHash", "sessionToken", "csrfToken", "cookie", "actorUserId", "role"];

export function parseSyncBatchBody(value: unknown): { events: unknown[] } | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 1 || keys[0] !== "events" || keys.some((key) => forbiddenBatchKeys.includes(key))) {
    return null;
  }
  return Array.isArray(record.events) ? { events: record.events } : null;
}

export async function applySyncBatch(input: {
  actor: OrderActor;
  events: readonly unknown[];
  now: Date;
  store: SyncBatchStore;
}): Promise<SyncEventResult[]> {
  const results: SyncEventResult[] = [];
  for (const event of input.events) {
    results.push(await applyOne(input.actor, event, input.now, input.store));
  }
  return results;
}

export async function readSyncStatus(input: {
  actor: OrderActor;
  clientEventIds: readonly string[];
  store: SyncBatchStore;
  deliveries: DeliveryStore;
}): Promise<SyncStatusEntry[]> {
  const results: SyncStatusEntry[] = [];
  for (const clientEventId of input.clientEventIds) {
    const event = await input.store.findByClientEventId(clientEventId);
    if (event === null) {
      results.push({ clientEventId, recorded: false });
      continue;
    }
    const allowed = await ownsStop(input.actor, event.targetId, input.deliveries);
    if (!allowed) {
      results.push({ clientEventId, recorded: true, result: "unauthorized", errorCode: null });
      continue;
    }
    const stored = fromStored(event);
    results.push({
      clientEventId,
      recorded: true,
      result: stored.result,
      errorCode: stored.errorCode ?? null,
    });
  }
  return results;
}

async function applyOne(
  actor: OrderActor,
  value: unknown,
  now: Date,
  store: SyncBatchStore,
): Promise<SyncEventResult> {
  const prepared = prepareEvent(value);
  if (prepared.ok === false) {
    return { clientEventId: prepared.clientEventId, result: "validation rejected" };
  }
  const command = commandFor(prepared.draft, prepared.payload);
  if (command === null) {
    return { clientEventId: prepared.draft.clientEventId, result: "validation rejected" };
  }
  try {
    return await store.transaction(async (unit) => {
      const existing = await unit.findByClientEventId(prepared.draft.clientEventId);
      if (existing !== null) {
        return fromStored(existing);
      }
      const claimed = await unit.claim(storedClaim(prepared.draft, now));
      if (claimed === "conflict") {
        const winner = await unit.findByClientEventId(prepared.draft.clientEventId);
        return winner === null
          ? { clientEventId: prepared.draft.clientEventId, result: "conflict" }
          : fromStored(winner);
      }
      const domain =
        prepared.draft.eventType === "delivery outcome"
          ? await recordDelivery({ actor, command, now, store: unit.deliveries })
          : await recordProof({ actor, command, now, store: unit.deliveries });
      if (domain.ok) {
        return { clientEventId: prepared.draft.clientEventId, result: "applied" };
      }
      const result = mapCode(domain.code);
      if (retain(domain.code)) {
        await unit.recordError(prepared.draft.clientEventId, domain.code);
      } else {
        await unit.release(prepared.draft.clientEventId);
      }
      return { clientEventId: prepared.draft.clientEventId, result, errorCode: domain.code };
    });
  } catch {
    return { clientEventId: prepared.draft.clientEventId, result: "temporary server failure" };
  }
}

function prepareEvent(
  value: unknown,
): { ok: true; draft: SyncEventDraft; payload: unknown } | { ok: false; clientEventId: string | null } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, clientEventId: null };
  }
  const record: Record<string, unknown> = { ...value };
  const clientEventId = typeof record.clientEventId === "string" && record.clientEventId.trim().length > 0 ? record.clientEventId : null;
  if (typeof record.clientCreatedAt === "string") {
    const createdAt = new Date(record.clientCreatedAt);
    if (Number.isNaN(createdAt.getTime())) {
      return { ok: false, clientEventId };
    }
    record.clientCreatedAt = createdAt;
  }
  const draft = parseSyncEvent(record);
  if (draft === null) {
    return { ok: false, clientEventId };
  }
  const targetId = parseResourceId(draft.targetId);
  if (!targetId.ok) {
    return { ok: false, clientEventId: draft.clientEventId };
  }
  return { ok: true, draft: { ...draft, targetId: targetId.value }, payload: record.payload };
}

function commandFor(draft: SyncEventDraft, payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const keys = Object.keys(record);
  if (draft.eventType === "delivery outcome") {
    if (!keys.includes("outcome") || keys.some((key) => key !== "outcome" && key !== "deliveredUnits" && key !== "notes")) {
      return null;
    }
    return {
      tripStopId: draft.targetId,
      outcome: record.outcome,
      ...(record.deliveredUnits === undefined ? {} : { deliveredUnits: record.deliveredUnits }),
      ...(record.notes === undefined ? {} : { notes: record.notes }),
    };
  }
  if (keys.length !== 1 || keys[0] !== "evidenceReference") {
    return null;
  }
  return { tripStopId: draft.targetId, evidenceReference: record.evidenceReference };
}

function storedClaim(draft: SyncEventDraft, now: Date): StoredSyncEvent {
  return {
    clientEventId: draft.clientEventId,
    eventType: draft.eventType,
    targetType: "TripStop",
    targetId: draft.targetId,
    clientCreatedAt: draft.clientCreatedAt,
    receivedAt: now,
    errorCode: null,
    errorMessage: null,
    lastAttemptAt: now,
    attemptCount: draft.attemptCount,
  };
}

function fromStored(event: StoredSyncEvent): SyncEventResult {
  if (event.errorCode === null) {
    return { clientEventId: event.clientEventId, result: "already applied" };
  }
  return { clientEventId: event.clientEventId, result: mapCode(event.errorCode), errorCode: event.errorCode };
}

function mapCode(code: string): SyncResultName {
  if (code === "authorization_failure" || code === "object_scope_failure") {
    return "unauthorized";
  }
  if (code === "lifecycle_conflict" || code === "concurrency_conflict") {
    return "conflict";
  }
  if (code === "persistence_failure") {
    return "temporary server failure";
  }
  return "validation rejected";
}

function retain(code: string): boolean {
  return code === "lifecycle_conflict" || code === "concurrency_conflict";
}

async function ownsStop(actor: OrderActor, tripStopId: string, deliveries: DeliveryStore): Promise<boolean> {
  const stop = await deliveries.transaction(async (unit) => unit.findStop(tripStopId));
  if (stop === null) {
    return false;
  }
  return authorizeDriverRoute({
    role: actor.role,
    userId: actor.userId,
    vehicleDriverUserId: stop.vehicleDriverUserId,
    action: "read",
  }).allowed;
}
