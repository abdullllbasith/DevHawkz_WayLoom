import assert from "node:assert/strict";
import test from "node:test";

import { recordDelivery, type DeliveryStore, type StoredDelivery } from "./delivery.js";
import { verifyLoading, type LoadingStore, type StoredLoading } from "./loading.js";
import { submitOrder, type OrderActor, type OrderStatusName, type OrderStore, type OrderTransitionFacts, type StoredOrder } from "./order.js";
import { confirmReceipt, type ReceiptStore, type StoredReceipt } from "./receipt.js";
import { confirmTrip, type StoredTrip, type TripStore } from "./trip.js";

const now = new Date("2026-06-02T14:00:00.000Z");
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const driverId = "33333333-3333-4333-8333-333333333333";
const managerId = "44444444-4444-4444-8444-444444444444";
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

test("two submissions of one draft leave a single submitted order", async () => {
  const order = stored("DRAFT");
  order.submittedAt = null;
  const store = orderStore([order], () => emptyFacts());
  const [first, second] = await Promise.all([
    submitOrder({ actor: manager(), orderId: order.id, now, store }),
    submitOrder({ actor: manager(), orderId: order.id, now, store }),
  ]);
  const results = [first, second];
  assert.equal(results.filter((item) => item.ok).length, 1);
  assert.equal(results.some((item) => !item.ok && item.code === "concurrency_conflict"), true);
  assert.equal(order.status, "SUBMITTED");
  assert.equal(order.orderUnits, 10);
  assert.equal(order.orderWeightKg, "12.5");
  assert.equal(order.orderVolumeM3, "1.25");
});

test("two confirmations leave one confirmed trip", async () => {
  const trip = plannedTrip();
  const gate = serializable();
  const store: TripStore = {
    transaction(work) {
      return gate(async () => {
        const snapshot = trip.status;
        try {
          return await work(tripUnit(trip));
        } catch (error) {
          trip.status = snapshot;
          throw error;
        }
      });
    },
  };
  const [first, second] = await Promise.all([
    confirmTrip({ actor: dispatcher(), tripId: trip.id, store }),
    confirmTrip({ actor: dispatcher(), tripId: trip.id, store }),
  ]);
  const results = [first, second];
  assert.equal(results.filter((item) => item.ok).length, 1);
  assert.equal(results.some((item) => !item.ok && (item.code === "lifecycle_conflict" || item.code === "concurrency_conflict")), true);
  assert.equal(trip.status, "CONFIRMED");
  assert.equal(trip.stops.length, 0);
});

test("two loading verifications leave one loaded order and its source quantity", async () => {
  const order = stored("PLANNED_ALLOCATED");
  const records: StoredLoading[] = [];
  const gate = serializable();
  const store: LoadingStore = {
    transaction(work) {
      return gate(async () => {
        const snapshot = { status: order.status, records: structuredClone(records) };
        try {
          return await work(loadingUnit(order, records));
        } catch (error) {
          order.status = snapshot.status;
          records.splice(0, records.length, ...snapshot.records);
          throw error;
        }
      });
    },
  };
  const [first, second] = await Promise.all([
    verifyLoading({ actor: loader(), command: { tripStopId: "stop-1", loadedUnits: 8 }, now, store }),
    verifyLoading({ actor: loader(), command: { tripStopId: "stop-1", loadedUnits: 9 }, now, store }),
  ]);
  const results = [first, second];
  assert.equal(results.filter((item) => item.ok).length, 1);
  assert.equal(results.some((item) => !item.ok && (item.code === "lifecycle_conflict" || item.code === "concurrency_conflict")), true);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.expectedUnits, 10);
  assert.equal(order.status, "LOADED");
  assert.equal(order.orderUnits, 10);
});

test("two deliveries leave one delivered order and one outcome", async () => {
  const order = stored("DISPATCHED");
  const deliveries: StoredDelivery[] = [];
  const gate = serializable();
  const store: DeliveryStore = {
    transaction(work) {
      return gate(async () => {
        const snapshot = { status: order.status, deliveries: structuredClone(deliveries) };
        try {
          return await work(deliveryUnit(order, deliveries));
        } catch (error) {
          order.status = snapshot.status;
          deliveries.splice(0, deliveries.length, ...snapshot.deliveries);
          throw error;
        }
      });
    },
  };
  const [first, second] = await Promise.all([
    recordDelivery({ actor: driver(), command: { tripStopId: "stop-1", outcome: "left at gate" }, now, store }),
    recordDelivery({ actor: driver(), command: { tripStopId: "stop-1", outcome: "handed over" }, now, store }),
  ]);
  const results = [first, second];
  assert.equal(results.filter((item) => item.ok).length, 1);
  assert.equal(results.some((item) => !item.ok && (item.code === "lifecycle_conflict" || item.code === "concurrency_conflict")), true);
  assert.equal(deliveries.length, 1);
  assert.equal(order.status, "DELIVERED");
  assert.equal(order.orderUnits, 10);
});

test("two receipt confirmations leave one receipt and the delivered facts", async () => {
  const order = stored("DELIVERED");
  const receipts: StoredReceipt[] = [];
  const gate = serializable();
  const store: ReceiptStore = {
    transaction(work) {
      return gate(async () => {
        const snapshot = { status: order.status, receipts: structuredClone(receipts) };
        try {
          return await work(receiptUnit(order, receipts));
        } catch (error) {
          order.status = snapshot.status;
          receipts.splice(0, receipts.length, ...snapshot.receipts);
          throw error;
        }
      });
    },
  };
  const command = { deliveryRecordId: "delivery-1", result: "accepted" };
  const [first, second] = await Promise.all([
    confirmReceipt({ actor: manager(), command, now, store }),
    confirmReceipt({ actor: manager(), command, now, store }),
  ]);
  const results = [first, second];
  assert.equal(results.filter((item) => item.ok).length, 1);
  assert.equal(results.some((item) => !item.ok && (item.code === "lifecycle_conflict" || item.code === "concurrency_conflict")), true);
  assert.equal(receipts.length, 1);
  assert.equal(order.status, "RECEIPT_CONFIRMED");
  assert.equal(order.orderUnits, 10);
  assert.equal(order.orderWeightKg, "12.5");
});

function serializable(): <T>(work: () => Promise<T>) => Promise<T> {
  let chain = Promise.resolve();
  return (work) => {
    const run = chain.then(work, work);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };
}

function orderStore(orders: StoredOrder[], factsFor: (orderId: string) => OrderTransitionFacts): OrderStore {
  return {
    async findOutletById() { return null; },
    async findByDeliveryId() { return null; },
    async findById(id) {
      const found = orders.find((item) => item.id === id);
      return found === undefined ? null : { ...found };
    },
    async findTransitionFacts(orderId) { return factsFor(orderId); },
    async create() { throw new Error("not used"); },
    async compareAndSetStatus(input) {
      const current = orders.find((item) => item.id === input.id);
      if (current === undefined || current.status !== input.expected) return null;
      current.status = input.next;
      if (input.next === "SUBMITTED") current.submittedAt = input.submittedAt;
      return current;
    },
  };
}

function tripUnit(trip: StoredTrip): import("./trip.js").TripUnit {
  return {
    orders: orderStore([], () => emptyFacts()),
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

function loadingUnit(order: StoredOrder, records: StoredLoading[]): import("./loading.js").LoadingUnit {
  return {
    orders: orderStore([order], () => ({
      tripStopCount: 1,
      deferralCount: 0,
      loaderUserIds: records.map((item) => item.loaderUserId),
      deliveryDriverUserIds: [],
    })),
    async findStop() {
      return {
        id: "stop-1",
        tripStatus: "CONFIRMED",
        orderId: order.id,
        orderStatus: order.status,
        orderUnits: order.orderUnits,
        orderWeightKg: order.orderWeightKg,
        orderVolumeM3: order.orderVolumeM3,
        brand: order.brand,
        district: order.district,
        depot: order.depot,
      };
    },
    async findByStop(tripStopId) { return records.find((item) => item.tripStopId === tripStopId) ?? null; },
    async create(input) {
      if (records.some((item) => item.tripStopId === input.tripStopId)) return "conflict";
      const row: StoredLoading = {
        id: "loading-1",
        tripStopId: input.tripStopId,
        loaderUserId: input.loaderUserId,
        expectedUnits: input.expectedUnits,
        loadedUnits: input.loadedUnits,
        shortfallUnits: null,
        verifiedAt: input.verifiedAt,
        shortfallReportedAt: null,
        details: null,
      };
      records.push(row);
      return row;
    },
    async recordShortfall() { return null; },
  };
}

function deliveryUnit(order: StoredOrder, deliveries: StoredDelivery[]): import("./delivery.js").DeliveryUnit {
  return {
    orders: orderStore([order], () => ({
      tripStopCount: 1,
      deferralCount: 0,
      loaderUserIds: [],
      deliveryDriverUserIds: deliveries.map((item) => item.driverUserId),
    })),
    async findStop() {
      return {
        id: "stop-1",
        tripStatus: "CONFIRMED",
        vehicleDriverUserId: driverId,
        orderId: order.id,
        orderStatus: order.status,
        orderUnits: order.orderUnits,
        orderWeightKg: order.orderWeightKg,
        orderVolumeM3: order.orderVolumeM3,
        tempRequirement: order.tempRequirement,
        brand: order.brand,
        district: order.district,
        depot: order.depot,
      };
    },
    async findDeliveryByStop(tripStopId) { return deliveries.find((item) => item.tripStopId === tripStopId) ?? null; },
    async createDelivery(input) {
      if (deliveries.some((item) => item.tripStopId === input.tripStopId)) return "conflict";
      const row: StoredDelivery = {
        id: "delivery-1",
        tripStopId: input.tripStopId,
        driverUserId: input.driverUserId,
        deliveredAt: input.deliveredAt,
        outcome: input.outcome,
        deliveredUnits: input.deliveredUnits,
        notes: input.notes,
      };
      deliveries.push(row);
      return row;
    },
    async createProof() { throw new Error("not used"); },
  };
}

function receiptUnit(order: StoredOrder, receipts: StoredReceipt[]): import("./receipt.js").ReceiptUnit {
  return {
    orders: orderStore([order], () => ({
      tripStopCount: 1,
      deferralCount: 0,
      loaderUserIds: [],
      deliveryDriverUserIds: [driverId],
    })),
    async findDelivery() {
      return {
        id: "delivery-1",
        orderId: order.id,
        orderStatus: order.status,
        outletId: outletA,
        orderUnits: order.orderUnits,
        orderWeightKg: order.orderWeightKg,
        orderVolumeM3: order.orderVolumeM3,
        tempRequirement: order.tempRequirement,
        brand: order.brand,
        district: order.district,
        depot: order.depot,
        outcome: "left at gate",
        hasReceipt: receipts.length > 0,
      };
    },
    async create(input) {
      if (receipts.some((item) => item.deliveryRecordId === input.deliveryRecordId)) return "conflict";
      const row: StoredReceipt = {
        id: "receipt-1",
        deliveryRecordId: input.deliveryRecordId,
        storeManagerUserId: input.storeManagerUserId,
        confirmedAt: input.confirmedAt,
        result: input.result,
        issueDetails: input.issueDetails,
      };
      receipts.push(row);
      return row;
    },
  };
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

function stored(status: OrderStatusName): StoredOrder {
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

function emptyFacts(): OrderTransitionFacts {
  return { tripStopCount: 0, deferralCount: 0, loaderUserIds: [], deliveryDriverUserIds: [] };
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

function manager(): OrderActor {
  return { userId: managerId, role: "STORE_MANAGER", assignedOutletIds: [outletA] };
}
