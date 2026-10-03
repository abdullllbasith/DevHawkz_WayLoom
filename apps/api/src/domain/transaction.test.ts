import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { persistenceCode } from "./domain-transaction.js";
import type { OrderActor, OrderStore, StoredOrder } from "./order.js";
import { confirmReceipt, type StoredReceipt } from "./receipt.js";
import { confirmTrip, type StoredTrip } from "./trip.js";

const now = new Date("2026-06-02T14:00:00.000Z");
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const managerId = "44444444-4444-4444-8444-444444444444";
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

test("a serialization conflict is a concurrency failure and does not reveal the database error", () => {
  const error = Object.assign(new Error("update where password = secret"), { code: "P2034" });
  assert.equal(persistenceCode(error), "concurrency_conflict");
  assert.equal(persistenceCode(new Error("password hash session csrf")), "persistence_failure");
  assert.equal(JSON.stringify(persistenceCode(error)).includes("password"), false);
});

test("multi-record domain writes share one serializable transaction and the routes do not open one", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  for (const file of [
    "apps/api/src/domain/trip-store.ts",
    "apps/api/src/domain/loading-store.ts",
    "apps/api/src/domain/delivery-store.ts",
    "apps/api/src/domain/deferral-store.ts",
    "apps/api/src/domain/receipt-store.ts",
  ]) {
    const source = readFileSync(resolve(root, file), "utf8");
    assert.equal(source.includes("domainTransactionOptions"), true, file);
  }
  const routes = readFileSync(resolve(root, "apps/api/src/api/core-routes.ts"), "utf8");
  assert.equal(routes.includes("$transaction"), false);
  const options = readFileSync(resolve(root, "apps/api/src/domain/domain-transaction.ts"), "utf8");
  assert.equal(options.includes("Serializable"), true);
  assert.equal(options.includes("localStorage"), false);
});

test("a trip confirmation that conflicts after the status write rolls back", async () => {
  const trip = plannedTrip();
  const result = await confirmTrip({
    actor: dispatcher(),
    tripId: trip.id,
    store: {
      async transaction(work) {
        const snapshot = trip.status;
        try {
          await work(unit());
          throw conflict();
        } catch (error) {
          trip.status = snapshot;
          throw error;
        }
      },
    },
  });
  assert.deepEqual(result, { ok: false, code: "concurrency_conflict" });
  assert.equal(trip.status, "PLANNED");

  function unit(): import("./trip.js").TripUnit {
    return {
      orders: unusedOrders(),
      async findVehicle() { return null; },
      async findAllocationOrder() { return null; },
      async findTripById() { return trip; },
      async tripSlotTaken() { return false; },
      async countTrips() { return 1; },
      async routeTaken() { return false; },
      async orderHasStop() { return false; },
      async createTrip() { throw new Error("not used"); },
      async createStop() { throw new Error("not used"); },
      async recordTripDispatched() {
        return undefined;
      },
      async compareAndSetTripStatus(_id, expected, next) {
        if (trip.status !== expected) return null;
        trip.status = next;
        return trip;
      },
    };
  }
});

test("a receipt confirmation that conflicts after the receipt write rolls back", async () => {
  const receipts: StoredReceipt[] = [];
  let status: StoredOrder["status"] = "DELIVERED";
  const result = await confirmReceipt({
    actor: manager(),
    command: { deliveryRecordId: "delivery-1", result: "accepted" },
    now,
    store: {
      async transaction(work) {
        const snapshot = { receipts: structuredClone(receipts), status };
        try {
          await work(unit());
          throw conflict();
        } catch (error) {
          receipts.splice(0, receipts.length, ...snapshot.receipts);
          status = snapshot.status;
          throw error;
        }
      },
    },
  });
  assert.deepEqual(result, { ok: false, code: "concurrency_conflict" });
  assert.equal(receipts.length, 0);
  assert.equal(status, "DELIVERED");

  function unit(): import("./receipt.js").ReceiptUnit {
    return {
      orders: {
        ...unusedOrders(),
        async findById() { return stored(status); },
        async findTransitionFacts() {
          return { tripStopCount: 1, deferralCount: 0, loaderUserIds: [], deliveryDriverUserIds: [dispatcherId] };
        },
        async compareAndSetStatus(input) {
          if (status !== input.expected) return null;
          status = input.next;
          return stored(status);
        },
      },
      async findDelivery() {
        return {
          id: "delivery-1",
          orderId: "order-1",
          orderStatus: status,
          outletId: outletA,
          orderUnits: 10,
          orderWeightKg: "12.5",
          orderVolumeM3: "1.25",
          tempRequirement: "chilled",
          brand: "Fresh",
          district: "Colombo",
          depot: "Peliyagoda",
          outcome: "left at gate",
          hasReceipt: receipts.length > 0,
        };
      },
      async create(input) {
        const receipt: StoredReceipt = {
          id: "receipt-1",
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
  }
});

function conflict(): Error {
  return Object.assign(new Error("could not serialize access"), { code: "P2034" });
}

function plannedTrip(): StoredTrip {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
    routeId: null,
    operationalDate: "2026-06-02",
    vehicleId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    depot: "Peliyagoda",
    tripNumber: 1,
    status: "PLANNED",
    stops: [],
  };
}

function dispatcher(): OrderActor {
  return { userId: dispatcherId, role: "DISPATCHER", assignedOutletIds: [] };
}

function manager(): OrderActor {
  return { userId: managerId, role: "STORE_MANAGER", assignedOutletIds: [outletA] };
}

function stored(status: StoredOrder["status"]): StoredOrder {
  return {
    id: "order-1",
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId: outletA,
    outletCode: "OUT001",
    brand: "Fresh",
    district: "Colombo",
    depot: "Peliyagoda",
    createdByUserId: managerId,
    status,
    tempRequirement: "chilled",
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
    submittedAt: now,
  };
}

function unusedOrders(): OrderStore {
  return {
    async findOutletById() { return null; },
    async findByDeliveryId() { return null; },
    async findById() { return null; },
    async findTransitionFacts() { return { tripStopCount: 0, deferralCount: 0, loaderUserIds: [], deliveryDriverUserIds: [] }; },
    async create() { throw new Error("not used"); },
    async compareAndSetStatus() { return null; },
  };
}
