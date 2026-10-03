import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmOrderOnServer,
  countOrdersTabs,
  exportOrdersCsv,
  filterOrdersList,
  readOrderList,
  type DispatcherOrder,
} from "./dispatcher-orders.ts";

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

test("confirmOrderOnServer successfully confirms a submitted order", async () => {
  const fakeFetch: typeof fetch = async (input, init) => {
    assert.equal(String(input), "/api/orders/1/confirm");
    assert.equal(init?.method, "POST");
    assert.equal((init?.headers as Record<string, string>)["x-wayloom-csrf"], "token-123");
    return new Response(
      JSON.stringify({
        id: "1",
        deliveryId: "D1",
        outletCode: "OUT001",
        district: "Kandy",
        depot: "COLOMBO",
        brand: "Fresh",
        orderUnits: 4,
        orderWeightKg: "10",
        orderVolumeM3: "1",
        tempRequirement: "chilled",
        status: "CONFIRMED",
        orderDate: "2026-06-02",
        submittedAt: "2026-06-01T08:00:00.000Z",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await confirmOrderOnServer({
    orderId: "1",
    csrfToken: "token-123",
    fetchFn: fakeFetch,
  });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.order.status, "CONFIRMED");
    assert.equal(result.order.orderId, "D1");
  }
});

test("confirmOrderOnServer handles 409 lifecycle conflict", async () => {
  const fakeFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ error: { code: "INVALID_STATE_TRANSITION" } }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
  };

  const result = await confirmOrderOnServer({
    orderId: "1",
    fetchFn: fakeFetch,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "lifecycle_conflict");
    assert.match(result.message, /SUBMITTED/);
  }
});

test("confirmOrderOnServer handles 403 authorization failure and CSRF failure", async () => {
  const authFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ error: { code: "FORBIDDEN" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  };

  const authResult = await confirmOrderOnServer({
    orderId: "1",
    fetchFn: authFetch,
  });
  assert.equal(authResult.ok, false);
  if (!authResult.ok) {
    assert.equal(authResult.code, "authorization_failure");
  }

  const csrfFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ error: { code: "CSRF_INVALID" } }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  };

  const csrfResult = await confirmOrderOnServer({
    orderId: "1",
    fetchFn: csrfFetch,
  });
  assert.equal(csrfResult.ok, false);
  if (!csrfResult.ok) {
    assert.equal(csrfResult.code, "csrf_invalid");
  }
});
