import assert from "node:assert/strict";
import test from "node:test";

import { createMemoryOfflineStore } from "./offline-store.ts";
import type { DriverTrip } from "./driver-routes.ts";

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

test("offline storage keeps a route cache and pending events separately", async () => {
  const store = createMemoryOfflineStore();
  await store.putRoute({ tripId: trip.id, cachedAt: "2026-06-02T08:00:00.000Z", trip });
  await store.putEvent({
    clientEventId: "event-1",
    eventType: "delivery outcome",
    targetId: "stop-1",
    clientCreatedAt: "2026-06-02T09:00:00.000Z",
    state: "Pending Sync",
    attemptCount: 0,
    payload: { outcome: "left at gate" },
  });
  await store.clearCompletedRoutes();
  assert.equal((await store.listRoutes()).length, 0);
  assert.equal((await store.listEvents())[0]?.state, "Pending Sync");
});

test("offline storage rejects a session secret", async () => {
  const store = createMemoryOfflineStore();
  await assert.rejects(
    store.putEvent({
      clientEventId: "event-2",
      eventType: "proof of delivery",
      targetId: "stop-1",
      clientCreatedAt: "2026-06-02T09:00:00.000Z",
      state: "Saved Locally",
      attemptCount: 0,
      payload: { sessionToken: "secret" },
    }),
  );
});
