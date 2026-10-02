import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createOrder,
  getOrder,
  submitOrder,
  type OrderActor,
  type OrderOutlet,
  type OrderStore,
  type OrderTransitionFacts,
  type StoredOrder,
} from "./order.js";

const now = new Date("2026-06-01T08:00:00.000Z");
const managerId = "44444444-4444-4444-8444-444444444444";
const otherManagerId = "44444444-4444-4444-8444-444444444445";
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const outletB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";

test("a store manager creates a draft order for an assigned outlet", async () => {
  const store = memoryStore();
  const created = await createOrder({
    actor: manager([outletA]),
    command: validCommand(),
    store,
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  assert.equal(created.order.status, "DRAFT");
  assert.equal(created.order.createdByUserId, managerId);
  assert.equal(created.order.submittedAt, null);
  assert.equal(created.order.brand, "Fresh");
  assert.equal(created.order.district, "Colombo");
  assert.equal(created.order.depot, "Peliyagoda");
  assert.equal(created.order.outletCode, "OUT001");
  assert.equal(JSON.stringify(created).includes("password"), false);
});

test("order creation rejects scope, facts, and client-controlled fields", async () => {
  const store = memoryStore();
  const actor = manager([outletA]);
  assert.equal((await createOrder({ actor, command: validCommand({ outletId: "missing" }), store })).ok, false);
  assert.deepEqual(await createOrder({ actor, command: validCommand({ outletId: "missing" }), store }), {
    ok: false,
    code: "not_found",
  });
  assert.deepEqual(await createOrder({ actor, command: validCommand({ outletId: outletB }), store }), {
    ok: false,
    code: "authorization_failure",
  });
  assert.deepEqual(await createOrder({ actor: loader(), command: validCommand({ role: "STORE_MANAGER" }), store }), {
    ok: false,
    code: "invalid_input",
  });
  assert.equal(store.orders.length, 0);
  assert.deepEqual(await createOrder({ actor: loader(), command: validCommand(), store }), {
    ok: false,
    code: "authorization_failure",
  });
  for (const command of [
    validCommand({ tempRequirement: "frozen" }),
    validCommand({ tempRequirement: "reefer" }),
    validCommand({ orderUnits: 0 }),
    validCommand({ orderUnits: -1 }),
    validCommand({ orderUnits: 1.5 }),
    validCommand({ orderWeightKg: "0" }),
    validCommand({ orderWeightKg: "-1" }),
    validCommand({ orderVolumeM3: "0.0" }),
    validCommand({ orderDate: "2026-02-31" }),
    validCommand({ deliveryId: "" }),
    validCommand({ brand: "Tech" }),
    validCommand({ district: "Kandy" }),
    validCommand({ depot: "Kandy" }),
    validCommand({ status: "CONFIRMED" }),
    validCommand({ tripId: "trip-1" }),
    validCommand({ vehicleId: "vehicle-1" }),
    validCommand({ planningEligible: true }),
    validCommand({ actorUserId: dispatcherId }),
    validCommand({ dispatchDate: "2026-06-03" }),
    validCommand({ dispatchStatus: "Dispatched" }),
  ]) {
    const result = await createOrder({ actor, command, store });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.notEqual(result.code, "persistence_failure");
    }
  }
  assert.equal(store.orders.length, 0);
  const mismatched = await createOrder({ actor, command: validCommand({ brand: "Tech" }), store });
  assert.deepEqual(mismatched, { ok: false, code: "invariant_violation" });
});

test("submission preserves source facts and rejects the wrong actor or state", async () => {
  const store = memoryStore();
  const created = await createOrder({ actor: manager([outletA]), command: validCommand(), store });
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  const denied = await submitOrder({
    actor: manager([outletB], otherManagerId),
    orderId: created.order.id,
    now,
    store,
  });
  assert.deepEqual(denied, { ok: false, code: "authorization_failure" });
  assert.equal(store.orders[0]?.status, "DRAFT");
  const submitted = await submitOrder({
    actor: manager([outletA]),
    orderId: created.order.id,
    now,
    store,
  });
  assert.equal(submitted.ok, true);
  if (!submitted.ok) {
    return;
  }
  assert.equal(submitted.order.status, "SUBMITTED");
  assert.equal(submitted.order.submittedAt?.toISOString(), now.toISOString());
  assert.equal(submitted.order.deliveryId, "ORD-100");
  assert.equal(submitted.order.orderUnits, 10);
  assert.equal(submitted.order.orderWeightKg, "12.5");
  assert.equal(submitted.order.orderVolumeM3, "1.25");
  assert.equal(submitted.order.tempRequirement, "chilled");
  assert.equal(submitted.order.orderDate, "2026-06-02");
  assert.equal(submitted.order.brand, "Fresh");
  const repeated = await submitOrder({
    actor: manager([outletA]),
    orderId: created.order.id,
    now,
    store,
  });
  assert.deepEqual(repeated, { ok: false, code: "lifecycle_conflict" });
  store.orders[0].status = "CONFIRMED";
  const confirmed = await submitOrder({
    actor: manager([outletA]),
    orderId: created.order.id,
    now,
    store,
  });
  assert.deepEqual(confirmed, { ok: false, code: "lifecycle_conflict" });
});

test("reads use the server actor and do not trust a client role", async () => {
  const store = memoryStore();
  const created = await createOrder({ actor: manager([outletA]), command: validCommand(), store });
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  const dispatcher = await getOrder({
    actor: { userId: dispatcherId, role: "DISPATCHER", assignedOutletIds: [] },
    orderId: created.order.id,
    store,
  });
  assert.equal(dispatcher.ok, true);
  const outsider = await getOrder({
    actor: manager([outletB], otherManagerId),
    orderId: created.order.id,
    store,
  });
  assert.deepEqual(outsider, { ok: false, code: "authorization_failure" });
  const actualLoader = await getOrder({
    actor: loader(),
    orderId: created.order.id,
    store,
  });
  assert.deepEqual(actualLoader, { ok: false, code: "authorization_failure" });
});

test("the order store does not persist outlet master copies or planning fields", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/domain/order-store.ts"), "utf8");
  const createData = source.slice(source.indexOf("order.create"), source.indexOf("include: { outlet: true }"));
  assert.equal(createData.includes("brand"), false);
  assert.equal(createData.includes("district"), false);
  assert.equal(createData.includes("depot"), false);
  assert.equal(source.includes("dispatchDate"), false);
  assert.equal(source.includes("planningEligible"), false);
  assert.equal(source.includes("status: \"DRAFT\""), true);
  assert.equal(source.includes("status: \"SUBMITTED\""), true);
});

function manager(assignedOutletIds: readonly string[], userId = managerId): OrderActor {
  return { userId, role: "STORE_MANAGER", assignedOutletIds };
}

function loader(): OrderActor {
  return { userId: loaderId, role: "LOADER", assignedOutletIds: [] };
}

function validCommand(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId: outletA,
    tempRequirement: "chilled",
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
    ...overrides,
  };
}

function memoryStore(): OrderStore & { orders: StoredOrder[]; outlets: OrderOutlet[] } {
  const outlets: OrderOutlet[] = [
    { id: outletA, outletCode: "OUT001", brand: "Fresh", district: "Colombo", depot: "Peliyagoda" },
    { id: outletB, outletCode: "OUT002", brand: "Tech", district: "Kandy", depot: "Kandy" },
  ];
  const orders: StoredOrder[] = [];
  return {
    outlets,
    orders,
    async findOutletById(id) {
      return outlets.find((outlet) => outlet.id === id) ?? null;
    },
    async findByDeliveryId(deliveryId) {
      return orders.find((order) => order.deliveryId === deliveryId) ?? null;
    },
    async findById(id) {
      return orders.find((order) => order.id === id) ?? null;
    },
    async findTransitionFacts() {
      return emptyFacts();
    },
    async create(input) {
      const outlet = outlets.find((item) => item.id === input.outletId);
      if (outlet === undefined) {
        throw new Error("missing outlet");
      }
      const order: StoredOrder = {
        id: `order-${String(orders.length + 1)}`,
        deliveryId: input.deliveryId,
        orderDate: input.orderDate,
        outletId: outlet.id,
        outletCode: outlet.outletCode,
        brand: outlet.brand,
        district: outlet.district,
        depot: outlet.depot,
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
      const order = orders.find((item) => item.id === input.id);
      if (order === undefined || order.status !== input.expected) {
        return null;
      }
      if (input.next === "SUBMITTED") {
        order.submittedAt = input.submittedAt;
      }
      order.status = input.next;
      return order;
    },
  };
}

function emptyFacts(): OrderTransitionFacts {
  return { tripStopCount: 0, deferralCount: 0, loaderUserIds: [], deliveryDriverUserIds: [] };
}
