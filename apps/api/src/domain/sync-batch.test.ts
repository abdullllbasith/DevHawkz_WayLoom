import assert from "node:assert/strict";
import test from "node:test";

import type { DeliveryStop, DeliveryStore, DeliveryUnit, StoredDelivery, StoredProof } from "./delivery.js";
import type { OrderActor, OrderStore, StoredOrder } from "./order.js";
import { applySyncBatch, type StoredSyncEvent, type SyncBatchStore } from "./sync-batch.js";

const now = new Date("2026-06-07T09:00:00.000Z");
const driverId = "33333333-3333-4333-8333-333333333333";
const otherDriverId = "33333333-3333-4333-8333-333333333334";
const stopId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const orderId = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";

test("the first sync event applies once and a replay does not repeat the delivery or proof", async () => {
  const world = memoryWorld();
  const outcome = event("sync-outcome-1", "delivery outcome", { outcome: "left at gate" });
  const first = await applySyncBatch({ actor: driver(), events: [outcome], now, store: world.sync });
  assert.deepEqual(first, [{ clientEventId: "sync-outcome-1", result: "applied" }]);
  assert.equal(world.deliveries.length, 1);

  const replay = await applySyncBatch({ actor: driver(), events: [outcome], now, store: world.sync });
  assert.deepEqual(replay, [{ clientEventId: "sync-outcome-1", result: "already applied" }]);
  assert.equal(world.deliveries.length, 1);

  const proof = event("sync-proof-1", "proof of delivery", { evidenceReference: "gate note" });
  const proved = await applySyncBatch({ actor: driver(), events: [proof], now, store: world.sync });
  assert.deepEqual(proved, [{ clientEventId: "sync-proof-1", result: "applied" }]);
  assert.equal(world.proofs.length, 1);
  const provedAgain = await applySyncBatch({
    actor: driver(),
    events: [{ ...proof, payload: { evidenceReference: "changed" }, attemptCount: 4 }],
    now,
    store: world.sync,
  });
  assert.deepEqual(provedAgain, [{ clientEventId: "sync-proof-1", result: "already applied" }]);
  assert.equal(world.proofs.length, 1);
});

test("sync batch keeps each event result and rejects invalid, secret, and unauthorized events", async () => {
  const world = memoryWorld();
  const results = await applySyncBatch({
    actor: driver(),
    events: [
      event("sync-outcome-1", "delivery outcome", { outcome: "left at gate" }),
      event("sync-bad", "loading shortfall", {}),
      event("sync-secret", "delivery outcome", { outcome: "left at gate", sessionToken: "secret" }),
      { clientEventId: "sync-empty" },
    ],
    now,
    store: world.sync,
  });
  assert.deepEqual(
    results.map((result) => result.result),
    ["applied", "validation rejected", "validation rejected", "validation rejected"],
  );
  assert.equal(results[1]?.clientEventId, "sync-bad");
  assert.equal(results[2]?.clientEventId, "sync-secret");
  assert.equal(world.deliveries.length, 1);

  const denied = await applySyncBatch({
    actor: driver(otherDriverId),
    events: [event("sync-other", "delivery outcome", { outcome: "left at gate" })],
    now,
    store: world.sync,
  });
  assert.equal(denied[0]?.result, "unauthorized");
  assert.equal(world.deliveries.length, 1);

  const second = await applySyncBatch({
    actor: driver(),
    events: [
      event("sync-proof-1", "proof of delivery", { evidenceReference: "gate note" }),
      event("sync-outcome-2", "delivery outcome", { outcome: "second try" }),
    ],
    now,
    store: world.sync,
  });
  assert.deepEqual(
    second.map((result) => result.result),
    ["applied", "conflict"],
  );
  assert.equal(world.proofs.length, 1);
  assert.equal(world.deliveries.length, 1);
});

function event(clientEventId: string, eventType: string, payload: Record<string, unknown>): Record<string, unknown> {
  return {
    clientEventId,
    eventType,
    targetId: stopId,
    clientCreatedAt: now.toISOString(),
    attemptCount: 1,
    payload,
  };
}

function driver(userId = driverId): OrderActor {
  return { userId, role: "DRIVER", assignedOutletIds: [] };
}

function memoryWorld(): { sync: SyncBatchStore; deliveries: StoredDelivery[]; proofs: StoredProof[] } {
  const stops: DeliveryStop[] = [
    {
      id: stopId,
      tripStatus: "CONFIRMED",
      vehicleDriverUserId: driverId,
      orderId,
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
  const syncRows: StoredSyncEvent[] = [];
  const deliveryStore: DeliveryStore = {
    transaction(work) {
      const snapshot = structuredClone({ stops, deliveries, proofs });
      return work(unit()).catch((error: unknown) => {
        stops.splice(0, stops.length, ...snapshot.stops);
        deliveries.splice(0, deliveries.length, ...snapshot.deliveries);
        proofs.splice(0, proofs.length, ...snapshot.proofs);
        throw error;
      });
    },
  };
  const sync: SyncBatchStore = {
    async findByClientEventId(clientEventId) {
      return syncRows.find((row) => row.clientEventId === clientEventId) ?? null;
    },
    async transaction(work) {
      const snapshot = syncRows.map((row) => ({ ...row }));
      try {
        return await work({
          deliveries: deliveryStore,
          async findByClientEventId(clientEventId) {
            return syncRows.find((row) => row.clientEventId === clientEventId) ?? null;
          },
          async claim(event) {
            if (syncRows.some((row) => row.clientEventId === event.clientEventId)) {
              return "conflict";
            }
            syncRows.push({ ...event });
            return "ok";
          },
          async release(clientEventId) {
            const index = syncRows.findIndex((row) => row.clientEventId === clientEventId);
            if (index >= 0) {
              syncRows.splice(index, 1);
            }
          },
          async recordError(clientEventId, errorCode) {
            const row = syncRows.find((item) => item.clientEventId === clientEventId);
            if (row !== undefined) {
              row.errorCode = errorCode;
            }
          },
        });
      } catch (error) {
        syncRows.splice(0, syncRows.length, ...snapshot);
        throw error;
      }
    },
  };
  return { sync, deliveries, proofs };

  function unit(): DeliveryUnit {
    return {
      orders: orderStore(),
      async findStop(id) {
        return stops.find((stop) => stop.id === id) ?? null;
      },
      async findDeliveryByStop(tripStopId) {
        return deliveries.find((delivery) => delivery.tripStopId === tripStopId) ?? null;
      },
      async createDelivery(input) {
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
  }

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
        return stop === undefined ? null : storedOrder(stop);
      },
      async findTransitionFacts(orderIdToFind) {
        const stop = stops.find((item) => item.orderId === orderIdToFind);
        return {
          tripStopCount: stop === undefined ? 0 : 1,
          deferralCount: 0,
          loaderUserIds: [],
          deliveryDriverUserIds: deliveries.filter((delivery) => delivery.tripStopId === stop?.id).map((delivery) => delivery.driverUserId),
        };
      },
      async create() {
        throw new Error("sync does not create an order");
      },
      async compareAndSetStatus(input) {
        const stop = stops.find((item) => item.orderId === input.id);
        if (stop === undefined || stop.orderStatus !== input.expected) {
          return null;
        }
        stop.orderStatus = input.next;
        return storedOrder(stop);
      },
    };
  }
}

function storedOrder(stop: DeliveryStop): StoredOrder {
  return {
    id: stop.orderId,
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    outletCode: "OUT001",
    brand: stop.brand,
    district: stop.district,
    depot: stop.depot,
    createdByUserId: "44444444-4444-4444-8444-444444444444",
    status: stop.orderStatus,
    tempRequirement: stop.tempRequirement,
    orderUnits: stop.orderUnits,
    orderWeightKg: stop.orderWeightKg,
    orderVolumeM3: stop.orderVolumeM3,
    submittedAt: now,
  };
}
