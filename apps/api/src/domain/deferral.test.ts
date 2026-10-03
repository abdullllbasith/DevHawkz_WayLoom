import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { deferralReasons, recordDeferral, type DeferralOrder, type DeferralStore, type StoredDeferral } from "./deferral.js";
import type { OrderActor, OrderStore, StoredOrder } from "./order.js";

const now = new Date("2026-06-01T12:00:00.000Z");
const later = new Date("2026-06-02T12:00:00.000Z");
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const driverId = "33333333-3333-4333-8333-333333333333";
const managerId = "44444444-4444-4444-8444-444444444444";

test("a dispatcher defers a confirmed order and keeps later reasons", async () => {
  const store = memoryStore();
  const first = await recordDeferral({
    actor: dispatcher(),
    command: { orderId: "order-1", reason: "NO_CAPACITY" },
    now,
    store,
  });
  assert.equal(first.ok, true);
  if (!first.ok) {
    return;
  }
  assert.equal(first.deferral.reason, "NO_CAPACITY");
  assert.equal(first.deferral.reportedAt.toISOString(), now.toISOString());
  assert.equal(store.order.status, "DEFERRED");
  assert.equal(store.order.orderUnits, 10);
  assert.equal(store.order.orderWeightKg, "12.5");
  assert.equal(store.order.brand, "Fresh");
  assert.equal(store.order.depot, "Peliyagoda");
  assert.equal(store.trips, 0);
  for (const reason of deferralReasons.slice(1)) {
    const next = await recordDeferral({
      actor: dispatcher(),
      command: { orderId: "order-1", reason },
      now: later,
      store,
    });
    assert.equal(next.ok, true, reason);
  }
  assert.deepEqual(
    store.deferrals.map((deferral) => deferral.reason),
    [...deferralReasons],
  );
  assert.equal(store.order.status, "DEFERRED");
  const repeated = await recordDeferral({
    actor: dispatcher(),
    command: { orderId: "order-1", reason: "NO_CAPACITY" },
    now: later,
    store,
  });
  assert.deepEqual(repeated, { ok: false, code: "lifecycle_conflict" });
  assert.equal(store.deferrals.length, deferralReasons.length);
});

test("deferral rejects the wrong actor, an allocation, and an unsupported reason", async () => {
  const store = memoryStore();
  assert.deepEqual(
    await recordDeferral({
      actor: dispatcher(),
      command: { orderId: "order-1", reason: "NO_CAPACITY", role: "DISPATCHER", actorUserId: dispatcherId },
      now,
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  assert.deepEqual(
    await recordDeferral({
      actor: dispatcher(),
      command: { orderId: "order-1", reason: "NO_CAPACITY", status: "DEFERRED", orderUnits: 1 },
      now,
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  assert.deepEqual(await recordDeferral({ actor: dispatcher(), command: { orderId: "order-1", reason: "OTHER" }, now, store }), {
    ok: false,
    code: "invalid_input",
  });
  assert.deepEqual(await recordDeferral({ actor: dispatcher(), command: { orderId: "missing", reason: "NO_REEFER" }, now, store }), {
    ok: false,
    code: "not_found",
  });
  for (const actor of [manager(), loader(), driver()]) {
    assert.deepEqual(
      await recordDeferral({ actor, command: { orderId: "order-1", reason: "VAN_ACCESS" }, now, store }),
      { ok: false, code: "authorization_failure" },
    );
  }
  store.order.status = "SUBMITTED";
  assert.deepEqual(
    await recordDeferral({ actor: dispatcher(), command: { orderId: "order-1", reason: "WINDOW_CONFLICT" }, now, store }),
    { ok: false, code: "invalid_transition" },
  );
  store.order.status = "DELIVERED";
  assert.deepEqual(
    await recordDeferral({ actor: dispatcher(), command: { orderId: "order-1", reason: "TIME_BUDGET" }, now, store }),
    { ok: false, code: "invalid_transition" },
  );
  store.order.status = "PLANNED_ALLOCATED";
  store.order.hasTripStop = true;
  store.deferrals.push({
    id: "deferral-old",
    orderId: "order-1",
    reason: "DEPOT_MISMATCH",
    reportedAt: now,
  });
  assert.deepEqual(
    await recordDeferral({ actor: dispatcher(), command: { orderId: "order-1", reason: "NO_CAPACITY" }, now, store }),
    { ok: false, code: "invariant_violation" },
  );
  assert.equal(store.deferrals.length, 1);
  assert.equal(store.deferrals[0]?.reason, "DEPOT_MISMATCH");
  assert.equal(store.trips, 0);
  assert.equal(store.order.orderUnits, 10);
});

test("a failed deferral does not leave a deferral row on a confirmed order", async () => {
  const store = memoryStore();
  store.failTransition = true;
  const failed = await recordDeferral({
    actor: dispatcher(),
    command: { orderId: "order-1", reason: "NO_REEFER" },
    now,
    store,
  });
  assert.deepEqual(failed, { ok: false, code: "concurrency_conflict" });
  assert.equal(store.deferrals.length, 0);
  assert.equal(store.order.status, "CONFIRMED");
});

test("deferral uses the order transition and does not plan the order", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/domain/deferral.ts"), "utf8");
  const storeSource = readFileSync(resolve(root, "apps/api/src/domain/deferral-store.ts"), "utf8");
  assert.equal(source.includes("transitionOrder"), true);
  assert.equal(source.includes("to: \"DEFERRED\""), true);
  assert.equal(source.includes("PLANNED_ALLOCATED"), false);
  assert.equal(source.includes("km_per_l"), false);
  assert.equal(source.includes("Exception"), false);
  assert.equal(storeSource.includes("deferral.delete"), false);
  assert.equal(storeSource.includes("trip.create"), false);
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

type Memory = DeferralStore & {
  order: DeferralOrder;
  deferrals: StoredDeferral[];
  trips: number;
  failTransition: boolean;
};

function memoryStore(): Memory {
  const order: DeferralOrder = {
    id: "order-1",
    status: "CONFIRMED",
    hasTripStop: false,
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
    tempRequirement: "chilled",
    brand: "Fresh",
    district: "Colombo",
    depot: "Peliyagoda",
  };
  const deferrals: StoredDeferral[] = [];
  const state: Memory = {
    order,
    deferrals,
    trips: 0,
    failTransition: false,
    async transaction(work) {
      const snapshot = structuredClone({ order, deferrals });
      try {
        return await work(unit());
      } catch (error) {
        Object.assign(order, snapshot.order);
        deferrals.splice(0, deferrals.length, ...snapshot.deferrals);
        throw error;
      }
    },
  };
  return state;

  function unit(): import("./deferral.js").DeferralUnit {
    return {
      orders: orderStore(),
      async findOrder(id) {
        return id === order.id ? order : null;
      },
      async listByOrder(orderId) {
        return deferrals.filter((deferral) => deferral.orderId === orderId);
      },
      async create(input) {
        const deferral: StoredDeferral = {
          id: `deferral-${String(deferrals.length + 1)}`,
          orderId: input.orderId,
          reason: input.reason,
          reportedAt: input.reportedAt,
        };
        deferrals.push(deferral);
        return deferral;
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
          return id === order.id ? toStoredOrder(order) : null;
        },
        async findTransitionFacts() {
          return {
            tripStopCount: order.hasTripStop ? 1 : 0,
            deferralCount: deferrals.length,
            loaderUserIds: [],
            deliveryDriverUserIds: [],
          };
        },
        async create() {
          throw new Error("deferral does not create an order");
        },
        async compareAndSetStatus(input) {
          if (state.failTransition) {
            order.status = "PLANNED_ALLOCATED";
          }
          if (order.status !== input.expected) {
            return null;
          }
          order.status = input.next;
          return toStoredOrder(order);
        },
      };
    }
  }
}

function toStoredOrder(order: DeferralOrder): StoredOrder {
  return {
    id: order.id,
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId: "outlet-1",
    outletCode: "OUT001",
    brand: order.brand,
    district: order.district,
    depot: order.depot,
    createdByUserId: managerId,
    status: order.status,
    tempRequirement: order.tempRequirement,
    orderUnits: order.orderUnits,
    orderWeightKg: order.orderWeightKg,
    orderVolumeM3: order.orderVolumeM3,
    submittedAt: now,
  };
}
