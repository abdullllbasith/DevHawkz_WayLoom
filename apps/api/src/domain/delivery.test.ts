import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { recordDelivery, recordProof, type DeliveryStop, type DeliveryStore, type StoredDelivery, type StoredProof } from "./delivery.js";
import type { OrderActor, OrderStore, StoredOrder } from "./order.js";

const now = new Date("2026-06-02T11:00:00.000Z");
const driverId = "33333333-3333-4333-8333-333333333333";
const otherDriverId = "33333333-3333-4333-8333-333333333334";
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const managerId = "44444444-4444-4444-8444-444444444444";

test("the assigned driver records a delivery and can attach proof without confirming receipt", async () => {
  const store = memoryStore();
  const recorded = await recordDelivery({
    actor: driver(),
    command: { tripStopId: "stop-1", outcome: "left at gate", deliveredUnits: 10, notes: "received by staff" },
    now,
    store,
  });
  assert.equal(recorded.ok, true);
  if (!recorded.ok) {
    return;
  }
  assert.equal(recorded.delivery.driverUserId, driverId);
  assert.equal(recorded.delivery.tripStopId, "stop-1");
  assert.equal(recorded.delivery.outcome, "left at gate");
  assert.equal(recorded.delivery.deliveredUnits, 10);
  assert.equal(recorded.delivery.deliveredAt.toISOString(), now.toISOString());
  assert.equal(store.stops[0]?.orderStatus, "DELIVERED");
  assert.equal(store.stops[0]?.orderUnits, 10);
  assert.equal(store.stops[0]?.orderWeightKg, "12.5");
  assert.equal(store.stops[0]?.tempRequirement, "chilled");
  assert.equal(store.stops[0]?.brand, "Fresh");
  assert.equal(store.receipts, 0);
  const proof = await recordProof({
    actor: driver(),
    command: { tripStopId: "stop-1", evidenceReference: "pod-note-1" },
    now,
    store,
  });
  assert.equal(proof.ok, true);
  if (!proof.ok) {
    return;
  }
  assert.equal(proof.proof.deliveryRecordId, recorded.delivery.id);
  assert.equal(proof.proof.evidenceReference, "pod-note-1");
  assert.equal(proof.proof.capturedByUserId, driverId);
  assert.equal(store.stops[0]?.orderStatus, "DELIVERED");
  assert.equal(store.deliveries.length, 1);
  assert.equal(store.proofs.length, 1);
  const repeated = await recordDelivery({
    actor: driver(),
    command: { tripStopId: "stop-1", outcome: "left at gate" },
    now,
    store,
  });
  assert.deepEqual(repeated, { ok: false, code: "lifecycle_conflict" });
  assert.equal(store.deliveries.length, 1);
});

test("delivery rejects the wrong actor, an early stop, and a direct receipt status", async () => {
  const store = memoryStore();
  assert.deepEqual(
    await recordDelivery({
      actor: driver(),
      command: { tripStopId: "stop-1", outcome: "left at gate", role: "DISPATCHER", actorUserId: dispatcherId },
      now,
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  assert.deepEqual(
    await recordDelivery({
      actor: driver(),
      command: { tripStopId: "stop-1", outcome: "left at gate", status: "RECEIPT_CONFIRMED" },
      now,
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  assert.deepEqual(await recordDelivery({ actor: driver(), command: { tripStopId: "stop-1", outcome: 1 }, now, store }), {
    ok: false,
    code: "invalid_input",
  });
  for (const actor of [dispatcher(), loader(), manager()]) {
    assert.deepEqual(
      await recordDelivery({ actor, command: { tripStopId: "stop-1", outcome: "left at gate" }, now, store }),
      { ok: false, code: "authorization_failure" },
    );
  }
  assert.deepEqual(
    await recordDelivery({ actor: driver(otherDriverId), command: { tripStopId: "stop-1", outcome: "left at gate" }, now, store }),
    { ok: false, code: "object_scope_failure" },
  );
  store.stops[0].vehicleDriverUserId = null;
  assert.deepEqual(
    await recordDelivery({ actor: driver(), command: { tripStopId: "stop-1", outcome: "left at gate" }, now, store }),
    { ok: false, code: "object_scope_failure" },
  );
  store.stops[0].vehicleDriverUserId = driverId;
  assert.deepEqual(await recordDelivery({ actor: driver(), command: { tripStopId: "missing", outcome: "left at gate" }, now, store }), {
    ok: false,
    code: "not_found",
  });
  store.stops[0].orderStatus = "LOADED";
  assert.deepEqual(
    await recordDelivery({ actor: driver(), command: { tripStopId: "stop-1", outcome: "left at gate" }, now, store }),
    { ok: false, code: "invalid_transition" },
  );
  store.stops[0].orderStatus = "RECEIPT_CONFIRMED";
  assert.deepEqual(
    await recordDelivery({ actor: driver(), command: { tripStopId: "stop-1", outcome: "left at gate" }, now, store }),
    { ok: false, code: "invalid_transition" },
  );
  store.stops[0].orderStatus = "DISPATCHED";
  assert.deepEqual(await recordProof({ actor: driver(), command: { tripStopId: "stop-1", evidenceReference: "pod-note-1" }, now, store }), {
    ok: false,
    code: "prerequisite_missing",
  });
  assert.deepEqual(await recordProof({ actor: driver(), command: { tripStopId: "stop-1", evidenceReference: " " }, now, store }), {
    ok: false,
    code: "invalid_input",
  });
  assert.equal(store.deliveries.length, 0);
  assert.equal(store.stops[0]?.orderStatus, "DISPATCHED");
  assert.equal(store.receipts, 0);
});

test("a failed or conflicting delivery does not leave the order delivered", async () => {
  const store = memoryStore();
  store.failTransition = true;
  const failed = await recordDelivery({
    actor: driver(),
    command: { tripStopId: "stop-1", outcome: "left at gate" },
    now,
    store,
  });
  assert.deepEqual(failed, { ok: false, code: "concurrency_conflict" });
  assert.equal(store.deliveries.length, 0);
  assert.equal(store.stops[0]?.orderStatus, "DISPATCHED");
  store.failTransition = false;
  store.conflictOnCreate = true;
  const raced = await recordDelivery({
    actor: driver(),
    command: { tripStopId: "stop-1", outcome: "left at gate" },
    now,
    store,
  });
  assert.deepEqual(raced, { ok: false, code: "concurrency_conflict" });
  assert.equal(store.deliveries.length, 0);
  assert.equal(store.stops[0]?.orderUnits, 10);
});

test("delivery uses the order transition and does not confirm a receipt", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/domain/delivery.ts"), "utf8");
  const storeSource = readFileSync(resolve(root, "apps/api/src/domain/delivery-store.ts"), "utf8");
  assert.equal(source.includes("transitionOrder"), true);
  assert.equal(source.includes("to: \"DELIVERED\""), true);
  assert.equal(source.includes("RECEIPT_CONFIRMED"), false);
  assert.equal(source.includes("localStorage"), false);
  assert.equal(storeSource.includes("receipt.create"), false);
  assert.equal(storeSource.includes("order.update"), false);
});

function driver(userId = driverId): OrderActor {
  return { userId, role: "DRIVER", assignedOutletIds: [] };
}

function dispatcher(): OrderActor {
  return { userId: dispatcherId, role: "DISPATCHER", assignedOutletIds: [] };
}

function loader(): OrderActor {
  return { userId: loaderId, role: "LOADER", assignedOutletIds: [] };
}

function manager(): OrderActor {
  return { userId: managerId, role: "STORE_MANAGER", assignedOutletIds: ["outlet-1"] };
}

type Memory = DeliveryStore & {
  stops: DeliveryStop[];
  deliveries: StoredDelivery[];
  proofs: StoredProof[];
  receipts: number;
  failTransition: boolean;
  conflictOnCreate: boolean;
};

function memoryStore(): Memory {
  const stops: DeliveryStop[] = [
    {
      id: "stop-1",
      tripStatus: "CONFIRMED",
      vehicleDriverUserId: driverId,
      orderId: "order-1",
      orderStatus: "DISPATCHED",
      orderUnits: 10,
      orderWeightKg: "12.5",
      orderVolumeM3: "1.25",
      tempRequirement: "chilled",
      brand: "Fresh",
      district: "Colombo",
      depot: "Peliyagoda",
    },
  ];
  const deliveries: StoredDelivery[] = [];
  const proofs: StoredProof[] = [];
  const state: Memory = {
    stops,
    deliveries,
    proofs,
    receipts: 0,
    failTransition: false,
    conflictOnCreate: false,
    async transaction(work) {
      const snapshot = structuredClone({ stops, deliveries, proofs });
      try {
        return await work(unit());
      } catch (error) {
        stops.splice(0, stops.length, ...snapshot.stops);
        deliveries.splice(0, deliveries.length, ...snapshot.deliveries);
        proofs.splice(0, proofs.length, ...snapshot.proofs);
        throw error;
      }
    },
  };
  return state;

  function unit(): import("./delivery.js").DeliveryUnit {
    return {
      orders: orderStore(),
      async findStop(id) {
        return stops.find((stop) => stop.id === id) ?? null;
      },
      async findDeliveryByStop(tripStopId) {
        return deliveries.find((delivery) => delivery.tripStopId === tripStopId) ?? null;
      },
      async createDelivery(input) {
        if (state.conflictOnCreate) {
          return "conflict";
        }
        const delivery: StoredDelivery = {
          id: `delivery-${String(deliveries.length + 1)}`,
          tripStopId: input.tripStopId,
          driverUserId: input.driverUserId,
          deliveredAt: input.deliveredAt,
          outcome: input.outcome,
          deliveredUnits: input.deliveredUnits,
          notes: input.notes,
        };
        deliveries.push(delivery);
        return delivery;
      },
      async createProof(input) {
        const proof: StoredProof = {
          id: `proof-${String(proofs.length + 1)}`,
          deliveryRecordId: input.deliveryRecordId,
          evidenceReference: input.evidenceReference,
          capturedAt: input.capturedAt,
          capturedByUserId: input.capturedByUserId,
        };
        proofs.push(proof);
        return proof;
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
            loaderUserIds: [],
            deliveryDriverUserIds: deliveries
              .filter((delivery) => delivery.tripStopId === stop?.id)
              .map((delivery) => delivery.driverUserId),
          };
        },
        async create() {
          throw new Error("delivery does not create an order");
        },
        async compareAndSetStatus(input) {
          const stop = stops.find((item) => item.orderId === input.id);
          if (stop === undefined) {
            return null;
          }
          if (state.failTransition) {
            stop.orderStatus = "LOADED";
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

function toStoredOrder(stop: DeliveryStop): StoredOrder {
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
    tempRequirement: stop.tempRequirement,
    orderUnits: stop.orderUnits,
    orderWeightKg: stop.orderWeightKg,
    orderVolumeM3: stop.orderVolumeM3,
    submittedAt: now,
  };
}
