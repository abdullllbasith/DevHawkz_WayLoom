import assert from "node:assert/strict";
import test from "node:test";

import type { PlanningResult } from "@wayloom/planning";

import { aiAuditDetails, memoryAudit, recordAiAudit } from "./audit.js";
import { AI_CONTRACT_VERSION } from "./input.js";
import { explainPlanning } from "./planning-explanation.js";

const orderId = "55555555-5555-4555-8555-555555555555";
const actorUserId = "11111111-1111-4111-8111-111111111111";

test("an accepted explanation is audited separately from a human decision", async () => {
  const audit = memoryAudit();
  const result: PlanningResult = {
    contractVersion: "1",
    status: "result",
    operationalDate: "2026-06-02",
    trips: [],
    unallocated: [{ orderId, deliveryId: "SEED-2026-06-02-OUT001", constraint: "weight_capacity", deferralReason: "NO_CAPACITY" }],
    solverStatus: null,
  };
  const explained = await explainPlanning({
    result,
    capturedAt: "2026-06-02T08:00:00.000Z",
    provider: {
      id: "deterministic",
      complete: () => Promise.resolve({
        contractVersion: AI_CONTRACT_VERSION,
        kind: "explanation",
        use: "planning_explanation",
        text: "Deferred for NO_CAPACITY.",
        factRefs: [orderId],
        sourceFacts: ["NO_CAPACITY"],
        advisory: true,
      }),
    },
    settings: { timeoutMs: 1000, maxResponseChars: 4000 },
    actorUserId,
    occurredAt: new Date("2026-06-02T08:00:00.000Z"),
    audit: audit.writer,
  });
  assert.equal(explained.ok, true);
  assert.equal(audit.records[0]?.humanDecision, "not_recorded");
  assert.equal(audit.records[0]?.validation, "accepted");
  const stored = aiAuditDetails(audit.records[0]!);
  assert.equal(stored.action, "AI_ASSISTANCE");
  assert.equal(stored.details.includes("password"), false);
});

test("an audit failure does not report a successful recommendation", async () => {
  const explained = await explainPlanning({
    result: {
      contractVersion: "1",
      status: "result",
      operationalDate: "2026-06-02",
      trips: [],
      unallocated: [{ orderId, deliveryId: "SEED-2026-06-02-OUT001", constraint: "weight_capacity", deferralReason: "NO_CAPACITY" }],
      solverStatus: null,
    },
    capturedAt: "2026-06-02T08:00:00.000Z",
    provider: {
      id: "deterministic",
      complete: () => Promise.resolve({
        contractVersion: AI_CONTRACT_VERSION,
        kind: "explanation",
        use: "planning_explanation",
        text: "Deferred for NO_CAPACITY.",
        factRefs: [orderId],
        sourceFacts: ["NO_CAPACITY"],
        advisory: true,
      }),
    },
    settings: { timeoutMs: 1000, maxResponseChars: 4000 },
    actorUserId,
    occurredAt: new Date("2026-06-02T08:00:00.000Z"),
    audit: { append: () => Promise.reject(new Error("audit down")) },
  });
  assert.equal(explained.ok, false);
  if (!explained.ok) {
    assert.equal(explained.code, "audit_failure");
    assert.equal(explained.allocationChanged, false);
  }
  assert.equal(await recordAiAudit(memoryAudit().writer, {
    actorUserId,
    occurredAt: new Date("2026-06-02T08:00:00.000Z"),
    use: "planning_explanation",
    providerId: "deterministic",
    contractVersion: "1",
    validation: "rejected",
    summary: "password=hidden",
    humanDecision: "not_recorded",
  }), false);
});
