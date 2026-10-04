import assert from "node:assert/strict";
import test from "node:test";

import { explainInsight } from "./insight.js";
import { AI_CONTRACT_VERSION } from "./input.js";
import type { AiProvider } from "./provider.js";

const settings = { timeoutMs: 1000, maxResponseChars: 4000 };

test("an insight keeps the supplied metric, value, and period", async () => {
  const provider: AiProvider = {
    id: "facts",
    complete: () => Promise.resolve({
      contractVersion: AI_CONTRACT_VERSION,
      kind: "insight",
      use: "operational_insight",
      text: "Decision support from 2026-06-01 to 2026-06-02: deferred_orders is 2.",
      factRefs: [],
      sourceFacts: ["deferred_orders"],
      advisory: true,
    }),
  };
  const insight = await explainInsight({
    periodStart: "2026-06-01",
    periodEnd: "2026-06-02",
    metrics: [{ metric: "deferred_orders", value: 2 }],
    capturedAt: "2026-06-02T10:00:00.000Z",
    provider,
    settings,
  });
  assert.equal(insight.ok, true);
  if (!insight.ok) {
    return;
  }
  assert.equal(insight.decisionSupport, true);
  assert.equal(insight.stateChanged, false);
});

test("empty measurements and an invented metric stay controlled", async () => {
  const empty = await explainInsight({
    periodStart: "2026-06-01",
    periodEnd: "2026-06-02",
    metrics: [],
    capturedAt: "2026-06-02T10:00:00.000Z",
    provider: { id: "unused", complete: () => Promise.resolve(null) },
    settings,
  });
  assert.equal(empty.ok, false);
  if (!empty.ok) {
    assert.equal(empty.code, "insufficient_context");
    assert.equal(empty.stateChanged, false);
  }
  const invented = await explainInsight({
    periodStart: "2026-06-01",
    periodEnd: "2026-06-02",
    metrics: [{ metric: "deferred_orders", value: 2 }],
    capturedAt: "2026-06-02T10:00:00.000Z",
    provider: {
      id: "invented",
      complete: () => Promise.resolve({
        contractVersion: AI_CONTRACT_VERSION,
        kind: "insight",
        use: "operational_insight",
        text: "Decision support from 2026-06-01 to 2026-06-02: deferred_orders is 9.",
        factRefs: [],
        sourceFacts: ["deferred_orders"],
        advisory: true,
      }),
    },
    settings,
  });
  assert.equal(invented.ok, false);
  if (!invented.ok) {
    assert.match(invented.fallbackText, /deferred_orders=2/);
  }
});
