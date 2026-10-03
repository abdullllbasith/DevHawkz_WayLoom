import assert from "node:assert/strict";
import test from "node:test";

import {
  countOrdersByCategory,
  dashboardAlerts,
  dashboardKpis,
  filterOrders,
  planningDateFromOrders,
  planningSummary,
  readOrders,
  readPlanning,
  type DashboardOrder,
} from "./dispatcher-dashboard.ts";

const orders: DashboardOrder[] = [
  { id: "1", orderId: "SEED-1", outlet: "OUT001", brand: "Fresh", items: 4, weightKg: "10", deliveryWindow: "—", priority: "—", status: "SUBMITTED" },
  { id: "2", orderId: "SEED-2", outlet: "OUT002", brand: "Tech", items: 2, weightKg: "8", deliveryWindow: "—", priority: "—", status: "CONFIRMED" },
];

test("order category filtering uses brand and does not invent a high-risk set", () => {
  assert.equal(filterOrders(orders, "Fresh", "").length, 1);
  assert.equal(filterOrders(orders, "High Risk", "").length, 0);
  assert.equal(filterOrders(orders, "All", "out002")[0]?.orderId, "SEED-2");
});

test("counts by category match brand and leave high risk at zero", () => {
  const counts = countOrdersByCategory(orders);
  assert.equal(counts.All, 2);
  assert.equal(counts.Fresh, 1);
  assert.equal(counts.Tech, 1);
  assert.equal(counts["High Risk"], 0);
});

test("dashboard values come from order, planning, and exception counts", () => {
  const kpis = dashboardKpis({
    orders,
    trips: [{ id: "t1", vehicleId: "VEH001", tripNumber: 1, status: "PLANNED", stopCount: 1, depot: "COLOMBO" }],
    deferralCount: 1,
    exceptionCount: 2,
  });
  assert.equal(kpis.find((kpi) => kpi.id === "orders")?.value, "2");
  assert.equal(kpis.find((kpi) => kpi.id === "items")?.value, "6");
  assert.equal(kpis.find((kpi) => kpi.id === "vehicles")?.value, "1");
  assert.equal(kpis.find((kpi) => kpi.id === "target")?.value, "—");
  assert.equal(kpis.find((kpi) => kpi.id === "risk")?.value, "2");
  assert.deepEqual(
    dashboardAlerts({ deferralCount: 1, exceptionCount: 2 }).map((alert) => alert.text),
    ["1 deferred order in the planning result", "2 open exceptions"],
  );
  assert.equal(planningSummary({ trips: [], deferralCount: 0 }).fuelReduction, "—");
  assert.equal(planningSummary({ trips: [], deferralCount: 0 }).estimatedOnTime, "—");
});

test("planning date follows the latest order date and readers ignore malformed payloads", () => {
  assert.equal(planningDateFromOrders([{ orderDate: "2026-06-01" }, { orderDate: "2026-06-02" }]), "2026-06-02");
  assert.equal(planningDateFromOrders([]), null);
  const read = readOrders([
    { id: "1", deliveryId: "D1", orderDate: "2026-06-02", outletCode: "OUT001", brand: "Fresh", status: "SUBMITTED", orderUnits: 3, orderWeightKg: "1.5" },
    { id: 4 },
  ]);
  assert.equal(read.orders.length, 1);
  assert.equal(read.orders[0]?.priority, "—");
  const planning = readPlanning({
    operationalDate: "2026-06-02",
    trips: [{ id: "t1", vehicleId: "VEH001", tripNumber: 1, status: "PLANNED", depot: "COLOMBO", stops: [{ id: "s1" }] }],
    deferrals: [{ id: "d1" }],
  });
  assert.equal(planning.trips[0]?.stopCount, 1);
  assert.equal(planning.deferralCount, 1);
});
