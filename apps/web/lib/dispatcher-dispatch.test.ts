import assert from "node:assert/strict";
import test from "node:test";

import { tripReadyToDispatch } from "./dispatcher-dispatch.ts";

test("dispatch is offered only when every trip order is loaded", () => {
  const status = new Map([
    ["order-1", "LOADED"],
    ["order-2", "LOADED"],
  ]);
  assert.equal(
    tripReadyToDispatch({
      stops: [{ orderId: "order-1" }, { orderId: "order-2" }],
      orderStatus: (orderId) => status.get(orderId),
    }),
    true,
  );
  status.set("order-2", "PLANNED_ALLOCATED");
  assert.equal(
    tripReadyToDispatch({
      stops: [{ orderId: "order-1" }, { orderId: "order-2" }],
      orderStatus: (orderId) => status.get(orderId),
    }),
    false,
  );
  assert.equal(tripReadyToDispatch({ stops: [], orderStatus: () => "LOADED" }), false);
});
