import assert from "node:assert/strict";
import test from "node:test";

import { filterTrips, planningCounts, preserveDeferralReason, readPlanningResult } from "./dispatcher-planning.ts";

test("planning result keeps trip identity and does not invent fuel or distance", () => {
  const view = readPlanningResult({
    operationalDate: "2026-06-02",
    trips: [{ id: "t1", vehicleId: "VEH001", depot: "COLOMBO", tripNumber: 1, status: "PLANNED", routeId: null, stops: [{ id: "s1", orderId: "o1", sequence: 1, plannedArrival: null }] }],
    deferrals: [{ id: "d1", orderId: "o2", reason: "FUEL_QUOTA", reportedAt: "2026-06-02T00:00:00.000Z" }],
  });
  assert.equal(view.trips[0]?.vehicleId, "VEH001");
  assert.equal(view.deferrals[0]?.reason, "FUEL_QUOTA");
  const counts = planningCounts(view);
  assert.equal(counts.vehicles, "1");
  assert.equal(counts.scheduled, "1");
  assert.equal(counts.fuel, "—");
  assert.equal(counts.onTime, "—");
  assert.equal(filterTrips(view.trips, "veh001").length, 1);
  assert.equal(preserveDeferralReason("NO_CAPACITY"), "NO_CAPACITY");
});
