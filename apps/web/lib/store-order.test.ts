import assert from "node:assert/strict";
import test from "node:test";

import { assignedOutlets, storeOrderBody } from "./store-order.ts";

test("store order body keeps the approved fields and rejects an incomplete order", () => {
  const body = storeOrderBody({
    deliveryId: " ORD-100 ",
    orderDate: "2026-06-03",
    outletId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    tempRequirement: "chilled",
    orderUnits: "4",
    orderWeightKg: "1.5",
    orderVolumeM3: "0.25",
  });
  assert.equal(body?.deliveryId, "ORD-100");
  assert.equal("status" in (body ?? {}), false);
  assert.equal("submittedAt" in (body ?? {}), false);
  assert.equal(storeOrderBody({ ...blank(), orderUnits: "0" }), null);
});

test("assigned outlets come only from orders the server already returned", () => {
  assert.deepEqual(
    assignedOutlets([
      { outletId: "outlet-a", outletCode: "OUT001" },
      { outletId: "outlet-a", outletCode: "OUT001" },
    ]),
    [{ outletId: "outlet-a", outletCode: "OUT001" }],
  );
});

function blank() {
  return {
    deliveryId: "ORD-100",
    orderDate: "2026-06-03",
    outletId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    tempRequirement: "ambient",
    orderUnits: "1",
    orderWeightKg: "1",
    orderVolumeM3: "1",
  };
}
