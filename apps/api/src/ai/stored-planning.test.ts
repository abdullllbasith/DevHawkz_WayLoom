import assert from "node:assert/strict";
import test from "node:test";

import type { StoredDeferral } from "../domain/deferral.js";
import type { StoredTrip } from "../domain/trip.js";
import { planningResultFromStored, storedPlanningSummary } from "./stored-planning.js";

const orderId = "55555555-5555-4555-8555-555555555555";
const servedId = "66666666-6666-4666-8666-666666666666";

test("a stored plan keeps the served order and a uniquely mapped deferral reason", () => {
  const built = planningResultFromStored({
    operationalDate: "2026-06-02",
    trips: [trip([servedId])],
    deferrals: [deferral(orderId, "DEPOT_MISMATCH")],
    deliveryIdByOrderId: new Map([[orderId, "ORD-100"]]),
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.deepEqual(built.result.trips[0]?.orderIds, [servedId]);
  assert.equal(built.result.unallocated[0]?.constraint, "depot_compatibility");
  assert.equal(built.result.unallocated[0]?.deferralReason, "DEPOT_MISMATCH");
  assert.equal(built.result.trips[0]?.fuelUsedL, null);
});

test("a capacity deferral is not given a guessed constraint", () => {
  const input = {
    operationalDate: "2026-06-02",
    trips: [trip([servedId])],
    deferrals: [deferral(orderId, "NO_CAPACITY")],
    deliveryIdByOrderId: new Map([[orderId, "ORD-100"]]),
  };
  const built = planningResultFromStored(input);
  assert.equal(built.ok, false);
  if (built.ok) return;
  assert.equal(built.summary.includes("weight_capacity"), false);
  assert.equal(built.summary.includes("volume_capacity"), false);
  assert.equal(built.summary, storedPlanningSummary(input));
  assert.match(built.summary, /ORD-100 NO_CAPACITY/);
});

function trip(orderIds: string[]): StoredTrip {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    routeId: null,
    operationalDate: "2026-06-02",
    vehicleId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    depot: "Peliyagoda",
    tripNumber: 1,
    status: "PLANNED",
    stops: orderIds.map((orderId, sequence) => ({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${String(sequence + 1)}`,
      tripId: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      orderId,
      sequence,
      plannedArrival: null,
    })),
  };
}

function deferral(id: string, reason: StoredDeferral["reason"]): StoredDeferral {
  return { id: "dddddddd-dddd-4ddd-8ddd-ddddddddddd1", orderId: id, reason, reportedAt: new Date("2026-06-02T08:00:00.000Z") };
}
