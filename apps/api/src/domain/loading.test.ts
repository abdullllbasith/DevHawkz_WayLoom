import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { reportShortfall, verifyLoading, type LoadingStop, type LoadingStore, type StoredLoading } from "./loading.js";
import type { OrderActor, OrderStore, StoredOrder } from "./order.js";

const now = new Date("2026-06-02T09:00:00.000Z");
const later = new Date("2026-06-02T09:30:00.000Z");
const loaderId = "22222222-2222-4222-8222-222222222222";
const otherLoaderId = "22222222-2222-4222-8222-222222222223";
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const driverId = "33333333-3333-4333-8333-333333333333";
const managerId = "44444444-4444-4444-8444-444444444444";

test("an assigned loader verifies a confirmed stop and can report the shortfall once", async () => {
  const store = memoryStore();
  const verified = await verifyLoading({
    actor: loader(),
    command: { tripStopId: "stop-1", loadedUnits: 8 },
    now,
    store,
  });
  assert.equal(verified.ok, true);
  if (!verified.ok) {
    return;
  }
  assert.equal(verified.loading.loaderUserId, loaderId);
  assert.equal(verified.loading.tripStopId, "stop-1");
  assert.equal(verified.loading.expectedUnits, 10);
  assert.equal(verified.loading.loadedUnits, 8);
  assert.equal(verified.loading.shortfallUnits, null);
  assert.equal(verified.loading.verifiedAt.toISOString(), now.toISOString());
  assert.equal(store.stops[0]?.orderStatus, "LOADED");
  assert.equal(store.stops[0]?.orderUnits, 10);
  assert.equal(store.stops[0]?.orderWeightKg, "12.5");
  assert.equal(store.stops[0]?.brand, "Fresh");
  assert.equal(store.stops[0]?.depot, "Peliyagoda");
  const reported = await reportShortfall({
    actor: loader(),
    command: { tripStopId: "stop-1", shortfallUnits: 2, details: "two cases short" },
    now: later,
    store,
  });
  assert.equal(reported.ok, true);
  if (!reported.ok) {
    return;
  }
  assert.equal(reported.loading.id, verified.loading.id);
  assert.equal(reported.loading.shortfallUnits, 2);
  assert.equal(reported.loading.details, "two cases short");
  assert.equal(reported.loading.loadedUnits, 8);
  assert.equal(reported.loading.expectedUnits, 10);
  assert.equal(store.stops[0]?.orderUnits, 10);
  assert.equal(store.stops[0]?.orderWeightKg, "12.5");
  assert.equal(store.records.length, 1);
  const repeated = await reportShortfall({
    actor: loader(),
    command: { tripStopId: "stop-1", shortfallUnits: 4 },
    now: later,
    store,
  });
  assert.deepEqual(repeated, { ok: false, code: "lifecycle_conflict" });
  assert.equal(store.records[0]?.shortfallUnits, 2);
});

test("loading rejects the wrong actor, the wrong stop, and a direct status change", async () => {
  const store = memoryStore();
  assert.deepEqual(
    await verifyLoading({
      actor: loader(),
      command: { tripStopId: "stop-1", loadedUnits: 8, role: "DISPATCHER", actorUserId: dispatcherId },
      now,
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  assert.deepEqual(
    await verifyLoading({
      actor: loader(),
      command: { tripStopId: "stop-1", loadedUnits: 8, status: "LOADED", expectedUnits: 1 },
      now,
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  for (const actor of [dispatcher(), driver(), manager()]) {
    assert.deepEqual(await verifyLoading({ actor, command: { tripStopId: "stop-1", loadedUnits: 8 }, now, store }), {
      ok: false,
      code: "authorization_failure",
    });
  }
  assert.deepEqual(await verifyLoading({ actor: loader(), command: { tripStopId: "missing", loadedUnits: 8 }, now, store }), {
    ok: false,
    code: "not_found",
  });
  assert.deepEqual(await verifyLoading({ actor: loader(), command: { tripStopId: "stop-1", loadedUnits: -1 }, now, store }), {
    ok: false,
    code: "invalid_input",
  });
  store.stops[0].tripStatus = "PLANNED";
  assert.deepEqual(await verifyLoading({ actor: loader(), command: { tripStopId: "stop-1", loadedUnits: 8 }, now, store }), {
    ok: false,
    code: "invalid_transition",
  });
  store.stops[0].tripStatus = "CONFIRMED";
  store.stops[0].orderStatus = "DISPATCHED";
  assert.deepEqual(await verifyLoading({ actor: loader(), command: { tripStopId: "stop-1", loadedUnits: 8 }, now, store }), {
    ok: false,
    code: "invalid_transition",
  });
  store.stops[0].orderStatus = "PLANNED_ALLOCATED";
  const verified = await verifyLoading({ actor: loader(), command: { tripStopId: "stop-1", loadedUnits: 10 }, now, store });
  assert.equal(verified.ok, true);
  assert.deepEqual(
    await verifyLoading({ actor: loader(otherLoaderId), command: { tripStopId: "stop-1", loadedUnits: 10 }, now, store }),
    { ok: false, code: "object_scope_failure" },
  );
  assert.deepEqual(await verifyLoading({ actor: loader(), command: { tripStopId: "stop-1", loadedUnits: 10 }, now, store }), {
    ok: false,
    code: "lifecycle_conflict",
  });
  assert.deepEqual(
    await reportShortfall({ actor: loader(otherLoaderId), command: { tripStopId: "stop-1", shortfallUnits: 1 }, now, store }),
    { ok: false, code: "object_scope_failure" },
  );
  assert.equal(store.records.length, 1);
  assert.equal(store.stops[0]?.orderUnits, 10);
});

test("a shortfall needs the loader record and a failed verification leaves the order allocated", async () => {
  const store = memoryStore();
  assert.deepEqual(await reportShortfall({ actor: loader(), command: { tripStopId: "stop-1", shortfallUnits: 1 }, now, store }), {
    ok: false,
    code: "prerequisite_missing",
  });
  store.failSecondTransition = true;
  const failed = await verifyLoading({ actor: loader(), command: { tripStopId: "stop-1", loadedUnits: 8 }, now, store });
  assert.deepEqual(failed, { ok: false, code: "concurrency_conflict" });
  assert.equal(store.records.length, 0);
  assert.equal(store.stops[0]?.orderStatus, "PLANNED_ALLOCATED");
  store.failSecondTransition = false;
  store.conflictOnCreate = true;
  const raced = await verifyLoading({ actor: loader(), command: { tripStopId: "stop-1", loadedUnits: 8 }, now, store });
  assert.deepEqual(raced, { ok: false, code: "concurrency_conflict" });
  assert.equal(store.records.length, 0);
  assert.equal(store.stops[0]?.orderStatus, "PLANNED_ALLOCATED");
});

test("loading verification uses the order transition and does not start delivery", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/domain/loading.ts"), "utf8");
  const storeSource = readFileSync(resolve(root, "apps/api/src/domain/loading-store.ts"), "utf8");
  assert.equal(source.includes("transitionOrder"), true);
  assert.equal(source.includes("DeliveryRecord"), false);
  assert.equal(source.includes("LOADING"), true);
  assert.equal(storeSource.includes("expectedUnits: input.expectedUnits"), true);
  assert.equal(storeSource.includes("order.update"), false);
  assert.equal(storeSource.includes("deliveryRecord"), false);
});

function loader(userId = loaderId): OrderActor {
  return { userId, role: "LOADER", assignedOutletIds: [] };
}

function dispatcher(): OrderActor {
  return { userId: dispatcherId, role: "DISPATCHER", assignedOutletIds: [] };
}

function driver(): OrderActor {
  return { userId: driverId, role: "DRIVER", assignedOutletIds: [] };
}

function manager(): OrderActor {
  return { userId: managerId, role: "STORE_MANAGER", assignedOutletIds: ["outlet-1"] };
}

type Memory = LoadingStore & {
  stops: LoadingStop[];
  records: StoredLoading[];
  failSecondTransition: boolean;
  conflictOnCreate: boolean;
};

function memoryStore(): Memory {
  const stops: LoadingStop[] = [
    {
      id: "stop-1",
      tripStatus: "CONFIRMED",
      orderId: "order-1",
      orderStatus: "PLANNED_ALLOCATED",
      orderUnits: 10,
      orderWeightKg: "12.5",
      orderVolumeM3: "1.25",
      brand: "Fresh",
      district: "Colombo",
      depot: "Peliyagoda",
    },
  ];
  const records: StoredLoading[] = [];
  const state: Memory = {
    stops,
    records,
    failSecondTransition: false,
    conflictOnCreate: false,
    async transaction(work) {
      const snapshot = structuredClone({ stops, records });
      try {
        return await work(unit());
      } catch (error) {
        stops.splice(0, stops.length, ...snapshot.stops);
        records.splice(0, records.length, ...snapshot.records);
        throw error;
      }
    },
  };
  return state;

  function unit(): import("./loading.js").LoadingUnit {
    let transitions = 0;
    return {
      orders: orderStore(),
      async findStop(id) {
        return stops.find((stop) => stop.id === id) ?? null;
      },
      async findByStop(tripStopId) {
        return records.find((record) => record.tripStopId === tripStopId) ?? null;
      },
      async create(input) {
        if (state.conflictOnCreate) {
          return "conflict";
        }
        const record: StoredLoading = {
          id: `loading-${String(records.length + 1)}`,
          tripStopId: input.tripStopId,
          loaderUserId: input.loaderUserId,
          expectedUnits: input.expectedUnits,
          loadedUnits: input.loadedUnits,
          shortfallUnits: null,
          verifiedAt: input.verifiedAt,
          shortfallReportedAt: null,
          details: null,
        };
        records.push(record);
        return record;
      },
      async recordShortfall(input) {
        const record = records.find((item) => item.id === input.id);
        if (record === undefined || record.shortfallReportedAt !== null) {
          return null;
        }
        record.shortfallUnits = input.shortfallUnits;
        record.shortfallReportedAt = input.reportedAt;
        record.details = input.details;
        return record;
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
          const stop = stops.find((item) => item.orderId === id);
          return stop === undefined ? null : toStoredOrder(stop);
        },
        async findTransitionFacts(orderId) {
          const stop = stops.find((item) => item.orderId === orderId);
          return {
            tripStopCount: stop === undefined ? 0 : 1,
            deferralCount: 0,
            loaderUserIds: records.filter((record) => record.tripStopId === stop?.id).map((record) => record.loaderUserId),
            deliveryDriverUserIds: [],
          };
        },
        async create() {
          throw new Error("loading does not create an order");
        },
        async compareAndSetStatus(input) {
          transitions += 1;
          const stop = stops.find((item) => item.orderId === input.id);
          if (stop === undefined) {
            return null;
          }
          if (state.failSecondTransition && transitions === 2) {
            stop.orderStatus = "DISPATCHED";
          }
          if (stop.orderStatus !== input.expected) {
            return null;
          }
          stop.orderStatus = input.next;
          return toStoredOrder(stop);
        },
      };
    }
  }
}

function toStoredOrder(stop: LoadingStop): StoredOrder {
  return {
    id: stop.orderId,
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId: "outlet-1",
    outletCode: "OUT001",
    brand: stop.brand,
    district: stop.district,
    depot: stop.depot,
    createdByUserId: managerId,
    status: stop.orderStatus,
    tempRequirement: "chilled",
    orderUnits: stop.orderUnits,
    orderWeightKg: stop.orderWeightKg,
    orderVolumeM3: stop.orderVolumeM3,
    submittedAt: now,
  };
}
