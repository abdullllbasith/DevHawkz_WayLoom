import assert from "node:assert/strict";
import test from "node:test";

import { dispatcherNotices, driverNotices, loaderNotices, storeNotices, unreadNotices } from "./notifications.ts";

const submitted = {
  id: "order-1",
  deliveryId: "SEED-2026-06-02-OUT001",
  outletCode: "OUT001",
  status: "SUBMITTED",
  submittedAt: "2026-06-01T08:00:00.000Z",
};

test("dispatcher notices include a new store order and skip orders already moving", () => {
  const notices = dispatcherNotices(
    [submitted, { ...submitted, id: "order-2", deliveryId: "VEH-ORDER", status: "CONFIRMED" }],
    [{ id: "exc-1", category: "loading shortfall" }],
  );
  assert.equal(notices[0]?.title, "New order 06-02-OUT001");
  assert.equal(notices[0]?.detail, "OUT001 · Submitted");
  assert.equal(notices[0]?.href, "/dispatcher/orders");
  assert.equal(notices.some((item) => item.id === "order:order-2"), false);
  assert.equal(notices[1]?.href, "/dispatcher/exceptions");
});

test("store notices follow later order updates and ignore the order the store just submitted", () => {
  const notices = storeNotices([
    submitted,
    { ...submitted, id: "order-3", status: "DELIVERED" },
  ]);
  assert.deepEqual(notices.map((item) => item.id), ["order:order-3:DELIVERED"]);
  assert.equal(notices[0]?.detail, "OUT001 · Delivered");
});

test("loader and driver notices use the records those roles can read", () => {
  assert.equal(loaderNotices([{ tripStopId: "stop-1", deliveryId: "D1", outletCode: "OUT001", vehicleId: "VEH035" }])[0]?.title, "Stop ready to load");
  assert.equal(
    driverNotices([{ id: "trip-1", tripNumber: 1, routeId: null, vehicleId: "VEH035", status: "CONFIRMED" }])[0]?.title,
    "Route RTE-001",
  );
});

test("unread notices are the ones not yet opened", () => {
  const notices = dispatcherNotices([submitted], []);
  assert.equal(unreadNotices(notices, new Set()).length, 1);
  assert.equal(unreadNotices(notices, new Set(["order:order-1"])).length, 0);
});
