import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { OrderActor, OrderStore, StoredOrder } from "./order.js";
import { guardOrderTransition } from "./transition-guard.js";

const now = new Date("2026-06-02T14:00:00.000Z");
const managerId = "44444444-4444-4444-8444-444444444444";
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const otherLoaderId = "22222222-2222-4222-8222-222222222223";
const driverId = "33333333-3333-4333-8333-333333333333";
const otherDriverId = "33333333-3333-4333-8333-333333333334";
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const outletB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

test("the guard allows an approved step and rejects a jump or a backward move", async () => {
  const store = memoryStore();
  const submitted = await guardOrderTransition({
    actor: manager([outletA]),
    orderId: "order-1",
    to: "SUBMITTED",
    now,
    store,
  });
  assert.equal(submitted.ok, true);
  if (submitted.ok) {
    assert.equal(submitted.order.status, "SUBMITTED");
  }
  for (const to of ["DELIVERED", "RECEIPT_CONFIRMED", "LOADING", "PLANNED_ALLOCATED"] as const) {
    assert.equal(
      (await guardOrderTransition({ actor: manager([outletA]), orderId: "order-1", to, now, store })).ok,
      false,
    );
  }
  store.order.status = "SUBMITTED";
  assert.deepEqual(
    await guardOrderTransition({ actor: dispatcher(), orderId: "order-1", to: "DELIVERED", now, store }),
    { ok: false, code: "invalid_transition" },
  );
  assert.deepEqual(
    await guardOrderTransition({ actor: dispatcher(), orderId: "order-1", to: "LOADING", now, store }),
    { ok: false, code: "invalid_transition" },
  );
  store.order.status = "DELIVERED";
  assert.deepEqual(
    await guardOrderTransition({ actor: dispatcher(), orderId: "order-1", to: "PLANNED_ALLOCATED", now, store }),
    { ok: false, code: "invalid_transition" },
  );
  store.order.status = "RECEIPT_CONFIRMED";
  for (const to of ["DRAFT", "DELIVERED", "DISPATCHED", "LOADED"] as const) {
    const earlier = await guardOrderTransition({ actor: manager([outletA]), orderId: "order-1", to, now, store });
    assert.deepEqual(earlier, { ok: false, code: "invalid_transition" });
  }
  assert.equal(store.order.status, "RECEIPT_CONFIRMED");
  assert.equal(store.writes, 1);
});

test("the guard uses the server actor and ignores a client role, actor, and status", async () => {
  const store = memoryStore();
  assert.deepEqual(
    await guardOrderTransition({ actor: null, orderId: "order-1", to: "SUBMITTED", now, store }),
    { ok: false, code: "authorization_failure" },
  );
  assert.deepEqual(
    await guardOrderTransition({
      actor: { userId: " ", role: "STORE_MANAGER", assignedOutletIds: [outletA] },
      orderId: "order-1",
      to: "SUBMITTED",
      now,
      store,
    }),
    { ok: false, code: "authorization_failure" },
  );
  assert.deepEqual(
    await guardOrderTransition({ actor: dispatcher(), orderId: "order-1", to: "SUBMITTED", now, store }),
    { ok: false, code: "authorization_failure" },
  );
  assert.deepEqual(
    await guardOrderTransition({ actor: manager([outletB]), orderId: "order-1", to: "SUBMITTED", now, store }),
    { ok: false, code: "object_scope_failure" },
  );
  for (const command of [
    { role: "DISPATCHER", actorUserId: dispatcherId, status: "DELIVERED" },
    { from: "DRAFT", currentStatus: "DRAFT", previousStatus: "DRAFT", to: "DELIVERED" },
    { outletId: outletA, actorId: managerId, planningResult: "feasible" },
  ]) {
    assert.deepEqual(
      await guardOrderTransition({
        actor: manager([outletA]),
        orderId: "order-1",
        to: "SUBMITTED",
        now,
        store,
        command,
      }),
      { ok: false, code: "invalid_input" },
    );
  }
  assert.equal(store.order.status, "DRAFT");
  assert.equal(store.writes, 0);
});

test("allocation, loading, delivery, and receipt each require their persisted prerequisite", async () => {
  const store = memoryStore();
  store.order.status = "DEFERRED";
  assert.deepEqual(
    await guardOrderTransition({ actor: dispatcher(), orderId: "order-1", to: "PLANNED_ALLOCATED", now, store }),
    { ok: false, code: "prerequisite_missing" },
  );
  store.allocate();
  const allocated = await guardOrderTransition({
    actor: dispatcher(),
    orderId: "order-1",
    to: "PLANNED_ALLOCATED",
    now,
    store,
  });
  assert.equal(allocated.ok, true);

  assert.deepEqual(
    await guardOrderTransition({ actor: loader(), orderId: "order-1", to: "LOADING", now, store }),
    { ok: false, code: "prerequisite_missing" },
  );
  store.assignLoader(otherLoaderId);
  assert.deepEqual(
    await guardOrderTransition({ actor: loader(), orderId: "order-1", to: "LOADING", now, store }),
    { ok: false, code: "object_scope_failure" },
  );
  store.assignLoader(loaderId);
  assert.equal((await guardOrderTransition({ actor: loader(), orderId: "order-1", to: "LOADING", now, store })).ok, true);

  store.order.status = "DISPATCHED";
  assert.deepEqual(
    await guardOrderTransition({ actor: driver(), orderId: "order-1", to: "DELIVERED", now, store }),
    { ok: false, code: "prerequisite_missing" },
  );
  store.assignDriver(otherDriverId);
  assert.deepEqual(
    await guardOrderTransition({ actor: driver(), orderId: "order-1", to: "DELIVERED", now, store }),
    { ok: false, code: "object_scope_failure" },
  );
  store.assignDriver(driverId);
  assert.equal((await guardOrderTransition({ actor: driver(), orderId: "order-1", to: "DELIVERED", now, store })).ok, true);
  assert.deepEqual(
    await guardOrderTransition({ actor: driver(), orderId: "order-1", to: "RECEIPT_CONFIRMED", now, store }),
    { ok: false, code: "authorization_failure" },
  );

  store.clearDriver();
  assert.deepEqual(
    await guardOrderTransition({ actor: manager([outletA]), orderId: "order-1", to: "RECEIPT_CONFIRMED", now, store }),
    { ok: false, code: "prerequisite_missing" },
  );
  store.assignDriver(driverId);
  assert.equal(
    (await guardOrderTransition({ actor: manager([outletA]), orderId: "order-1", to: "RECEIPT_CONFIRMED", now, store })).ok,
    true,
  );
  assert.deepEqual(
    await guardOrderTransition({ actor: manager([outletA]), orderId: "order-1", to: "DELIVERED", now, store }),
    { ok: false, code: "invalid_transition" },
  );
});

test("a stale competing write cannot pass the guard", async () => {
  const store = memoryStore();
  store.beforeStatusWrite = () => {
    store.order.status = "CONFIRMED";
  };
  const raced = await guardOrderTransition({
    actor: manager([outletA]),
    orderId: "order-1",
    to: "SUBMITTED",
    now,
    store,
  });
  assert.deepEqual(raced, { ok: false, code: "concurrency_conflict" });
  assert.equal(store.order.status, "CONFIRMED");
  assert.equal(store.writes, 0);
  const repeated = await guardOrderTransition({
    actor: manager([outletA]),
    orderId: "order-1",
    to: "SUBMITTED",
    now,
    store,
  });
  assert.deepEqual(repeated, { ok: false, code: "invalid_transition" });
});

test("the guard delegates to the order transition and does not plan or rewrite other records", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/domain/transition-guard.ts"), "utf8");
  assert.equal(source.includes("transitionOrder"), true);
  assert.equal(source.includes("compareAndSetStatus"), false);
  assert.equal(source.includes("recordException"), false);
  assert.equal(source.includes("deliveryRecord"), false);
  assert.equal(source.includes("trip.create"), false);
  assert.equal(source.includes("deferral.create"), false);
  assert.equal(source.includes("km_per_l"), false);
  assert.equal(source.includes("AuditEvent"), false);
  assert.equal(source.includes("localStorage"), false);
});

function manager(assignedOutletIds: readonly string[]): OrderActor {
  return { userId: managerId, role: "STORE_MANAGER", assignedOutletIds };
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

type TestStore = OrderStore & {
  order: StoredOrder;
  writes: number;
  beforeStatusWrite: (() => void) | null;
  allocate(): void;
  assignLoader(userId: string): void;
  assignDriver(userId: string): void;
  clearDriver(): void;
};

function memoryStore(): TestStore {
  const order: StoredOrder = {
    id: "order-1",
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId: outletA,
    outletCode: "OUT001",
    brand: "Fresh",
    district: "Colombo",
    depot: "Peliyagoda",
    createdByUserId: managerId,
    status: "DRAFT",
    tempRequirement: "chilled",
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
    submittedAt: null,
  };
  let tripStopCount = 0;
  let loaderUserIds: string[] = [];
  let deliveryDriverUserIds: string[] = [];
  const store: TestStore = {
    order,
    writes: 0,
    beforeStatusWrite: null,
    allocate() {
      tripStopCount = 1;
    },
    assignLoader(userId) {
      loaderUserIds = [userId];
    },
    assignDriver(userId) {
      deliveryDriverUserIds = [userId];
    },
    clearDriver() {
      deliveryDriverUserIds = [];
    },
    async findOutletById() {
      return null;
    },
    async findByDeliveryId() {
      return null;
    },
    async findById(id) {
      return id === order.id ? order : null;
    },
    async findTransitionFacts() {
      return { tripStopCount, deferralCount: 0, loaderUserIds, deliveryDriverUserIds };
    },
    async create() {
      throw new Error("the guard does not create an order");
    },
    async compareAndSetStatus(input) {
      store.beforeStatusWrite?.();
      store.beforeStatusWrite = null;
      if (order.id !== input.id || order.status !== input.expected) {
        return null;
      }
      order.status = input.next;
      if (input.next === "SUBMITTED") {
        order.submittedAt = input.submittedAt;
      }
      store.writes += 1;
      return order;
    },
  };
  return store;
}
