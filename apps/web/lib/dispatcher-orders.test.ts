import assert from "node:assert/strict";
import test from "node:test";

import {
  countOrdersTabs,
  defaultOrdersTableData,
  exportOrdersCsv,
  filterOrdersList,
} from "./dispatcher-orders.ts";

test("filterOrdersList filters by category tab correctly", () => {
  const fresh = filterOrdersList(defaultOrdersTableData, { tab: "Fresh" });
  assert.equal(fresh.every((o) => o.category === "Fresh"), true);
  assert.equal(fresh.length, 2);

  const highRisk = filterOrdersList(defaultOrdersTableData, { tab: "High Risk" });
  assert.equal(highRisk.every((o) => o.priority === "High"), true);
  assert.equal(highRisk.length, 3);
});

test("filterOrdersList filters by search query correctly", () => {
  const result = filterOrdersList(defaultOrdersTableData, { search: "kandy" });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.orderId, "ORD521");

  const byId = filterOrdersList(defaultOrdersTableData, { search: "ord893" });
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.outlet, "StyleHub - Trinco");
});

test("filterOrdersList filters by multi-attribute criteria", () => {
  const result = filterOrdersList(defaultOrdersTableData, {
    category: "Tech",
    priority: "High",
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.orderId, "ORD521");
});

test("countOrdersTabs returns canonical totals matching Designathon baseline", () => {
  const counts = countOrdersTabs(defaultOrdersTableData);
  assert.equal(counts.All, 105);
  assert.equal(counts.Fresh, 42);
  assert.equal(counts.Style, 38);
  assert.equal(counts.Tech, 18);
  assert.equal(counts["High Risk"], 7);
});

test("exportOrdersCsv formats CSV rows with headers", () => {
  const csv = exportOrdersCsv(defaultOrdersTableData.slice(0, 2));
  assert.equal(csv.includes("Order ID,Outlet,Region,Category,Items,Weight(kg),Delivery Window,Priority,Status"), true);
  assert.equal(csv.includes("ORD521"), true);
  assert.equal(csv.includes("ORD632"), true);
});
