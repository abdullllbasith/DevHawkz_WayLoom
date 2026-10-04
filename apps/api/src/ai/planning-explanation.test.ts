import assert from "node:assert/strict";
import test from "node:test";

import type { PlanningResult } from "@wayloom/planning";

import { AI_CONTRACT_VERSION } from "./input.js";
import { explainPlanning } from "./planning-explanation.js";
import type { AiProvider } from "./provider.js";

const orderId = "55555555-5555-4555-8555-555555555555";
const settings = { timeoutMs: 1000, maxResponseChars: 4000 };

function result(extra: Partial<PlanningResult> = {}): PlanningResult {
  return {
    contractVersion: "1",
    status: "result",
    operationalDate: "2026-06-02",
    trips: [],
    unallocated: [{
      orderId,
      deliveryId: "SEED-2026-06-02-OUT001",
      constraint: "weight_capacity",
      deferralReason: "NO_CAPACITY",
    }],
    solverStatus: null,
    ...extra,
  };
}

test("a planning explanation repeats the supplied reason and does not change allocation", async () => {
  const provider: AiProvider = {
    id: "facts",
    complete() {
      return Promise.resolve({
        contractVersion: AI_CONTRACT_VERSION,
        kind: "explanation",
        use: "planning_explanation",
        text: "Deferred for NO_CAPACITY.",
        factRefs: [orderId],
        sourceFacts: ["NO_CAPACITY"],
        advisory: true,
      });
    },
  };
  const explained = await explainPlanning({ result: result(), capturedAt: "2026-06-02T08:00:00.000Z", provider, settings });
  assert.equal(explained.ok, true);
  assert.equal(explained.allocationChanged, false);
  if (!explained.ok) {
    return;
  }
  assert.match(explained.advisory.text, /NO_CAPACITY/);
});

test("an invented reason falls back to the planning result", async () => {
  const provider: AiProvider = {
    id: "invented",
    complete() {
      return Promise.resolve({
        contractVersion: AI_CONTRACT_VERSION,
        kind: "explanation",
        use: "planning_explanation",
        text: "Deferred for FUEL_QUOTA.",
        factRefs: [orderId],
        sourceFacts: ["FUEL_QUOTA"],
        advisory: true,
      });
    },
  };
  const explained = await explainPlanning({ result: result(), capturedAt: "2026-06-02T08:00:00.000Z", provider, settings });
  assert.equal(explained.ok, false);
  if (explained.ok) {
    return;
  }
  assert.equal(explained.code, "invalid_output");
  assert.match(explained.fallbackText, /NO_CAPACITY/);
  assert.equal(explained.fallbackText.includes("FUEL_QUOTA"), false);
});

test("an empty planning result is insufficient context", async () => {
  const explained = await explainPlanning({
    result: result({ unallocated: [] }),
    capturedAt: "2026-06-02T08:00:00.000Z",
    provider: { id: "unused", complete: () => Promise.resolve(null) },
    settings,
  });
  assert.equal(explained.ok, false);
  if (!explained.ok) {
    assert.equal(explained.code, "insufficient_context");
  }
});
