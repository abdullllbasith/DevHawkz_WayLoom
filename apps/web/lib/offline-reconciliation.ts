import { readDriverRoutes, type DriverTrip } from "./driver-routes";
import type { PendingSyncEvent } from "./offline-store";
import type { OfflineStore } from "./offline-store";
import type { SyncServerResult, SyncSubmission } from "./offline-policy";

export async function cacheDriverRoutes(store: OfflineStore, trips: readonly DriverTrip[], cachedAt: string): Promise<void> {
  for (const trip of trips) {
    await store.putRoute({ tripId: trip.id, cachedAt, trip });
  }
}

export async function submitSyncBatch(input: {
  events: readonly PendingSyncEvent[];
  csrfToken: string;
  fetchFn?: typeof fetch;
}): Promise<SyncSubmission> {
  const fetchFn = input.fetchFn ?? fetch;
  try {
    const response = await fetchFn("/api/sync/batch", {
      method: "POST",
      headers: { "content-type": "application/json", "x-wayloom-csrf": input.csrfToken },
      body: JSON.stringify({
        events: input.events.map((event) => ({
          clientEventId: event.clientEventId,
          eventType: event.eventType,
          targetId: event.targetId,
          clientCreatedAt: event.clientCreatedAt,
          attemptCount: event.attemptCount + 1,
          payload: event.payload,
        })),
      }),
      cache: "no-store",
    });
    if (!response.ok) return { ok: false, httpStatus: response.status };
    const body: unknown = await response.json();
    const results = readSyncResults(body);
    return results === null ? { ok: false, httpStatus: 502 } : { ok: true, results };
  } catch {
    return { ok: false, httpStatus: 0 };
  }
}

export async function readAssignedRoutes(fetchFn: typeof fetch = fetch): Promise<{ ok: true; trips: DriverTrip[] } | { ok: false }> {
  try {
    const response = await fetchFn("/api/driver/routes", { cache: "no-store" });
    if (!response.ok) return { ok: false };
    const trips = readDriverRoutes(await response.json());
    return trips === null ? { ok: false } : { ok: true, trips };
  } catch {
    return { ok: false };
  }
}

function readSyncResults(value: unknown): SyncServerResult[] | null {
  if (typeof value !== "object" || value === null || !("results" in value) || !Array.isArray(value.results)) return null;
  const results: SyncServerResult[] = [];
  for (const item of value.results) {
    if (typeof item !== "object" || item === null) return null;
    const record = item as Record<string, unknown>;
    if (typeof record.clientEventId !== "string" || typeof record.result !== "string") return null;
    results.push({
      clientEventId: record.clientEventId,
      result: record.result,
      ...(typeof record.errorCode === "string" ? { errorCode: record.errorCode } : {}),
    });
  }
  return results;
}
