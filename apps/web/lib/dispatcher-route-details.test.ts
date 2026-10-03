import assert from "node:assert/strict";
import test from "node:test";

import {
  computeTripOrderTotals,
  readTripDetail,
  tripDetailKpis,
  type TripDetail,
} from "./dispatcher-route-details.ts";
import type { DispatcherOrder } from "./dispatcher-orders.ts";

const rawTrip = {
  id: "trip-101",
  routeId: "RTE-101",
  operationalDate: "2026-06-02",
  vehicleId: "VEH001",
  depot: "Peliyagoda",
  tripNumber: 1,
  status: "CONFIRMED",
  stops: [
    { id: "s-2", tripId: "trip-101", orderId: "ord-2", sequence: 2, plannedArrival: "07:30" },
    { id: "s-1", tripId: "trip-101", orderId: "ord-1", sequence: 1, plannedArrival: "06:15" },
  ],
};

const mockOrders: DispatcherOrder[] = [
  {
    id: "ord-1",
    orderId: "DEL-001",
    outlet: "OUT-01",
    district: "Colombo",
    depot: "Peliyagoda",
    brand: "Fresh",
    items: 10,
    weightKg: "150.5",
    volumeM3: "1.2",
    temperature: "chilled",
    status: "CONFIRMED",
    orderDate: "2026-06-02",
    submittedAt: "2026-06-01T10:00:00Z",
  },
  {
    id: "ord-2",
    orderId: "DEL-002",
    outlet: "OUT-02",
    district: "Gampaha",
    depot: "Peliyagoda",
    brand: "Standard",
    items: 5,
    weightKg: "75.0",
    volumeM3: "0.6",
    temperature: "ambient",
    status: "CONFIRMED",
    orderDate: "2026-06-02",
    submittedAt: "2026-06-01T10:30:00Z",
  },
];

test("readTripDetail parses and sorts stop sequence", () => {
  const detail = readTripDetail(rawTrip);
  assert.ok(detail);
  assert.equal(detail.id, "trip-101");
  assert.equal(detail.routeId, "RTE-101");
  assert.equal(detail.status, "CONFIRMED");
  assert.equal(detail.stops.length, 2);
  // Authoritative sorting preserved (sequence 1 then 2)
  assert.equal(detail.stops[0]?.sequence, 1);
  assert.equal(detail.stops[0]?.orderId, "ord-1");
  assert.equal(detail.stops[1]?.sequence, 2);
  assert.equal(detail.stops[1]?.orderId, "ord-2");
});

test("readTripDetail returns null for invalid inputs", () => {
  assert.equal(readTripDetail(null), null);
  assert.equal(readTripDetail({}), null);
  assert.equal(readTripDetail({ id: "123" }), null);
});

test("computeTripOrderTotals computes weights and detects chilled orders", () => {
  const detail = readTripDetail(rawTrip)!;
  const map = new Map(mockOrders.map((o) => [o.id, o]));
  const totals = computeTripOrderTotals(detail.stops, map);

  assert.equal(totals.matchedOrders, 2);
  assert.equal(totals.totalUnits, 15);
  assert.equal(totals.totalWeightKg, 225.5);
  assert.equal(totals.totalVolumeM3, 1.8);
  assert.equal(totals.hasChilled, true);
});

test("tripDetailKpis formats KPIs without inventing distance or ETA", () => {
  const detail: TripDetail = {
    id: "trip-101",
    routeId: "RTE-101",
    operationalDate: "2026-06-02",
    vehicleId: "VEH001",
    depot: "Peliyagoda",
    tripNumber: 1,
    status: "CONFIRMED",
    stops: [],
  };
  const totals = {
    matchedOrders: 0,
    totalUnits: 0,
    totalWeightKg: 0,
    totalVolumeM3: 0,
    hasChilled: false,
  };
  const kpis = tripDetailKpis(detail, totals);

  assert.equal(kpis[0]?.label, "Route Status");
  assert.equal(kpis[0]?.value, "CONFIRMED");
  assert.equal(kpis[2]?.label, "Assigned Weight");
  assert.equal(kpis[2]?.value, "—");
  assert.equal(kpis[3]?.label, "Total Distance");
  assert.equal(kpis[3]?.value, "—");
  assert.equal(kpis[4]?.label, "Estimated Duration");
  assert.equal(kpis[4]?.value, "—");
});
