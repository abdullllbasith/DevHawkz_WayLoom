import assert from "node:assert/strict";
import test from "node:test";

import { validateAdvisory } from "./boundary.js";
import { AI_CONTRACT_VERSION } from "./input.js";

const context = {
  contractVersion: AI_CONTRACT_VERSION,
  capturedAt: "2026-06-02T08:00:00.000Z",
  operationalDate: "2026-06-02",
  served: [],
  deferred: [{
    orderId: "55555555-5555-4555-8555-555555555555",
    deliveryId: "SEED-2026-06-02-OUT001",
    constraint: "weight_capacity" as const,
    deferralReason: "NO_CAPACITY" as const,
  }],
};

test("malformed output fails validation without becoming state", () => {
  const rejected = validateAdvisory(context, { text: "POST /api/trips/1/dispatch", password: "hidden" }, "deterministic");
  assert.equal(rejected.ok, false);
  if (rejected.ok) {
    return;
  }
  assert.equal(rejected.validation.code, "invalid_output");
  assert.equal(rejected.validation.accepted, false);
  assert.equal(JSON.stringify(rejected.validation).includes("hidden"), false);
});

test("a grounded explanation is accepted once", () => {
  const accepted = validateAdvisory(context, {
    contractVersion: AI_CONTRACT_VERSION,
    kind: "explanation",
    use: "planning_explanation",
    text: "Deferred for NO_CAPACITY.",
    factRefs: ["55555555-5555-4555-8555-555555555555"],
    sourceFacts: ["NO_CAPACITY"],
    advisory: true,
  }, "deterministic");
  assert.equal(accepted.ok, true);
  if (!accepted.ok) {
    return;
  }
  assert.equal(accepted.validation.providerId, "deterministic");
});
