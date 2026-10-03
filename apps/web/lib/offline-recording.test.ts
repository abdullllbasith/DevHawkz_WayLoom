import assert from "node:assert/strict";
import test from "node:test";

import { recordOfflineAction } from "./offline-recording.ts";
import { createMemoryOfflineStore } from "./offline-store.ts";

test("an offline delivery keeps one client event id and is not synced", async () => {
  const store = createMemoryOfflineStore();
  const first = await recordOfflineAction({
    store,
    clientEventId: "event-1",
    eventType: "delivery outcome",
    targetId: "stop-1",
    clientCreatedAt: "2026-06-02T09:00:00.000Z",
    payload: { outcome: "left at gate" },
  });
  const second = await recordOfflineAction({
    store,
    clientEventId: "event-1",
    eventType: "delivery outcome",
    targetId: "stop-1",
    clientCreatedAt: "2026-06-02T10:00:00.000Z",
    payload: { outcome: "different" },
  });
  assert.equal(first.state, "Pending Sync");
  assert.equal(second.clientCreatedAt, first.clientCreatedAt);
  assert.equal(second.payload.outcome, "left at gate");
  assert.equal((await store.listEvents()).length, 1);
});
