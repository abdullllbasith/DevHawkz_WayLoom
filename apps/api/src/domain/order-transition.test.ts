import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createOrder, type OrderActor, type OrderStatusName, type StoredOrder } from "./order.js";
import { transitionOrder } from "./order-transition.js";

const now = new Date("2026-06-01T08:00:00.000Z");
const later = new Date("2026-06-03T08:00:00.000Z");
const managerId = "44444444-4444-4444-8444-444444444444";
const otherManagerId = "44444444-4444-4444-8444-444444444445";
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const otherLoaderId = "22222222-2222-4222-8222-222222222223";
const driverId = "33333333-3333-4333-8333-333333333333";
const otherDriverId = "33333333-3333-4333-8333-333333333334";
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

test("each approved order transition follows its owner and prerequisite", async () => {
  const store = memoryStore();
  const created = await createOrder({ actor: manager([outletA]), command: validCommand(), store });
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  const steps: { to: OrderStatusName; actor: OrderActor; before?: () => void }[] = [
    { to: "SUBMITTED", actor: manager([outletA]) },
    { to: "CONFIRMED", actor: dispatcher() },
    { to: "DEFERRED", actor: dispatcher(), before: () => store.defer(created.order.id) },
    {
      to: "PLANNED_ALLOCATED",
      actor: dispatcher(),
      before: () => store.allocate(created.order.id),
    },
    { to: "LOADING", actor: loader(), before: () => store.assignLoader(created.order.id, loaderId) },
    { to: "EXCEPTION_REPORTED", actor: dispatcher() },
  ];
  let submittedAt: Date | null = null;
  for (const step of steps) {
    step.before?.();
    const result = await transitionOrder({
      actor: step.actor,
      orderId: created.order.id,
      to: step.to,
      now,
      store,
    });
    assert.equal(result.ok, true, step.to);
    if (!result.ok) {
      return;
    }
    assert.equal(result.order.status, step.to);
    if (step.to === "SUBMITTED") {
      submittedAt = result.order.submittedAt;
    }
    assert.equal(result.order.submittedAt?.toISOString(), submittedAt?.toISOString());
    assert.equal(result.order.brand, "Fresh");
  }
  store.orders[0].status = "LOADING";
  const loaded = await transitionOrder({
    actor: loader(),
    orderId: created.order.id,
    to: "LOADED",
    now: later,
    store,
  });
  assert.equal(loaded.ok, true);
  if (!loaded.ok) {
    return;
  }
  assert.equal(loaded.order.submittedAt?.toISOString(), now.toISOString());
  const dispatched = await transitionOrder({
    actor: dispatcher(),
    orderId: created.order.id,
    to: "DISPATCHED",
    now: later,
    store,
  });
  assert.equal(dispatched.ok, true);
  store.assignDriver(created.order.id, driverId);
  const delivered = await transitionOrder({
    actor: driver(),
    orderId: created.order.id,
    to: "DELIVERED",
    now: later,
    store,
  });
  assert.equal(delivered.ok, true);
  const receipt = await transitionOrder({
    actor: manager([outletA]),
    orderId: created.order.id,
    to: "RECEIPT_CONFIRMED",
    now: later,
    store,
  });
  assert.equal(receipt.ok, true);
  if (!receipt.ok) {
    return;
  }
  assert.equal(receipt.order.status, "RECEIPT_CONFIRMED");
  assert.equal(store.writes, 10);
});

test("illegal and arbitrary status changes stay on the current state", async () => {
  const store = memoryStore();
  const order = await draft(store);
  for (const to of ["DELIVERED", "RECEIPT_CONFIRMED", "LOADING", "PLANNED_ALLOCATED"]) {
    const result = await transitionOrder({ actor: manager([outletA]), orderId: order.id, to, now, store });
    assert.deepEqual(result, { ok: false, code: "invalid_transition" });
    assert.equal(order.status, "DRAFT");
  }
  await move(store, order, "SUBMITTED", manager([outletA]));
  for (const to of ["DELIVERED", "LOADING"]) {
    const result = await transitionOrder({ actor: dispatcher(), orderId: order.id, to, now, store });
    assert.deepEqual(result, { ok: false, code: "invalid_transition" });
    assert.equal(order.status, "SUBMITTED");
  }
  await move(store, order, "CONFIRMED", dispatcher());
  store.defer(order.id);
  await move(store, order, "DEFERRED", dispatcher());
  assert.notEqual(order.status, "PLANNED_ALLOCATED");
  store.allocate(order.id);
  await move(store, order, "PLANNED_ALLOCATED", dispatcher());
  store.assignLoader(order.id, loaderId);
  await move(store, order, "LOADING", loader());
  await move(store, order, "LOADED", loader());
  await move(store, order, "DISPATCHED", dispatcher());
  store.assignDriver(order.id, driverId);
  await move(store, order, "DELIVERED", driver());
  const backward = await transitionOrder({
    actor: dispatcher(),
    orderId: order.id,
    to: "PLANNED_ALLOCATED",
    now,
    store,
  });
  assert.deepEqual(backward, { ok: false, code: "invalid_transition" });
  await move(store, order, "RECEIPT_CONFIRMED", manager([outletA]));
  const earlier = await transitionOrder({
    actor: dispatcher(),
    orderId: order.id,
    to: "DISPATCHED",
    now,
    store,
  });
  assert.deepEqual(earlier, { ok: false, code: "invalid_transition" });
  const invented = await transitionOrder({
    actor: dispatcher(),
    orderId: order.id,
    to: "CLOSED",
    now,
    store,
  });
  assert.deepEqual(invented, { ok: false, code: "invalid_input" });
  assert.equal(order.status, "RECEIPT_CONFIRMED");
});

test("transition authorization uses the server actor and the assigned record", async () => {
  const store = memoryStore();
  const order = await draft(store);
  assert.deepEqual(
    await transitionOrder({
      actor: manager([outletA]),
      orderId: order.id,
      to: "SUBMITTED",
      now,
      store,
      command: { role: "DISPATCHER", actorUserId: dispatcherId },
    }),
    { ok: false, code: "invalid_input" },
  );
  assert.equal(order.status, "DRAFT");
  assert.deepEqual(
    await transitionOrder({
      actor: manager(["other-outlet"], otherManagerId),
      orderId: order.id,
      to: "SUBMITTED",
      now,
      store,
    }),
    { ok: false, code: "object_scope_failure" },
  );
  await move(store, order, "SUBMITTED", manager([outletA]));
  assert.deepEqual(
    await transitionOrder({ actor: manager([outletA]), orderId: order.id, to: "CONFIRMED", now, store }),
    { ok: false, code: "authorization_failure" },
  );
  await move(store, order, "CONFIRMED", dispatcher());
  assert.deepEqual(
    await transitionOrder({ actor: dispatcher(), orderId: order.id, to: "PLANNED_ALLOCATED", now, store }),
    { ok: false, code: "prerequisite_missing" },
  );
  assert.deepEqual(
    await transitionOrder({ actor: dispatcher(), orderId: order.id, to: "DEFERRED", now, store }),
    { ok: false, code: "prerequisite_missing" },
  );
  store.allocate(order.id);
  store.defer(order.id);
  assert.deepEqual(
    await transitionOrder({ actor: dispatcher(), orderId: order.id, to: "DEFERRED", now, store }),
    { ok: false, code: "prerequisite_missing" },
  );
  await move(store, order, "PLANNED_ALLOCATED", dispatcher());
  assert.deepEqual(
    await transitionOrder({ actor: loader(), orderId: order.id, to: "LOADING", now, store }),
    { ok: false, code: "prerequisite_missing" },
  );
  store.assignLoader(order.id, otherLoaderId);
  assert.deepEqual(
    await transitionOrder({ actor: loader(), orderId: order.id, to: "LOADING", now, store }),
    { ok: false, code: "object_scope_failure" },
  );
  assert.deepEqual(
    await transitionOrder({ actor: dispatcher(), orderId: order.id, to: "LOADED", now, store }),
    { ok: false, code: "invalid_transition" },
  );
  await move(store, order, "LOADING", loader(otherLoaderId));
  assert.deepEqual(
    await transitionOrder({ actor: loader(), orderId: order.id, to: "EXCEPTION_REPORTED", now, store }),
    { ok: false, code: "authorization_failure" },
  );
  await move(store, order, "LOADED", loader(otherLoaderId));
  assert.deepEqual(
    await transitionOrder({ actor: loader(), orderId: order.id, to: "DISPATCHED", now, store }),
    { ok: false, code: "authorization_failure" },
  );
  await move(store, order, "DISPATCHED", dispatcher());
  assert.deepEqual(
    await transitionOrder({ actor: driver(), orderId: order.id, to: "DELIVERED", now, store }),
    { ok: false, code: "prerequisite_missing" },
  );
  store.assignDriver(order.id, otherDriverId);
  assert.deepEqual(
    await transitionOrder({ actor: driver(), orderId: order.id, to: "DELIVERED", now, store }),
    { ok: false, code: "object_scope_failure" },
  );
  assert.deepEqual(
    await transitionOrder({ actor: manager([outletA]), orderId: order.id, to: "DELIVERED", now, store }),
    { ok: false, code: "authorization_failure" },
  );
  await move(store, order, "DELIVERED", driver(otherDriverId));
  assert.deepEqual(
    await transitionOrder({
      actor: manager(["other-outlet"], otherManagerId),
      orderId: order.id,
      to: "RECEIPT_CONFIRMED",
      now,
      store,
    }),
    { ok: false, code: "object_scope_failure" },
  );
  assert.deepEqual(
    await transitionOrder({ actor: dispatcher(), orderId: order.id, to: "RECEIPT_CONFIRMED", now, store }),
    { ok: false, code: "authorization_failure" },
  );
  assert.equal(order.status, "DELIVERED");
});

test("a repeated transition and a stale competing write do not both change the order", async () => {
  const store = memoryStore();
  const order = await draft(store);
  await move(store, order, "SUBMITTED", manager([outletA]));
  const repeated = await transitionOrder({
    actor: manager([outletA]),
    orderId: order.id,
    to: "SUBMITTED",
    now: later,
    store,
  });
  assert.deepEqual(repeated, { ok: false, code: "invalid_transition" });
  assert.equal(order.submittedAt?.toISOString(), now.toISOString());
  store.beforeStatusWrite = () => {
    order.status = "CONFIRMED";
  };
  const raced = await transitionOrder({
    actor: dispatcher(),
    orderId: order.id,
    to: "CONFIRMED",
    now: later,
    store,
  });
  assert.deepEqual(raced, { ok: false, code: "concurrency_conflict" });
  assert.equal(order.status, "CONFIRMED");
  assert.equal(order.submittedAt?.toISOString(), now.toISOString());
  assert.equal(store.writes, 1);
});

test("the transition boundary does not calculate planning feasibility or write an audit action", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/domain/order-transition.ts"), "utf8");
  assert.equal(source.includes("km_per_l"), false);
  assert.equal(source.includes("weekly_fuel"), false);
  assert.equal(source.includes("weight_cap"), false);
  assert.equal(source.includes("service_allowance"), false);
  assert.equal(source.includes("AuditEvent"), false);
  assert.equal(source.includes("prisma.auditEvent"), false);
});

function manager(assignedOutletIds: readonly string[], userId = managerId): OrderActor {
  return { userId, role: "STORE_MANAGER", assignedOutletIds };
}

function dispatcher(): OrderActor {
  return { userId: dispatcherId, role: "DISPATCHER", assignedOutletIds: [] };
}

function loader(userId = loaderId): OrderActor {
  return { userId, role: "LOADER", assignedOutletIds: [] };
}

function driver(userId = driverId): OrderActor {
  return { userId, role: "DRIVER", assignedOutletIds: [] };
}

function validCommand(): Record<string, unknown> {
  return {
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId: outletA,
    tempRequirement: "chilled",
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
  };
}

async function draft(store: TestStore): Promise<StoredOrder> {
  const created = await createOrder({ actor: manager([outletA]), command: validCommand(), store });
  assert.equal(created.ok, true);
  if (!created.ok) {
    throw new Error("draft was not created");
  }
  return created.order;
}

async function move(store: TestStore, order: StoredOrder, to: OrderStatusName, actor: OrderActor): Promise<void> {
  const result = await transitionOrder({ actor, orderId: order.id, to, now, store });
  assert.equal(result.ok, true, to);
}

type TestStore = OrderStoreWithFacts & { orders: StoredOrder[]; writes: number; beforeStatusWrite: (() => void) | null };

type OrderStoreWithFacts = import("./order.js").OrderStore & {
  defer(orderId: string): void;
  allocate(orderId: string): void;
  assignLoader(orderId: string, userId: string): void;
  assignDriver(orderId: string, userId: string): void;
};

function memoryStore(): TestStore {
  const orders: StoredOrder[] = [];
  const deferred = new Set<string>();
  const allocated = new Set<string>();
  const loaders = new Map<string, string[]>();
  const drivers = new Map<string, string[]>();
  const store: TestStore = {
    orders,
    writes: 0,
    beforeStatusWrite: null,
    async findOutletById(id) {
      if (id !== outletA) {
        return null;
      }
      return { id: outletA, outletCode: "OUT001", brand: "Fresh", district: "Colombo", depot: "Peliyagoda" };
    },
    async findByDeliveryId(deliveryId) {
      return orders.find((order) => order.deliveryId === deliveryId) ?? null;
    },
    async findById(id) {
      return orders.find((order) => order.id === id) ?? null;
    },
    async findTransitionFacts(orderId) {
      return {
        tripStopCount: allocated.has(orderId) ? 1 : 0,
        deferralCount: deferred.has(orderId) ? 1 : 0,
        loaderUserIds: loaders.get(orderId) ?? [],
        deliveryDriverUserIds: drivers.get(orderId) ?? [],
      };
    },
    async create(input) {
      const order: StoredOrder = {
        id: "order-1",
        deliveryId: input.deliveryId,
        orderDate: input.orderDate,
        outletId: input.outletId,
        outletCode: "OUT001",
        brand: "Fresh",
        district: "Colombo",
        depot: "Peliyagoda",
        createdByUserId: input.createdByUserId,
        status: "DRAFT",
        tempRequirement: input.tempRequirement,
        orderUnits: input.orderUnits,
        orderWeightKg: input.orderWeightKg,
        orderVolumeM3: input.orderVolumeM3,
        submittedAt: null,
      };
      orders.push(order);
      return order;
    },
    async compareAndSetStatus(input) {
      store.beforeStatusWrite?.();
      store.beforeStatusWrite = null;
      const order = orders.find((item) => item.id === input.id);
      if (order === undefined || order.status !== input.expected) {
        return null;
      }
      if (input.next === "SUBMITTED") {
        order.submittedAt = input.submittedAt;
      }
      order.status = input.next;
      store.writes += 1;
      return order;
    },
    defer(orderId) {
      deferred.add(orderId);
    },
    allocate(orderId) {
      allocated.add(orderId);
    },
    assignLoader(orderId, userId) {
      loaders.set(orderId, [userId]);
    },
    assignDriver(orderId, userId) {
      drivers.set(orderId, [userId]);
    },
  };
  return store;
}
