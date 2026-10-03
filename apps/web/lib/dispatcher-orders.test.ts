import assert from "node:assert/strict";
import test from "node:test";

import { countOrdersTabs, exportOrdersCsv, filterOrdersList, readOrderList, type DispatcherOrder } from "./dispatcher-orders.ts";

const orders: DispatcherOrder[] = [
  { id: "1", orderId: "D1", outlet: "OUT001", district: "Kandy", depot: "COLOMBO", brand: "Fresh", items: 4, weightKg: "10", volumeM3: "1", temperature: "chilled", status: "SUBMITTED", orderDate: "2026-06-02", submittedAt: "2026-06-01T08:00:00.000Z" },
  { id: "2", orderId: "D2", outlet: "OUT002", district: "Jaffna", depot: "COLOMBO", brand: "Tech", items: 2, weightKg: "8", volumeM3: "1", temperature: "ambient", status: "CONFIRMED", orderDate: "2026-06-02", submittedAt: null },
];

test("filterOrdersList filters by brand and search", () => {
  assert.equal(filterOrdersList(orders, { tab: "Fresh" }).length, 1);
  assert.equal(filterOrdersList(orders, { tab: "High Risk" }).length, 0);
  assert.equal(filterOrdersList(orders, { search: "kandy" })[0]?.orderId, "D1");
});

test("countOrdersTabs does not invent a high-risk total", () => {
  const counts = countOrdersTabs(orders);
  assert.equal(counts.All, 2);
  assert.equal(counts.Fresh, 1);
  assert.equal(counts.Tech, 1);
  assert.equal(counts["High Risk"], 0);
});

test("readOrderList and export use order API fields", () => {
  const read = readOrderList([{ id: "1", deliveryId: "D1", outletCode: "OUT001", district: "Kandy", depot: "COLOMBO", brand: "Fresh", orderUnits: 3, orderWeightKg: "1", orderVolumeM3: "1", tempRequirement: "chilled", status: "SUBMITTED", orderDate: "2026-06-02", submittedAt: null }]);
  assert.equal(read[0]?.orderId, "D1");
  const csv = exportOrdersCsv(read);
  assert.equal(csv.includes("Delivery Window"), false);
  assert.equal(csv.includes("D1"), true);
});
