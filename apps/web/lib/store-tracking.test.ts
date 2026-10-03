import assert from "node:assert/strict";
import test from "node:test";

import { orderProgressLabel, unavailableTracking } from "./store-tracking.ts";

test("tracking distinguishes submitted, planned, delivered, receipt, and deferred states", () => {
  assert.equal(orderProgressLabel("SUBMITTED"), "submitted");
  assert.equal(orderProgressLabel("PLANNED_ALLOCATED"), "planned or allocated");
  assert.equal(orderProgressLabel("DELIVERED"), "delivered");
  assert.equal(orderProgressLabel("RECEIPT_CONFIRMED"), "receipt confirmed");
  assert.equal(orderProgressLabel("DEFERRED"), "deferred");
  assert.equal(orderProgressLabel("LOADING"), "LOADING");
});

test("vehicle, route, and arrival stay unavailable when the order contract omits them", () => {
  assert.deepEqual(unavailableTracking, { vehicle: "—", route: "—", eta: "—" });
});
