import assert from "node:assert/strict";
import test from "node:test";

import { classifySyncResult, nextLocalState } from "./offline-policy.ts";

test("a repeated client event converges and a different delivery does not overwrite", () => {
  assert.equal(
    classifySyncResult({ eventType: "delivery outcome", clientEventId: "event-1", recordedClientEventId: "event-1", httpStatus: 200, attemptCount: 2 }),
    "already-applied",
  );
  assert.equal(
    classifySyncResult({ eventType: "proof of delivery", clientEventId: "event-2", recordedClientEventId: null, httpStatus: 409, domainCode: "lifecycle_conflict", attemptCount: 1 }),
    "conflict",
  );
  assert.equal(nextLocalState("conflict", "Syncing"), "Failed / Needs Attention");
  assert.equal(nextLocalState("already-applied", "Syncing"), "Synced");
});

test("connectivity retries stop and authorization is not retried", () => {
  assert.equal(classifySyncResult({ eventType: "delivery outcome", clientEventId: "event-1", recordedClientEventId: null, httpStatus: 503, attemptCount: 1 }), "retryable");
  assert.equal(classifySyncResult({ eventType: "delivery outcome", clientEventId: "event-1", recordedClientEventId: null, httpStatus: 503, attemptCount: 5 }), "non-retryable");
  assert.equal(classifySyncResult({ eventType: "delivery outcome", clientEventId: "event-1", recordedClientEventId: null, httpStatus: 401, attemptCount: 1 }), "unauthorized");
  assert.equal(nextLocalState("unauthorized", "Pending Sync"), "Failed / Needs Attention");
});
