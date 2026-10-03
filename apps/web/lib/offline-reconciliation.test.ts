import assert from "node:assert/strict";
import test from "node:test";

import type { DriverTrip } from "./driver-routes.ts";
import { createMemoryOfflineStore, type PendingSyncEvent } from "./offline-store.ts";
import { pendingSyncEvents, reconcileOfflineEvents, type SyncSubmission } from "./offline-policy.ts";

const trip: DriverTrip = {
  id: "trip-1",
  routeId: null,
  operationalDate: "2026-06-02",
  vehicleId: "vehicle-1",
  depot: "Peliyagoda",
  tripNumber: 1,
  status: "CONFIRMED",
  stops: [{ id: "stop-1", tripId: "trip-1", orderId: "order-1", sequence: 0, plannedArrival: null }],
};

test("reconnection submits pending events in recorded order and keeps each result", async () => {
  const store = createMemoryOfflineStore();
  await store.putEvent(event("proof-1", "proof of delivery", "2026-06-02T09:01:00.000Z", { evidenceReference: "gate note" }));
  await store.putEvent(event("outcome-1", "delivery outcome", "2026-06-02T09:00:00.000Z", { outcome: "left at gate" }));
  await store.putEvent({ ...event("done-1", "delivery outcome", "2026-06-02T08:00:00.000Z", { outcome: "already" }), state: "Synced" });
  const submitted: string[] = [];
  let refreshed = 0;
  const results = await reconcileOfflineEvents({
    store,
    submit(events) {
      submitted.push(...events.map((item) => item.clientEventId));
      return Promise.resolve({
        ok: true,
        results: [
          { clientEventId: "outcome-1", result: "applied" },
          { clientEventId: "proof-1", result: "temporary server failure" },
        ],
      } satisfies SyncSubmission);
    },
    refresh: async () => {
      refreshed += 1;
    },
    readRoutes: async () => ({ ok: true, trips: [trip] }),
  });
  assert.deepEqual(submitted, ["outcome-1", "proof-1"]);
  assert.equal(results.find((item) => item.clientEventId === "outcome-1")?.state, "Synced");
  assert.equal(results.find((item) => item.clientEventId === "proof-1")?.state, "Pending Sync");
  assert.equal(results.find((item) => item.clientEventId === "proof-1")?.attemptCount, 1);
  assert.equal(results.find((item) => item.clientEventId === "proof-1")?.clientEventId, "proof-1");
  assert.equal((await store.listEvents()).find((item) => item.clientEventId === "done-1")?.state, "Synced");
  assert.equal(refreshed, 1);
  assert.equal((await store.listEvents()).length, 3);
});

test("an already-applied event converges and a conflict stays visible", async () => {
  const store = createMemoryOfflineStore();
  await store.putEvent(event("outcome-1", "delivery outcome", "2026-06-02T09:00:00.000Z", { outcome: "left at gate" }));
  await store.putEvent(event("outcome-2", "delivery outcome", "2026-06-02T09:02:00.000Z", { outcome: "second" }));
  const results = await reconcileOfflineEvents({
    store,
    submit: async () => ({
      ok: true,
      results: [
        { clientEventId: "outcome-1", result: "already applied" },
        { clientEventId: "outcome-2", result: "conflict", errorCode: "lifecycle_conflict" },
      ],
    }),
    refresh: async () => undefined,
    readRoutes: async () => ({ ok: true, trips: [trip] }),
  });
  assert.equal(results[0]?.state, "Synced");
  assert.equal(results[1]?.state, "Failed / Needs Attention");
  assert.deepEqual((await store.listEvents()).find((item) => item.clientEventId === "outcome-2")?.payload, { outcome: "second" });
});

test("a connectivity failure stays recoverable until the retry limit", async () => {
  const store = createMemoryOfflineStore();
  await store.putEvent({ ...event("outcome-1", "delivery outcome", "2026-06-02T09:00:00.000Z", { outcome: "left at gate" }), attemptCount: 4 });
  const results = await reconcileOfflineEvents({
    store,
    submit: async () => {
      throw new Error("offline");
    },
    refresh: async () => {
      throw new Error("refresh should not run");
    },
    readRoutes: async () => ({ ok: false }),
  });
  assert.equal(results[0]?.state, "Failed / Needs Attention");
  assert.equal(results[0]?.clientEventId, "outcome-1");
  assert.equal(pendingSyncEvents(await store.listEvents()).length, 0);
});

test("a missing batch result is not treated as success", async () => {
  const store = createMemoryOfflineStore();
  await store.putEvent(event("outcome-1", "delivery outcome", "2026-06-02T09:00:00.000Z", { outcome: "left at gate" }));
  const results = await reconcileOfflineEvents({
    store,
    submit: async () => ({ ok: true, results: [] }),
    refresh: async () => undefined,
    readRoutes: async () => ({ ok: true, trips: [trip] }),
  });
  assert.equal(results[0]?.state, "Pending Sync");
});

function event(
  clientEventId: string,
  eventType: PendingSyncEvent["eventType"],
  clientCreatedAt: string,
  payload: Record<string, unknown>,
): PendingSyncEvent {
  return {
    clientEventId,
    eventType,
    targetId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
    clientCreatedAt,
    state: "Pending Sync",
    attemptCount: 0,
    payload,
  };
}
