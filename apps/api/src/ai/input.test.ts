import assert from "node:assert/strict";
import test from "node:test";

import { AI_CONTRACT_VERSION, parseAiInput } from "./input.js";

const capturedAt = "2026-06-02T08:00:00.000Z";
const orderId = "55555555-5555-4555-8555-555555555555";
const exceptionId = "77777777-7777-4777-8777-777777777777";

test("the planning explanation input keeps only approved planning facts", () => {
  const parsed = parseAiInput({
    contractVersion: AI_CONTRACT_VERSION,
    capturedAt,
    use: "planning_explanation",
    operationalDate: "2026-06-02",
    served: [{ orderId, vehicleId: "VEH035", tripNumber: 1 }],
    deferred: [{ orderId, deliveryId: "SEED-2026-06-02-OUT001", constraint: "weight_capacity", deferralReason: "NO_CAPACITY" }],
  });
  assert.equal(parsed.ok, true);
  if (!parsed.ok || !("served" in parsed.value)) {
    return;
  }
  assert.equal(parsed.value.served[0]?.vehicleId, "VEH035");
  assert.equal(parsed.value.deferred[0]?.deferralReason, "NO_CAPACITY");
});

test("an unknown field, a secret, or an unapproved reason is rejected", () => {
  const base = {
    contractVersion: AI_CONTRACT_VERSION,
    capturedAt,
    use: "exception_explanation",
    exceptionId,
    category: "shortfall",
    details: null,
    occurredAt: capturedAt,
  };
  assert.equal(parseAiInput({ ...base, token: "session" }).ok, false);
  assert.equal(parseAiInput({ ...base, details: "password=hidden" }).ok, false);
  assert.equal(parseAiInput({
    contractVersion: AI_CONTRACT_VERSION,
    capturedAt,
    use: "planning_explanation",
    operationalDate: "2026-06-02",
    served: [],
    deferred: [{ orderId, deliveryId: "ORD-1", constraint: "weight_capacity", deferralReason: "FUEL_QUOTA" }],
  }).ok, false);
});

test("insight input accepts approved counts and rejects an unknown metric", () => {
  assert.equal(parseAiInput({
    contractVersion: AI_CONTRACT_VERSION,
    capturedAt,
    use: "operational_insight",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-02",
    metrics: [{ metric: "deferred_orders", value: 2 }],
  }).ok, true);
  assert.equal(parseAiInput({
    contractVersion: AI_CONTRACT_VERSION,
    capturedAt,
    use: "operational_insight",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-02",
    metrics: [{ metric: "utilization", value: 2 }],
  }).ok, false);
});
