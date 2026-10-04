import assert from "node:assert/strict";
import test from "node:test";

import { awaitingReceiptOrders, pendingOrders, readStoreOrders, receivedOrders, storeStatusCounts } from "./store-dashboard.ts";

test("store dashboard reads server order status and does not invent metrics", () => {
  const orders = readStoreOrders([
    {
      id: "order-1",
      deliveryId: "SEED-2026-06-02-OUT001",
      orderDate: "2026-06-02",
      outletId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      outletCode: "OUT001",
      brand: "Fresh",
      district: "Colombo",
      depot: "Peliyagoda",
      status: "PLANNED_ALLOCATED",
      orderUnits: 10,
      tempRequirement: "chilled",
    },
  ]);
  assert.equal(orders?.[0]?.status, "PLANNED_ALLOCATED");
  assert.deepEqual(storeStatusCounts(orders ?? []), [{ status: "PLANNED_ALLOCATED", count: 1 }]);
  assert.equal(readStoreOrders({ pending: 3 }), null);
  assert.deepEqual(readStoreOrders([]), []);
  const mixed = [
    { ...orders![0]!, id: "order-1", status: "DELIVERED" },
    { ...orders![0]!, id: "order-2", status: "RECEIPT_CONFIRMED" },
    { ...orders![0]!, id: "order-3", status: "SUBMITTED" },
  ];
  assert.deepEqual(pendingOrders(mixed).map((order) => order.id), ["order-1", "order-3"]);
  assert.deepEqual(receivedOrders(mixed).map((order) => order.id), ["order-2"]);
  assert.deepEqual(awaitingReceiptOrders(mixed).map((order) => order.id), ["order-1"]);
});
