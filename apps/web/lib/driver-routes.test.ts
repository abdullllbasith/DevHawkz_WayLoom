import assert from "node:assert/strict";
import test from "node:test";

import { displayRouteIdentity, readDriverRoutes } from "./driver-routes.ts";

test("driver routes keep server order and do not invent distance", () => {
  const routes = readDriverRoutes([
    {
      id: "trip-1",
      routeId: null,
      operationalDate: "2026-06-02",
      vehicleId: "vehicle-1",
      depot: "Peliyagoda",
      tripNumber: 1,
      status: "CONFIRMED",
      stops: [
        { id: "b", tripId: "trip-1", orderId: "order-b", sequence: 1, plannedArrival: null },
        { id: "a", tripId: "trip-1", orderId: "order-a", sequence: 0, plannedArrival: "05:00" },
      ],
    },
  ]);
  assert.equal(routes?.[0]?.stops[0]?.orderId, "order-a");
  assert.equal(routes?.[0]?.stops.length, 2);
  assert.equal(displayRouteIdentity(routes![0]!), "RTE-001");
  assert.equal(JSON.stringify(routes).includes("km"), false);
});

test("a malformed route payload is not an empty assignment", () => {
  assert.equal(readDriverRoutes({ trips: [] }), null);
  assert.equal(readDriverRoutes([{ id: "trip-1", status: "PLANNED" }]), null);
});
