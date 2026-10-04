import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PlanningResult } from "@wayloom/planning";

import { memoryAudit } from "./audit.js";
import { explainPlanning } from "./planning-explanation.js";
import { loadAiSettings, selectAiProvider } from "./provider.js";

const orderId = "55555555-5555-4555-8555-555555555555";

test("core modules do not import decision support", () => {
  for (const file of ["planning-run.ts", "order.ts", "order-transition.ts", "loading.ts", "delivery.ts", "receipt.ts", "sync-batch.ts"]) {
    const source = readFileSync(new URL(`../../src/domain/${file}`, import.meta.url), "utf8");
    assert.equal(source.includes("/ai/"), false, file);
  }
});

test("disabled decision support leaves the planning result unchanged", async () => {
  const settings = loadAiSettings({});
  assert.equal(settings.enabled, false);
  const result: PlanningResult = {
    contractVersion: "1",
    status: "result",
    operationalDate: "2026-06-02",
    trips: [],
    unallocated: [{ orderId, deliveryId: "SEED-2026-06-02-OUT001", constraint: "weight_capacity", deferralReason: "NO_CAPACITY" }],
    solverStatus: null,
  };
  let calls = 0;
  const explained = await explainPlanning({
    result,
    capturedAt: "2026-06-02T08:00:00.000Z",
    provider: selectAiProvider(settings),
    settings,
    actorUserId: "11111111-1111-4111-8111-111111111111",
    occurredAt: new Date("2026-06-02T08:00:00.000Z"),
    audit: memoryAudit().writer,
  });
  const counted = await explainPlanning({
    result,
    capturedAt: "2026-06-02T08:00:00.000Z",
    provider: {
      id: "once",
      complete() {
        calls += 1;
        return Promise.reject(new Error("down"));
      },
    },
    settings: { timeoutMs: 1000, maxResponseChars: 4000 },
    actorUserId: "11111111-1111-4111-8111-111111111111",
    occurredAt: new Date("2026-06-02T08:00:00.000Z"),
    audit: memoryAudit().writer,
  });
  assert.equal(explained.ok, false);
  assert.equal(counted.ok, false);
  assert.equal(calls, 1);
  assert.equal(result.unallocated[0]?.deferralReason, "NO_CAPACITY");
  if (!explained.ok) {
    assert.match(explained.fallbackText, /NO_CAPACITY/);
  }
});
