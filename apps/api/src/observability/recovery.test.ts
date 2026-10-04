import assert from "node:assert/strict";
import test from "node:test";

import { loadAiSettings } from "../ai/provider.js";
import { emitDiagnostic, planningDiagnostic } from "./diagnostics.js";

test("a logging failure and an AI outage do not invent a planning result", () => {
  const original = console.info;
  console.info = () => {
    throw new Error("log down");
  };
  try {
    emitDiagnostic(planningDiagnostic({
      operationalDate: "2026-06-02",
      startedAt: "2026-06-02T08:00:00.000Z",
      finishedAt: "2026-06-02T08:00:01.000Z",
      outcome: "service_failure",
      eligible: 1,
      allocated: 0,
      deferred: 0,
    }));
  } finally {
    console.info = original;
  }
  assert.equal(loadAiSettings({}).enabled, false);
  const diagnostic = planningDiagnostic({
    operationalDate: "2026-06-02",
    startedAt: "2026-06-02T08:00:00.000Z",
    finishedAt: "2026-06-02T08:00:01.000Z",
    outcome: "service_failure",
    eligible: 1,
    allocated: 0,
    deferred: 0,
  });
  assert.equal(diagnostic.allocated, 0);
  assert.equal(diagnostic.deferred, 0);
  assert.equal(diagnostic.outcome, "service_failure");
});
