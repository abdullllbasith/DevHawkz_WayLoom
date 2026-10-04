import assert from "node:assert/strict";
import test from "node:test";

import {
  displayRouteId,
  exportRoutesCsv,
  filterRoutes,
  routeColor,
  routesKpis,
} from "./dispatcher-routes.ts";
import type { PlanTrip } from "./dispatcher-planning.ts";

const mockTrips: PlanTrip[] = [
  {
    id: "trip-1",
    vehicleId: "VEH001",
    depot: "Peliyagoda",
    tripNumber: 1,
    status: "CONFIRMED",
    routeId: "RTE-001",
    stops: [
      { id: "s-1", orderId: "ord-1", sequence: 1, plannedArrival: "06:15" },
      { id: "s-2", orderId: "ord-2", sequence: 2, plannedArrival: "07:30" },
    ],
  },
  {
    id: "trip-2",
    vehicleId: "VEH002",
    depot: "Peliyagoda",
    tripNumber: 2,
    status: "PLANNED",
    routeId: null,
    stops: [{ id: "s-3", orderId: "ord-3", sequence: 1, plannedArrival: null }],
  },
];

test("displayRouteId prefers assigned routeId and formats fallback", () => {
  assert.equal(displayRouteId(mockTrips[0]!), "RTE-001");
  assert.equal(displayRouteId(mockTrips[1]!), "RTE-002");
  assert.equal(
    displayRouteId({ ...mockTrips[1]!, routeId: "0e18a809-55ee-413f-b5ba-2b1d9d2267ea" }),
    "RTE-002",
  );
});

test("routesKpis counts routes from real data and leaves unprovided metrics as dash", () => {
  const kpis = routesKpis(mockTrips);
  assert.equal(kpis.length, 5);
  assert.equal(kpis[0]?.label, "Total Routes");
  assert.equal(kpis[0]?.value, "2");
  assert.equal(kpis[0]?.subtitle, "1 Confirmed • 1 Planned");

  assert.equal(kpis[1]?.label, "Total Distance");
  assert.equal(kpis[1]?.value, "—");

  assert.equal(kpis[2]?.label, "Estimated Time");
  assert.equal(kpis[2]?.value, "—");

  assert.equal(kpis[3]?.label, "Estimated Fuel");
  assert.equal(kpis[3]?.value, "—");

  assert.equal(kpis[4]?.label, "CO₂ Reduction");
  assert.equal(kpis[4]?.value, "—");
});

test("filterRoutes filters by tab and search query", () => {
  const all = filterRoutes(mockTrips, { tab: "All", query: "" });
  assert.equal(all.length, 2);

  const confirmed = filterRoutes(mockTrips, { tab: "Confirmed", query: "" });
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0]?.id, "trip-1");

  const planned = filterRoutes(mockTrips, { tab: "Planned", query: "" });
  assert.equal(planned.length, 1);
  assert.equal(planned[0]?.id, "trip-2");

  const searched = filterRoutes(mockTrips, { tab: "All", query: "veh002" });
  assert.equal(searched.length, 1);
  assert.equal(searched[0]?.vehicleId, "VEH002");
});

test("routeColor provides deterministic distinct colors", () => {
  assert.equal(routeColor(0), "#2563eb");
  assert.equal(routeColor(1), "#059669");
  assert.equal(routeColor(2), "#ea580c");
});

test("exportRoutesCsv outputs formatted CSV with authoritative data", () => {
  const csv = exportRoutesCsv(mockTrips);
  assert.match(csv, /"Route ID","Vehicle ID","Depot","Trip Number","Stops Count","Status"/);
  assert.match(csv, /"RTE-001","VEH001","Peliyagoda","1","2","CONFIRMED"/);
  assert.match(csv, /"RTE-002","VEH002","Peliyagoda","2","1","PLANNED"/);
});
