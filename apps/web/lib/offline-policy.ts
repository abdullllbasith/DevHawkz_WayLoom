import type { OfflineEventType, OfflineLocalState } from "./offline-boundary";
import type { DriverTrip } from "./driver-routes";
import type { OfflineStore, PendingSyncEvent } from "./offline-store";

export type SyncDisposition = "applied" | "already-applied" | "retryable" | "non-retryable" | "unauthorized" | "conflict";

export const syncAttentionLabels = [
  "synchronized successfully",
  "already synchronized",
  "retrying",
  "rejected",
  "conflict requiring attention",
] as const;

export type SyncAttentionLabel = (typeof syncAttentionLabels)[number];

export function syncAttentionLabel(disposition: SyncDisposition): SyncAttentionLabel {
  if (disposition === "applied") return "synchronized successfully";
  if (disposition === "already-applied") return "already synchronized";
  if (disposition === "retryable") return "retrying";
  if (disposition === "conflict") return "conflict requiring attention";
  return "rejected";
}

const retryLimit = 5;

export function sameClientEvent(left: string, right: string): boolean {
  return left.trim().length > 0 && left === right;
}

export function classifySyncResult(input: {
  eventType: OfflineEventType;
  clientEventId: string;
  recordedClientEventId: string | null;
  httpStatus: number;
  domainCode?: string;
  attemptCount: number;
}): SyncDisposition {
  if (input.clientEventId.trim().length === 0) return "non-retryable";
  if (input.recordedClientEventId !== null && sameClientEvent(input.recordedClientEventId, input.clientEventId)) {
    return "already-applied";
  }
  if (input.httpStatus === 401 || input.httpStatus === 403 || input.domainCode === "authorization_failure" || input.domainCode === "object_scope_failure") {
    return "unauthorized";
  }
  if (input.domainCode === "lifecycle_conflict" || input.domainCode === "concurrency_conflict") {
    return "conflict";
  }
  if (input.httpStatus === 0 || input.httpStatus === 502 || input.httpStatus === 503 || input.httpStatus === 504) {
    return input.attemptCount >= retryLimit ? "non-retryable" : "retryable";
  }
  if (input.httpStatus >= 400) return "non-retryable";
  return "applied";
}

const eventTypeOrder = { "delivery outcome": 0, "proof of delivery": 1 } as const;

export type SyncServerResult = {
  clientEventId: string;
  result: string;
  errorCode?: string;
};

export type SyncSubmission =
  | { ok: true; results: SyncServerResult[] }
  | { ok: false; httpStatus: number };

export function pendingSyncEvents(events: readonly PendingSyncEvent[]): PendingSyncEvent[] {
  return events
    .filter((event) => event.state === "Pending Sync" || event.state === "Syncing")
    .slice()
    .sort((left, right) => {
      const created = left.clientCreatedAt.localeCompare(right.clientCreatedAt);
      if (created !== 0) return created;
      const type = eventTypeOrder[left.eventType] - eventTypeOrder[right.eventType];
      if (type !== 0) return type;
      return left.clientEventId.localeCompare(right.clientEventId);
    });
}

export async function reconcileOfflineEvents(input: {
  store: OfflineStore;
  submit: (events: readonly PendingSyncEvent[]) => Promise<SyncSubmission>;
  refresh: (trips: readonly DriverTrip[]) => Promise<void>;
  readRoutes: () => Promise<{ ok: true; trips: DriverTrip[] } | { ok: false }>;
}): Promise<PendingSyncEvent[]> {
  const pending = pendingSyncEvents(await input.store.listEvents());
  if (pending.length === 0) return [];
  const syncing = pending.map((event) => ({ ...event, state: "Syncing" as const }));
  for (const event of syncing) await input.store.putEvent(event);

  let submission: SyncSubmission;
  try {
    submission = await input.submit(syncing);
  } catch {
    submission = { ok: false, httpStatus: 0 };
  }

  const updated: PendingSyncEvent[] = [];
  for (const event of syncing) {
    const next = applyResult(event, submission);
    await input.store.putEvent(next);
    updated.push(next);
  }

  if (updated.some((event) => event.state === "Synced")) {
    const routes = await input.readRoutes();
    if (routes.ok) await input.refresh(routes.trips);
  }
  return updated;
}

function applyResult(event: PendingSyncEvent, submission: SyncSubmission): PendingSyncEvent {
  const attemptCount = event.attemptCount + 1;
  const server = submission.ok ? submission.results.find((result) => result.clientEventId === event.clientEventId) : undefined;
  const disposition = server === undefined
    ? classifySyncResult({
        eventType: event.eventType,
        clientEventId: event.clientEventId,
        recordedClientEventId: null,
        httpStatus: submission.ok ? 502 : submission.httpStatus,
        attemptCount,
      })
    : dispositionFor(event, server, attemptCount);
  return {
    clientEventId: event.clientEventId,
    eventType: event.eventType,
    targetId: event.targetId,
    clientCreatedAt: event.clientCreatedAt,
    payload: event.payload,
    attemptCount,
    state: nextLocalState(disposition, "Syncing"),
    attention: syncAttentionLabel(disposition),
  };
}

function dispositionFor(event: PendingSyncEvent, server: SyncServerResult, attemptCount: number): SyncDisposition {
  if (server.result === "already applied") {
    return classifySyncResult({
      eventType: event.eventType,
      clientEventId: event.clientEventId,
      recordedClientEventId: event.clientEventId,
      httpStatus: 200,
      attemptCount,
    });
  }
  if (server.result === "applied") {
    return classifySyncResult({
      eventType: event.eventType,
      clientEventId: event.clientEventId,
      recordedClientEventId: null,
      httpStatus: 200,
      attemptCount,
    });
  }
  if (server.result === "unauthorized") {
    return classifySyncResult({
      eventType: event.eventType,
      clientEventId: event.clientEventId,
      recordedClientEventId: null,
      httpStatus: 403,
      domainCode: server.errorCode === "object_scope_failure" ? "object_scope_failure" : "authorization_failure",
      attemptCount,
    });
  }
  if (server.result === "conflict") {
    return classifySyncResult({
      eventType: event.eventType,
      clientEventId: event.clientEventId,
      recordedClientEventId: null,
      httpStatus: 409,
      domainCode: server.errorCode === "concurrency_conflict" ? "concurrency_conflict" : "lifecycle_conflict",
      attemptCount,
    });
  }
  if (server.result === "temporary server failure") {
    return classifySyncResult({
      eventType: event.eventType,
      clientEventId: event.clientEventId,
      recordedClientEventId: null,
      httpStatus: 503,
      attemptCount,
    });
  }
  return classifySyncResult({
    eventType: event.eventType,
    clientEventId: event.clientEventId,
    recordedClientEventId: null,
    httpStatus: 400,
    attemptCount,
  });
}

export function nextLocalState(disposition: SyncDisposition, current: OfflineLocalState): OfflineLocalState {
  if (disposition === "applied" || disposition === "already-applied") return "Synced";
  if (disposition === "retryable") return "Pending Sync";
  if (current === "Syncing" && disposition === "unauthorized") return "Failed / Needs Attention";
  if (disposition === "conflict" || disposition === "non-retryable" || disposition === "unauthorized") return "Failed / Needs Attention";
  return current;
}
