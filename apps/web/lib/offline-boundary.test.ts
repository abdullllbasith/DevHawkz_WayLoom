import assert from "node:assert/strict";
import test from "node:test";

import { canRemoveLocalRecord, isDriverCacheField, localPayloadIsAllowed, localRecordIsServerConfirmed, offlineEventTypes } from "./offline-boundary.ts";

test("offline cache is driver delivery data and not a server confirmation", () => {
  assert.equal(isDriverCacheField("orderId"), true);
  assert.equal(isDriverCacheField("password"), false);
  assert.equal(isDriverCacheField("loaderUserId"), false);
  assert.deepEqual(offlineEventTypes, ["delivery outcome", "proof of delivery"]);
  assert.equal(localRecordIsServerConfirmed("Pending Sync"), false);
  assert.equal(localRecordIsServerConfirmed("Synced"), true);
});

test("pending events survive route cleanup and logout", () => {
  assert.equal(canRemoveLocalRecord({ state: "Pending Sync", reason: "logout" }), false);
  assert.equal(canRemoveLocalRecord({ state: "Failed / Needs Attention", reason: "route-complete" }), false);
  assert.equal(canRemoveLocalRecord({ state: "Synced", reason: "logout" }), true);
  assert.equal(localPayloadIsAllowed({ outcome: "left at gate", sessionToken: "secret" }), false);
});
