import assert from "node:assert/strict";
import test from "node:test";

import { parseSyncEvent, sameSyncEvent } from "./sync-event.js";

const createdAt = new Date("2026-06-02T09:00:00.000Z");

test("a sync event keeps one client id and the approved types", () => {
  const event = parseSyncEvent({
    clientEventId: "event-1",
    eventType: "delivery outcome",
    targetId: "stop-1",
    clientCreatedAt: createdAt,
    attemptCount: 1,
    payload: { outcome: "left at gate" },
  });
  assert.equal(event?.clientEventId, "event-1");
  assert.equal(sameSyncEvent("event-1", event!), true);
  assert.equal(parseSyncEvent({ ...event!, eventType: "loading shortfall", payload: {} }), null);
  assert.equal(parseSyncEvent({ clientEventId: "event-1", eventType: "proof of delivery", targetId: "stop-1", clientCreatedAt: createdAt, attemptCount: 0, payload: { sessionToken: "secret" } }), null);
});
