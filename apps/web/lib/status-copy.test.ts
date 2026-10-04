import assert from "node:assert/strict";
import test from "node:test";

import {
  humanActionError,
  lifecycleBadgeClass,
  lifecycleLabel,
  loaderVerifiedMessage,
  offlineSavedMessage,
  readErrorCode,
  receiptGuidance,
} from "./status-copy.ts";

test("lifecycle labels stay human and do not echo unknown codes as the title", () => {
  assert.equal(lifecycleLabel("SUBMITTED"), "Submitted");
  assert.equal(lifecycleLabel("PLANNED_ALLOCATED"), "Allocated");
  assert.equal(lifecycleLabel("RECEIPT_CONFIRMED"), "Receipt confirmed");
  assert.equal(lifecycleLabel("LOADED"), "Loaded");
  assert.equal(lifecycleLabel("NOT_A_STATUS"), "Recorded");
  assert.equal(lifecycleBadgeClass("CONFIRMED"), "badge-status-done");
  assert.equal(lifecycleBadgeClass("RECEIPT_CONFIRMED"), "badge-status-done");
  assert.equal(lifecycleBadgeClass("DELIVERED"), "badge-status-done");
  assert.equal(lifecycleBadgeClass("LOADED"), "badge-status-done");
  assert.equal(lifecycleBadgeClass("PLANNED"), "badge-status-active");
  assert.equal(lifecycleBadgeClass("PLANNED_ALLOCATED"), "badge-status-active");
  assert.equal(lifecycleBadgeClass("DISPATCHED"), "badge-status-active");
  assert.equal(lifecycleBadgeClass("SUBMITTED"), "badge-status-pending");
  assert.equal(lifecycleBadgeClass("DEFERRED"), "badge-status-warn");
});

test("action errors translate denial, conflict, and network without printing raw codes", () => {
  const forbidden = { error: { code: "FORBIDDEN" } };
  assert.equal(readErrorCode(forbidden), "FORBIDDEN");
  assert.equal(humanActionError(403, forbidden, "create-order"), "This account cannot create an order for that outlet.");
  assert.equal(humanActionError(403, { error: { code: "authorization_failure" } }, "planning"), "This account cannot run planning.");
  assert.equal(humanActionError(409, { error: { code: "lifecycle_conflict" } }, "dispatch"), "This trip cannot be dispatched yet. Nothing was changed.");
  assert.equal(humanActionError(409, { error: { code: "invalid_transition" } }, "outcome"), "This stop already has a delivery outcome.");
  assert.equal(humanActionError(0, null, "receipt"), "The server could not be reached. Nothing was changed.");
  assert.equal(humanActionError(400, { error: { code: "invalid_input" } }, "create-order").includes("FORBIDDEN"), false);
  assert.equal(humanActionError(500, { error: { code: "dispatch_failed" } }, "dispatch").includes("dispatch_failed"), false);
});

test("receipt guidance distinguishes delivered, confirmed, and earlier statuses", () => {
  assert.deepEqual(receiptGuidance("DELIVERED"), { kind: "ready" });
  assert.equal(receiptGuidance("RECEIPT_CONFIRMED").kind, "done");
  const waiting = receiptGuidance("SUBMITTED");
  assert.equal(waiting.kind, "waiting");
  if (waiting.kind === "waiting") assert.match(waiting.message, /Submitted/);
  assert.equal(loaderVerifiedMessage.includes("Dispatcher can dispatch"), true);
  assert.equal(offlineSavedMessage.includes("server has not confirmed"), true);
});
