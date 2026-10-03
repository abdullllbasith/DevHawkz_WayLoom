import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { recordException, type ExceptionStore, type StoredException } from "./exception.js";
import type { OrderActor } from "./order.js";

const now = new Date("2026-06-02T10:00:00.000Z");
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const driverId = "33333333-3333-4333-8333-333333333333";
const managerId = "44444444-4444-4444-8444-444444444444";

test("a dispatcher records a standalone exception without changing the order", async () => {
  const store = memoryStore();
  const recorded = await recordException({
    actor: dispatcher(),
    command: { category: "loading problem", details: "case damaged" },
    now,
    store,
  });
  assert.equal(recorded.ok, true);
  if (!recorded.ok) {
    return;
  }
  assert.equal(recorded.exception.category, "loading problem");
  assert.equal(recorded.exception.details, "case damaged");
  assert.equal(recorded.exception.occurredAt.toISOString(), now.toISOString());
  assert.equal(recorded.exception.reportedByUserId, dispatcherId);
  assert.equal(store.orderStatus, "LOADING");
  assert.equal(store.orderUnits, 10);
  assert.equal(store.trips, 0);
  assert.equal(store.deliveries, 0);
  assert.equal(store.receipts, 0);
  assert.equal(store.deferrals, 0);
  const again = await recordException({
    actor: dispatcher(),
    command: { category: "loading problem" },
    now,
    store,
  });
  assert.equal(again.ok, true);
  assert.equal(store.exceptions.length, 2);
  assert.equal(store.orderStatus, "LOADING");
});

test("exception context, role, and actor cannot be supplied by the client", async () => {
  const store = memoryStore();
  for (const command of [
    { category: "loading problem", role: "DISPATCHER", actorUserId: dispatcherId },
    { category: "loading problem", orderId: "order-1" },
    { category: "loading problem", tripId: "trip-1" },
    { category: "loading problem", tripStopId: "stop-1" },
    { category: "loading problem", loadingRecordId: "loading-1" },
    { category: "loading problem", deliveryRecordId: "delivery-1" },
    { category: "loading problem", receiptId: "receipt-1" },
    { category: "loading problem", deferralId: "deferral-1" },
    { category: "loading problem", entityType: "Order", entityId: "order-1" },
    { category: "loading problem", severity: "HIGH" },
    { category: "loading problem", status: "OPEN" },
    { category: " ", details: "case damaged" },
  ]) {
    assert.deepEqual(await recordException({ actor: dispatcher(), command, now, store }), {
      ok: false,
      code: "invalid_input",
    });
  }
  for (const actor of [manager(), loader(), driver()]) {
    assert.deepEqual(
      await recordException({ actor, command: { category: "loading problem" }, now, store }),
      { ok: false, code: "authorization_failure" },
    );
  }
  assert.equal(store.exceptions.length, 0);
  assert.equal(store.orderStatus, "LOADING");
  assert.equal(store.orderUnits, 10);
});

test("an exception record does not plan, deliver, or confirm the order", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/domain/exception.ts"), "utf8");
  const storeSource = readFileSync(resolve(root, "apps/api/src/domain/exception-store.ts"), "utf8");
  assert.equal(source.includes("transitionOrder"), false);
  assert.equal(source.includes("severity"), true);
  assert.equal(storeSource.includes("order.update"), false);
  assert.equal(storeSource.includes("trip.create"), false);
  assert.equal(storeSource.includes("deferral.create"), false);
  assert.equal(storeSource.includes("deliveryRecord"), false);
  assert.equal(storeSource.includes("receipt.create"), false);
});

function dispatcher(): OrderActor {
  return { userId: dispatcherId, role: "DISPATCHER", assignedOutletIds: [] };
}

function manager(): OrderActor {
  return { userId: managerId, role: "STORE_MANAGER", assignedOutletIds: ["outlet-1"] };
}

function loader(): OrderActor {
  return { userId: loaderId, role: "LOADER", assignedOutletIds: [] };
}

function driver(): OrderActor {
  return { userId: driverId, role: "DRIVER", assignedOutletIds: [] };
}

type Memory = ExceptionStore & {
  exceptions: StoredException[];
  orderStatus: string;
  orderUnits: number;
  trips: number;
  deliveries: number;
  receipts: number;
  deferrals: number;
};

function memoryStore(): Memory {
  const exceptions: StoredException[] = [];
  return {
    exceptions,
    orderStatus: "LOADING",
    orderUnits: 10,
    trips: 0,
    deliveries: 0,
    receipts: 0,
    deferrals: 0,
    async create(input) {
      const exception: StoredException = {
        id: `exception-${String(exceptions.length + 1)}`,
        category: input.category,
        details: input.details,
        occurredAt: input.occurredAt,
        reportedByUserId: input.reportedByUserId,
      };
      exceptions.push(exception);
      return exception;
    },
  };
}
