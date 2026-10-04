import assert from "node:assert/strict";
import test from "node:test";

import type { PlanningResult } from "@wayloom/planning";

import { planningDiagnostic, syncDiagnostic } from "./diagnostics.js";

test("planning diagnostics count the supplied result and do not change it", () => {
  const result: PlanningResult = {
    contractVersion: "1",
    status: "result",
    operationalDate: "2026-06-02",
    trips: [{ vehicleId: "VEH035", tripNumber: 1, orderIds: ["55555555-5555-4555-8555-555555555555"], stops: [], tripMinutes: "10", tripDistanceKm: null, fuelUsedL: null, projectedWeeklyFuelL: null }],
    unallocated: [{ orderId: "66666666-6666-4666-8666-666666666666", deliveryId: "ORD-2", constraint: "weight_capacity", deferralReason: "NO_CAPACITY" }],
    solverStatus: null,
  };
  const before = JSON.stringify(result);
  const diagnostic = planningDiagnostic({
    operationalDate: result.operationalDate,
    startedAt: "2026-06-02T08:00:00.000Z",
    finishedAt: "2026-06-02T08:00:01.000Z",
    outcome: "success",
    eligible: 2,
    allocated: result.trips.reduce((sum, trip) => sum + trip.orderIds.length, 0),
    deferred: result.unallocated.length,
  });
  assert.equal(JSON.stringify(result), before);
  assert.equal(diagnostic.allocated, 1);
  assert.equal(diagnostic.deferred, 1);
  assert.equal(diagnostic.outcome, "success");
});

test("sync diagnostics separate duplicates from rejected events", () => {
  const diagnostic = syncDiagnostic([
    { clientEventId: "event-1", result: "applied" },
    { clientEventId: "event-1", result: "already applied" },
    { clientEventId: "event-2", result: "conflict" },
    { clientEventId: "event-3", result: "temporary server failure" },
  ]);
  assert.equal(diagnostic.accepted, 1);
  assert.equal(diagnostic.duplicate, 1);
  assert.equal(diagnostic.rejected, 1);
  assert.equal(diagnostic.retryable, 1);
  assert.deepEqual(diagnostic.clientEventIds, ["event-1", "event-1", "event-2", "event-3"]);
});
