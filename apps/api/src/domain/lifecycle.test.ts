import assert from "node:assert/strict";
import test from "node:test";

import { loadAiSettings } from "../ai/provider.js";
import { recordDelivery, recordProof, type DeliveryStore, type StoredDelivery } from "./delivery.js";
import { verifyLoading, type LoadingStore, type StoredLoading } from "./loading.js";
import { confirmOrder, createOrder, submitOrder, type OrderActor, type OrderOutlet, type OrderStore, type OrderTransitionFacts, type StoredOrder } from "./order.js";
import { confirmReceipt, type ReceiptStore } from "./receipt.js";
import { dispatchTrip, type StoredTrip, type TripStore } from "./trip.js";

const now = new Date("2026-06-02T10:00:00.000Z");
const managerId = "44444444-4444-4444-8444-444444444444";
const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const driverId = "33333333-3333-4333-8333-333333333333";
const outletId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const tripId = "0e18a809-55ee-413f-b5ba-2b1d9d2267ea";
const stopId = "a8d074cc-4d89-404d-aab5-5f909ef3f528";

test("the four roles complete one order without an AI dependency", async () => {
  assert.equal(loadAiSettings({}).enabled, false);
  const world = memoryWorld();
  const manager = actor(managerId, "STORE_MANAGER", [outletId]);
  const dispatcher = actor(dispatcherId, "DISPATCHER");
  const loader = actor(loaderId, "LOADER");
  const driver = actor(driverId, "DRIVER");

  const created = await createOrder({
    actor: manager,
    command: {
      deliveryId: "SEED-2026-06-02-OUT001",
      orderDate: "2026-06-02",
      outletId,
      tempRequirement: "chilled",
      orderUnits: 10,
      orderWeightKg: "12.5",
      orderVolumeM3: "1.25",
    },
    store: world.orders,
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  const submitted = await submitOrder({ actor: manager, orderId: created.order.id, now, store: world.orders });
  const confirmed = await confirmOrder({ actor: dispatcher, orderId: created.order.id, now, store: world.orders });
  assert.equal(submitted.ok && confirmed.ok, true);
  world.planned = true;
  const { transitionOrder } = await import("./order-transition.js");
  const allocated = await transitionOrder({ actor: dispatcher, orderId: created.order.id, to: "PLANNED_ALLOCATED", now, store: world.orders });
  assert.equal(allocated.ok, true);

  const loaded = await verifyLoading({
    actor: loader,
    command: { tripStopId: stopId, loadedUnits: 10 },
    now,
    store: world.loading,
  });
  assert.equal(loaded.ok, true);
  const deniedDispatch = await dispatchTrip({ actor: loader, tripId, now, store: world.trips });
  assert.deepEqual(deniedDispatch, { ok: false, code: "authorization_failure" });
  const dispatched = await dispatchTrip({ actor: dispatcher, tripId, now, store: world.trips });
  assert.equal(dispatched.ok, true);

  const delivered = await recordDelivery({
    actor: driver,
    command: { tripStopId: stopId, outcome: "delivered", deliveredUnits: 10 },
    now,
    store: world.deliveries,
  });
  assert.equal(delivered.ok, true);
  if (!delivered.ok) {
    return;
  }
  const proof = await recordProof({
    actor: driver,
    command: { tripStopId: stopId, evidenceReference: "seed-pod-out001" },
    now,
    store: world.deliveries,
  });
  const receipt = await confirmReceipt({
    actor: manager,
    command: { deliveryRecordId: delivered.delivery.id, result: "accepted" },
    now,
    store: world.receipts,
  });
  assert.equal(proof.ok && receipt.ok, true);
  assert.equal(world.orders.orders[0]?.id, created.order.id);
  assert.equal(world.orders.orders[0]?.status, "RECEIPT_CONFIRMED");
  assert.equal(world.orders.orders.length, 1);
  assert.equal(world.deliveriesRecorded, 1);
  assert.equal(world.receiptsRecorded, 1);
});

function actor(userId: string, role: OrderActor["role"], assignedOutletIds: readonly string[] = []): OrderActor {
  return { userId, role, assignedOutletIds };
}

function memoryWorld() {
  const outlets: OrderOutlet[] = [{ id: outletId, outletCode: "OUT001", brand: "Fresh", district: "Colombo", depot: "Peliyagoda" }];
  const orders: StoredOrder[] = [];
  const loadingRecords: StoredLoading[] = [];
  const deliveries: StoredDelivery[] = [];
  const state = { planned: false, deliveriesRecorded: 0, receiptsRecorded: 0, proofs: 0 };
  const orderStore: OrderStore & { orders: StoredOrder[] } = {
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
    async findTransitionFacts(): Promise<OrderTransitionFacts> {
      return {
        tripStopCount: state.planned ? 1 : 0,
        deferralCount: 0,
        loaderUserIds: loadingRecords.map((record) => record.loaderUserId),
        deliveryDriverUserIds: deliveries.map((record) => record.driverUserId),
      };
    },
    async create(input) {
      const outlet = outlets.find((item) => item.id === input.outletId);
      if (outlet === undefined) {
        throw new Error("missing outlet");
      }
      const order: StoredOrder = {
        id: "55555555-5555-4555-8555-555555555555",
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
  const loading: LoadingStore = {
    async transaction(work) {
      return work({
        orders: orderStore,
        async findStop() {
          const order = orders[0];
          if (order === undefined) {
            return null;
          }
          return {
            id: stopId,
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
        async findByStop(tripStopId) {
          return loadingRecords.find((record) => record.tripStopId === tripStopId) ?? null;
        },
        async create(input) {
          const record: StoredLoading = { id: "loading-1", ...input, shortfallUnits: null, shortfallReportedAt: null, details: null };
          loadingRecords.push(record);
          return record;
        },
        async recordShortfall() {
          return null;
        },
      });
    },
  };
  const trip: StoredTrip = {
    id: tripId,
    routeId: null,
    operationalDate: "2026-06-02",
    vehicleId: "vehicle-35",
    depot: "Peliyagoda",
    tripNumber: 1,
    status: "CONFIRMED",
    stops: [{ id: stopId, tripId, orderId: "55555555-5555-4555-8555-555555555555", sequence: 1, plannedArrival: null }],
  };
  const trips: TripStore = {
    async transaction(work) {
      return work({
        orders: orderStore,
        async findTripById(id) {
          return id === tripId ? trip : null;
        },
        async recordTripDispatched() {
          return undefined;
        },
        async findVehicle() {
          return null;
        },
        async findAllocationOrder() {
          return null;
        },
        async tripSlotTaken() {
          return false;
        },
        async countTrips() {
          return 1;
        },
        async routeTaken() {
          return false;
        },
        async orderHasStop() {
          return true;
        },
        async createTrip() {
          return "conflict";
        },
        async createStop() {
          return "conflict";
        },
        async compareAndSetTripStatus() {
          return null;
        },
      });
    },
  };
  const deliveriesStore: DeliveryStore = {
    async transaction(work) {
      return work({
        orders: orderStore,
        async findStop() {
          const order = orders[0];
          if (order === undefined) {
            return null;
          }
          return {
            id: stopId,
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
        async findDeliveryByStop(tripStopId) {
          return deliveries.find((record) => record.tripStopId === tripStopId) ?? null;
        },
        async createDelivery(input) {
          state.deliveriesRecorded += 1;
          const record: StoredDelivery = { id: "delivery-1", ...input };
          deliveries.push(record);
          return record;
        },
        async createProof(input) {
          state.proofs += 1;
          return { id: "proof-1", ...input, capturedByUserId: input.capturedByUserId };
        },
      });
    },
  };
  const receipts: ReceiptStore = {
    async transaction(work) {
      return work({
        orders: orderStore,
        async findDelivery(id) {
          const delivery = deliveries.find((record) => record.id === id);
          const order = orders[0];
          if (delivery === undefined || order === undefined) {
            return null;
          }
          return {
            id: delivery.id,
            orderId: order.id,
            orderStatus: order.status,
            outletId: order.outletId,
            orderUnits: order.orderUnits,
            orderWeightKg: order.orderWeightKg,
            orderVolumeM3: order.orderVolumeM3,
            tempRequirement: order.tempRequirement,
            brand: order.brand,
            district: order.district,
            depot: order.depot,
            outcome: delivery.outcome,
            hasReceipt: state.receiptsRecorded > 0,
          };
        },
        async create(input) {
          state.receiptsRecorded += 1;
          return { id: "receipt-1", ...input };
        },
      });
    },
  };
  return { orders: orderStore, loading, trips, deliveries: deliveriesStore, receipts, get planned() { return state.planned; }, set planned(value: boolean) { state.planned = value; }, get deliveriesRecorded() { return state.deliveriesRecorded; }, get receiptsRecorded() { return state.receiptsRecorded; } };
}
