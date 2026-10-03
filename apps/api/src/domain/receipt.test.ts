import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { OrderActor, OrderStore, StoredOrder } from "./order.js";
import { confirmReceipt, type ReceiptDelivery, type ReceiptStore, type StoredReceipt } from "./receipt.js";

const now = new Date("2026-06-02T14:00:00.000Z");
const managerId = "44444444-4444-4444-8444-444444444444";
const otherManagerId = "44444444-4444-4444-8444-444444444445";
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const driverId = "33333333-3333-4333-8333-333333333333";
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const outletB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

test("the assigned store manager confirms a delivered order and keeps the issue on that receipt", async () => {
  const store = memoryStore();
  const confirmed = await confirmReceipt({
    actor: manager([outletA]),
    command: { deliveryRecordId: "delivery-1", result: "accepted", issueDetails: "one case short" },
    now,
    store,
  });
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) {
    return;
  }
  assert.equal(confirmed.receipt.deliveryRecordId, "delivery-1");
  assert.equal(confirmed.receipt.storeManagerUserId, managerId);
  assert.equal(confirmed.receipt.result, "accepted");
  assert.equal(confirmed.receipt.issueDetails, "one case short");
  assert.equal(confirmed.receipt.confirmedAt.toISOString(), now.toISOString());
  assert.equal(store.delivery.orderStatus, "RECEIPT_CONFIRMED");
  assert.equal(store.delivery.outcome, "left at gate");
  assert.equal(store.delivery.orderUnits, 10);
  assert.equal(store.delivery.orderWeightKg, "12.5");
  assert.equal(store.delivery.brand, "Fresh");
  assert.equal(store.receipts.length, 1);
  assert.equal(store.deferrals, 0);
  assert.equal(store.exceptions, 0);
  const repeated = await confirmReceipt({
    actor: manager([outletA]),
    command: { deliveryRecordId: "delivery-1", result: "accepted", issueDetails: "changed" },
    now,
    store,
  });
  assert.deepEqual(repeated, { ok: false, code: "lifecycle_conflict" });
  assert.equal(store.receipts.length, 1);
  assert.equal(store.receipts[0]?.issueDetails, "one case short");
});

test("receipt confirmation rejects the wrong outlet, an early delivery, and a client actor", async () => {
  const store = memoryStore();
  assert.deepEqual(
    await confirmReceipt({
      actor: manager([outletA]),
      command: {
        deliveryRecordId: "delivery-1",
        result: "accepted",
        role: "STORE_MANAGER",
        actorUserId: managerId,
        outletId: outletA,
      },
      now,
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  assert.deepEqual(
    await confirmReceipt({
      actor: manager([outletA]),
      command: { deliveryRecordId: "delivery-1", result: "accepted", status: "RECEIPT_CONFIRMED" },
      now,
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  for (const actor of [dispatcher(), loader(), driver()]) {
    assert.deepEqual(
      await confirmReceipt({ actor, command: { deliveryRecordId: "delivery-1", result: "accepted" }, now, store }),
      { ok: false, code: "authorization_failure" },
    );
  }
  assert.deepEqual(
    await confirmReceipt({
      actor: manager([outletB], otherManagerId),
      command: { deliveryRecordId: "delivery-1", result: "accepted" },
      now,
      store,
    }),
    { ok: false, code: "object_scope_failure" },
  );
  assert.deepEqual(
    await confirmReceipt({ actor: manager([outletA]), command: { deliveryRecordId: "missing", result: "accepted" }, now, store }),
    { ok: false, code: "not_found" },
  );
  store.delivery.orderStatus = "DISPATCHED";
  assert.deepEqual(
    await confirmReceipt({ actor: manager([outletA]), command: { deliveryRecordId: "delivery-1", result: "accepted" }, now, store }),
    { ok: false, code: "invalid_transition" },
  );
  store.delivery.orderStatus = "DELIVERED";
  assert.equal(store.receipts.length, 0);
  assert.equal(store.delivery.outcome, "left at gate");
  assert.equal(store.delivery.orderUnits, 10);
});

test("a failed receipt confirmation leaves the order delivered", async () => {
  const store = memoryStore();
  store.failTransition = true;
  const failed = await confirmReceipt({
    actor: manager([outletA]),
    command: { deliveryRecordId: "delivery-1", result: "accepted" },
    now,
    store,
  });
  assert.deepEqual(failed, { ok: false, code: "concurrency_conflict" });
  assert.equal(store.receipts.length, 0);
  assert.equal(store.delivery.orderStatus, "DELIVERED");
  store.failTransition = false;
  store.conflictOnCreate = true;
  const raced = await confirmReceipt({
    actor: manager([outletA]),
    command: { deliveryRecordId: "delivery-1", result: "accepted" },
    now,
    store,
  });
  assert.deepEqual(raced, { ok: false, code: "concurrency_conflict" });
  assert.equal(store.receipts.length, 0);
});

test("receipt confirmation uses the order transition and does not rewrite delivery", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/domain/receipt.ts"), "utf8");
  const storeSource = readFileSync(resolve(root, "apps/api/src/domain/receipt-store.ts"), "utf8");
  assert.equal(source.includes("transitionOrder"), true);
  assert.equal(source.includes("to: \"RECEIPT_CONFIRMED\""), true);
  assert.equal(source.includes("localStorage"), false);
  assert.equal(storeSource.includes("deliveryRecord.update"), false);
  assert.equal(storeSource.includes("order.update"), false);
  assert.equal(storeSource.includes("exception.create"), false);
  assert.equal(storeSource.includes("deferral.create"), false);
});

function manager(assignedOutletIds: readonly string[], userId = managerId): OrderActor {
  return { userId, role: "STORE_MANAGER", assignedOutletIds };
}

function dispatcher(): OrderActor {
  return { userId: dispatcherId, role: "DISPATCHER", assignedOutletIds: [] };
}

function loader(): OrderActor {
  return { userId: loaderId, role: "LOADER", assignedOutletIds: [] };
}

function driver(): OrderActor {
  return { userId: driverId, role: "DRIVER", assignedOutletIds: [] };
}

type Memory = ReceiptStore & {
  delivery: ReceiptDelivery;
  receipts: StoredReceipt[];
  deferrals: number;
  exceptions: number;
  failTransition: boolean;
  conflictOnCreate: boolean;
};

function memoryStore(): Memory {
  const delivery: ReceiptDelivery = {
    id: "delivery-1",
    orderId: "order-1",
    orderStatus: "DELIVERED",
    outletId: outletA,
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
    tempRequirement: "chilled",
    brand: "Fresh",
    district: "Colombo",
    depot: "Peliyagoda",
    outcome: "left at gate",
    hasReceipt: false,
  };
  const receipts: StoredReceipt[] = [];
  const state: Memory = {
    delivery,
    receipts,
    deferrals: 0,
    exceptions: 0,
    failTransition: false,
    conflictOnCreate: false,
    async transaction(work) {
      const snapshot = structuredClone({ delivery, receipts });
      try {
        return await work(unit());
      } catch (error) {
        Object.assign(delivery, snapshot.delivery);
        receipts.splice(0, receipts.length, ...snapshot.receipts);
        throw error;
      }
    },
  };
  return state;

  function unit(): import("./receipt.js").ReceiptUnit {
    return {
      orders: orderStore(),
      async findDelivery(id) {
        if (id !== delivery.id) {
          return null;
        }
        return { ...delivery, hasReceipt: receipts.some((receipt) => receipt.deliveryRecordId === delivery.id) };
      },
      async create(input) {
        if (state.conflictOnCreate || receipts.some((receipt) => receipt.deliveryRecordId === input.deliveryRecordId)) {
          return "conflict";
        }
        const receipt: StoredReceipt = {
          id: `receipt-${String(receipts.length + 1)}`,
          deliveryRecordId: input.deliveryRecordId,
          storeManagerUserId: input.storeManagerUserId,
          confirmedAt: input.confirmedAt,
          result: input.result,
          issueDetails: input.issueDetails,
        };
        receipts.push(receipt);
        return receipt;
      },
    };

    function orderStore(): OrderStore {
      return {
        async findOutletById() {
          return null;
        },
        async findByDeliveryId() {
          return null;
        },
        async findById(id) {
          return id === delivery.orderId ? toStoredOrder(delivery) : null;
        },
        async findTransitionFacts() {
          return {
            tripStopCount: 1,
            deferralCount: 0,
            loaderUserIds: [],
            deliveryDriverUserIds: [driverId],
          };
        },
        async create() {
          throw new Error("receipt does not create an order");
        },
        async compareAndSetStatus(input) {
          if (state.failTransition) {
            delivery.orderStatus = "DISPATCHED";
          }
          if (delivery.orderStatus !== input.expected) {
            return null;
          }
          delivery.orderStatus = input.next;
          return toStoredOrder(delivery);
        },
      };
    }
  }
}

function toStoredOrder(delivery: ReceiptDelivery): StoredOrder {
  return {
    id: delivery.orderId,
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId: delivery.outletId,
    outletCode: "OUT001",
    brand: delivery.brand,
    district: delivery.district,
    depot: delivery.depot,
    createdByUserId: managerId,
    status: delivery.orderStatus,
    tempRequirement: delivery.tempRequirement,
    orderUnits: delivery.orderUnits,
    orderWeightKg: delivery.orderWeightKg,
    orderVolumeM3: delivery.orderVolumeM3,
    submittedAt: now,
  };
}
