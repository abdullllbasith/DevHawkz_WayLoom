import assert from "node:assert/strict";
import test from "node:test";

import {
  countOrdersByCategory,
  defaultOrders,
  filterOrders,
} from "./dispatcher-dashboard.ts";

test("order category filtering returns expected items", () => {
  const all = filterOrders(defaultOrders, "All", "");
  assert.equal(all.length, defaultOrders.length);

  const fresh = filterOrders(defaultOrders, "Fresh", "");
  assert.equal(fresh.length, 2);
  assert.ok(fresh.every((o) => o.category === "Fresh"));

  const highRisk = filterOrders(defaultOrders, "High Risk", "");
  assert.equal(highRisk.length, 3);
  assert.ok(highRisk.every((o) => o.priority === "High"));
});

test("order search query filters by id and outlet", () => {
  const searched = filterOrders(defaultOrders, "All", "kandy");
  assert.equal(searched.length, 1);
  assert.equal(searched[0]?.orderId, "ORD521");

  const byId = filterOrders(defaultOrders, "All", "ORD632");
  assert.equal(byId.length, 1);
  assert.equal(byId[0]?.outlet, "Elektronus - Jaffna");
});

test("counts by category matches orders array", () => {
  const counts = countOrdersByCategory(defaultOrders);
  assert.equal(counts.All, 7);
  assert.equal(counts.Fresh, 2);
  assert.equal(counts.Style, 1);
  assert.equal(counts.Tech, 2);
  assert.equal(counts["High Risk"], 3);
});
