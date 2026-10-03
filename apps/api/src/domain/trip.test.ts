import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { OrderActor, OrderStore, StoredOrder } from "./order.js";
import { confirmTrip, createTrip, dispatchTrip, type AllocationOrder, type StoredTrip, type TripDispatchAudit, type TripStore, type TripVehicle } from "./trip.js";

const dispatcherId = "11111111-1111-4111-8111-111111111111";
const loaderId = "22222222-2222-4222-8222-222222222222";
const driverId = "33333333-3333-4333-8333-333333333333";
const managerId = "44444444-4444-4444-8444-444444444444";
const submittedAt = new Date("2026-06-01T08:00:00.000Z");

test("a dispatcher persists one planned trip for a feasible whole-order allocation", async () => {
  const store = memoryStore();
  const created = await createTrip({
    actor: dispatcher(),
    command: command(store, [
      { orderId: "order-1", sequence: 0, plannedArrival: "06:00" },
      { orderId: "order-2", sequence: 1, plannedArrival: "06:30" },
    ]),
    store,
  });
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  assert.equal(created.trip.status, "PLANNED");
  assert.equal(created.trip.tripNumber, 1);
  assert.equal(created.trip.depot, "Peliyagoda");
  assert.equal(created.trip.routeId, "ROUTE-1");
  assert.deepEqual(
    created.trip.stops.map((stop) => [stop.sequence, stop.orderId, stop.plannedArrival]),
    [
      [0, "order-1", "06:00"],
      [1, "order-2", "06:30"],
    ],
  );
  assert.equal(JSON.stringify(created.trip.stops).includes("orderUnits"), false);
  assert.equal(store.orders.every((order) => order.status === "PLANNED_ALLOCATED"), true);
  assert.equal(store.orders[0]?.submittedAt?.toISOString(), submittedAt.toISOString());
  const confirmed = await confirmTrip({ actor: dispatcher(), tripId: created.trip.id, store });
  assert.equal(confirmed.ok, true);
  if (!confirmed.ok) {
    return;
  }
  assert.equal(confirmed.trip.status, "CONFIRMED");
  assert.equal(confirmed.trip.stops.length, 2);
  const repeated = await confirmTrip({ actor: dispatcher(), tripId: created.trip.id, store });
  assert.deepEqual(repeated, { ok: false, code: "lifecycle_conflict" });
  assert.equal(store.trips.length, 1);
  assert.equal(store.stops.length, 2);
});

test("trip persistence rejects an infeasible or unauthorized allocation", async () => {
  const store = memoryStore();
  const actor = dispatcher();
  assert.deepEqual(await createTrip({ actor, command: command(store, stops(), { tripNumber: 3 }), store }), {
    ok: false,
    code: "invalid_input",
  });
  assert.deepEqual(await createTrip({ actor, command: command(store, stops(), { vehicleId: "missing" }), store }), {
    ok: false,
    code: "not_found",
  });
  assert.deepEqual(await createTrip({ actor, command: command(store, [{ orderId: "missing", sequence: 0 }]), store }), {
    ok: false,
    code: "not_found",
  });
  store.vehicles[0].depot = "Kandy";
  assert.deepEqual(await createTrip({ actor, command: command(store, stops()), store }), {
    ok: false,
    code: "invariant_violation",
  });
  store.vehicles[0].depot = "Peliyagoda";
  store.orders[1].brand = "Tech";
  assert.deepEqual(await createTrip({ actor, command: command(store, stops()), store }), {
    ok: false,
    code: "invariant_violation",
  });
  store.orders[1].brand = "Fresh";
  store.orders[1].district = "Kandy";
  assert.deepEqual(await createTrip({ actor, command: command(store, stops()), store }), {
    ok: false,
    code: "invariant_violation",
  });
  store.orders[1].district = "Colombo";
  store.vehicles[0].temp = "ambient";
  assert.deepEqual(await createTrip({ actor, command: command(store, stops()), store }), {
    ok: false,
    code: "invariant_violation",
  });
  store.vehicles[0].temp = "reefer";
  store.vehicles[0].type = "truck";
  assert.deepEqual(await createTrip({ actor, command: command(store, stops()), store }), {
    ok: false,
    code: "invariant_violation",
  });
  store.vehicles[0].type = "van";
  store.orders[0].orderWeightKg = "60";
  store.orders[1].orderWeightKg = "50";
  assert.deepEqual(await createTrip({ actor, command: command(store, stops()), store }), {
    ok: false,
    code: "invariant_violation",
  });
  store.orders[0].orderWeightKg = "40";
  store.orders[1].orderWeightKg = "40";
  store.orders[0].orderVolumeM3 = "6";
  store.orders[1].orderVolumeM3 = "6";
  assert.deepEqual(await createTrip({ actor, command: command(store, stops()), store }), {
    ok: false,
    code: "invariant_violation",
  });
  store.orders[0].orderVolumeM3 = "1";
  store.orders[1].orderVolumeM3 = "1";
  assert.deepEqual(
    await createTrip({
      actor,
      command: command(store, [
        { orderId: "order-1", sequence: 0, plannedArrival: "04:00" },
        { orderId: "order-2", sequence: 1 },
      ]),
      store,
    }),
    { ok: false, code: "invariant_violation" },
  );
  assert.deepEqual(
    await createTrip({
      actor,
      command: command(store, [
        { orderId: "order-1", sequence: 0 },
        { orderId: "order-1", sequence: 1 },
      ]),
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  assert.deepEqual(
    await createTrip({
      actor,
      command: command(store, [
        { orderId: "order-1", sequence: 0 },
        { orderId: "order-2", sequence: 0 },
      ]),
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  assert.deepEqual(
    await createTrip({ actor, command: command(store, [{ orderId: "order-1", sequence: 0, orderUnits: 1 }]), store }),
    { ok: false, code: "invalid_input" },
  );
  store.orders[0].status = "DRAFT";
  assert.deepEqual(await createTrip({ actor, command: command(store, stops()), store }), {
    ok: false,
    code: "invalid_transition",
  });
  store.orders[0].status = "LOADING";
  assert.deepEqual(await createTrip({ actor, command: command(store, stops()), store }), {
    ok: false,
    code: "invalid_transition",
  });
  store.orders[0].status = "CONFIRMED";
  assert.deepEqual(
    await createTrip({
      actor: manager(),
      command: command(store, stops(), { role: "DISPATCHER", actorUserId: dispatcherId }),
      store,
    }),
    { ok: false, code: "invalid_input" },
  );
  for (const unauthorized of [manager(), loader(), driver()]) {
    const denied = await createTrip({ actor: unauthorized, command: command(store, stops()), store });
    assert.deepEqual(denied, { ok: false, code: "authorization_failure" });
  }
  assert.equal(store.trips.length, 0);
  assert.equal(store.orders.every((order) => order.status === "CONFIRMED"), true);
});

test("the same vehicle and day cannot gain a third trip or a second copy of an order", async () => {
  const store = memoryStore();
  store.orders.push(order("order-3"), order("order-4"), order("order-5"));
  const first = await createTrip({
    actor: dispatcher(),
    command: command(store, [{ orderId: "order-1", sequence: 0 }], { tripNumber: 1, routeId: "ROUTE-A" }),
    store,
  });
  assert.equal(first.ok, true);
  const duplicate = await createTrip({
    actor: dispatcher(),
    command: command(store, [{ orderId: "order-1", sequence: 0 }], { tripNumber: 2, routeId: "ROUTE-B" }),
    store,
  });
  assert.deepEqual(duplicate, { ok: false, code: "invariant_violation" });
  const second = await createTrip({
    actor: dispatcher(),
    command: command(store, [{ orderId: "order-2", sequence: 0 }], { tripNumber: 2, routeId: "ROUTE-C" }),
    store,
  });
  assert.equal(second.ok, true);
  const third = await createTrip({
    actor: dispatcher(),
    command: command(store, [{ orderId: "order-3", sequence: 0 }], { tripNumber: 1, routeId: "ROUTE-D" }),
    store,
  });
  assert.deepEqual(third, { ok: false, code: "invariant_violation" });
  assert.equal(store.trips.length, 2);
  assert.equal(store.stops.length, 2);
});

test("a failed allocation leaves no trip and does not allocate either order", async () => {
  const store = memoryStore();
  store.sabotageSecondTransition = true;
  const created = await createTrip({
    actor: dispatcher(),
    command: command(store, [
      { orderId: "order-1", sequence: 0 },
      { orderId: "order-2", sequence: 1 },
    ]),
    store,
  });
  assert.deepEqual(created, { ok: false, code: "invalid_transition" });
  assert.equal(store.trips.length, 0);
  assert.equal(store.stops.length, 0);
  assert.equal(store.orders.every((order) => order.status === "CONFIRMED"), true);
});

test("an equal capacity allocation is accepted and an ambient van-only truck is not required", async () => {
  const store = memoryStore();
  store.orders[0].orderWeightKg = "50";
  store.orders[1].orderWeightKg = "50";
  store.orders[0].tempRequirement = "ambient";
  store.orders[1].tempRequirement = "ambient";
  store.orders[0].parkingConstraint = "normal";
  store.orders[1].parkingConstraint = "mall_dock";
  store.vehicles[0].temp = "ambient";
  store.vehicles[0].type = "truck";
  const created = await createTrip({ actor: dispatcher(), command: command(store, stops()), store });
  assert.equal(created.ok, true);
});

test("a dispatcher dispatches a trip only when every order is loaded", async () => {
  const store = memoryStore();
  const created = await createTrip({ actor: dispatcher(), command: command(store, stops()), store });
  assert.equal(created.ok, true);
  if (!created.ok) {
    return;
  }
  const now = new Date("2026-06-02T09:00:00.000Z");
  assert.deepEqual(await dispatchTrip({ actor: loader(), tripId: created.trip.id, now, store }), {
    ok: false,
    code: "authorization_failure",
  });
  assert.deepEqual(await dispatchTrip({ actor: dispatcher(), tripId: created.trip.id, now, store }), {
    ok: false,
    code: "lifecycle_conflict",
  });
  for (const order of store.orders) {
    order.status = "LOADED";
  }
  store.orders[1].status = "PLANNED_ALLOCATED";
  assert.deepEqual(await dispatchTrip({ actor: dispatcher(), tripId: created.trip.id, now, store }), {
    ok: false,
    code: "lifecycle_conflict",
  });
  assert.equal(store.orders.some((order) => order.status === "DISPATCHED"), false);
  assert.equal(store.audits.length, 0);
  store.orders[1].status = "LOADED";
  const dispatched = await dispatchTrip({ actor: dispatcher(), tripId: created.trip.id, now, store });
  assert.equal(dispatched.ok, true);
  if (!dispatched.ok) {
    return;
  }
  assert.equal(dispatched.trip.status, "PLANNED");
  assert.equal(store.orders.every((order) => order.status === "DISPATCHED"), true);
  assert.deepEqual(store.audits, [
    {
      action: "TRIP_DISPATCHED",
      tripId: created.trip.id,
      actorUserId: dispatcherId,
      occurredAt: now,
    },
  ]);
  const repeated = await dispatchTrip({ actor: dispatcher(), tripId: created.trip.id, now, store });
  assert.deepEqual(repeated, { ok: false, code: "lifecycle_conflict" });
  assert.equal(store.audits.length, 1);
  assert.equal(store.orders.every((order) => order.status === "DISPATCHED"), true);
});

test("trip persistence does not calculate fuel or add a route leg", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/domain/trip.ts"), "utf8");
  const storeSource = readFileSync(resolve(root, "apps/api/src/domain/trip-store.ts"), "utf8");
  assert.equal(source.includes("transitionOrder"), true);
  assert.equal(source.includes("km_per_l"), false);
  assert.equal(source.includes("weekly_fuel"), false);
  assert.equal(source.includes("trip_minutes"), false);
  assert.equal(source.includes("RouteLeg"), false);
  assert.equal(storeSource.includes("RouteLeg"), false);
  assert.equal(storeSource.includes("status: \"PLANNED\""), true);
  assert.equal(storeSource.includes("orderUnits"), false);
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

function stops(): Record<string, unknown>[] {
  return [
    { orderId: "order-1", sequence: 0 },
    { orderId: "order-2", sequence: 1 },
  ];
}

function command(
  store: Memory,
  tripStops: Record<string, unknown>[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    operationalDate: "2026-06-02",
    vehicleId: store.vehicles[0]?.id ?? "vehicle-1",
    tripNumber: 1,
    routeId: "ROUTE-1",
    stops: tripStops,
    ...overrides,
  };
}

type MemoryOrder = AllocationOrder & {
  deliveryId: string;
  orderDate: string;
  outletId: string;
  outletCode: string;
  createdByUserId: string;
  orderUnits: number;
};

type Memory = TripStore & {
  vehicles: TripVehicle[];
  orders: MemoryOrder[];
  trips: StoredTrip[];
  stops: MemoryOrder extends never ? never : import("./trip.js").StoredStop[];
  audits: TripDispatchAudit[];
  sabotageSecondTransition: boolean;
};

function memoryStore(): Memory {
  const vehicles: TripVehicle[] = [
    {
      id: "vehicle-1",
      type: "van",
      temp: "reefer",
      weightCapKg: "100",
      volumeCapM3: "10",
      depot: "Peliyagoda",
      driverUserId: driverId,
    },
  ];
  const orders: MemoryOrder[] = [order("order-1"), order("order-2")];
  const trips: StoredTrip[] = [];
  const stops: import("./trip.js").StoredStop[] = [];
  const audits: TripDispatchAudit[] = [];
  const state = {
    vehicles,
    orders,
    trips,
    stops,
    audits,
    sabotageSecondTransition: false,
    async transaction<T>(work: (unit: import("./trip.js").TripUnit) => Promise<T>): Promise<T> {
      const snapshot = structuredClone({
        vehicles,
        orders,
        trips,
        stops,
        audits,
      });
      try {
        return await work(unit());
      } catch (error) {
        vehicles.splice(0, vehicles.length, ...snapshot.vehicles);
        orders.splice(0, orders.length, ...snapshot.orders);
        trips.splice(0, trips.length, ...snapshot.trips);
        stops.splice(0, stops.length, ...snapshot.stops);
        audits.splice(0, audits.length, ...snapshot.audits);
        throw error;
      }
    },
  };
  return state;

  function unit(): import("./trip.js").TripUnit {
    return {
      orders: orderStore(),
      async findVehicle(id) {
        return vehicles.find((vehicle) => vehicle.id === id) ?? null;
      },
      async findAllocationOrder(id) {
        return orders.find((order) => order.id === id) ?? null;
      },
      async findTripById(id) {
        const trip = trips.find((item) => item.id === id);
        if (trip === undefined) {
          return null;
        }
        return { ...trip, stops: stops.filter((stop) => stop.tripId === trip.id) };
      },
      async tripSlotTaken(vehicleId, operationalDate, tripNumber) {
        return trips.some(
          (trip) =>
            trip.vehicleId === vehicleId &&
            trip.operationalDate === operationalDate &&
            trip.tripNumber === tripNumber,
        );
      },
      async countTrips(vehicleId, operationalDate) {
        return trips.filter((trip) => trip.vehicleId === vehicleId && trip.operationalDate === operationalDate)
          .length;
      },
      async routeTaken(routeId) {
        return trips.some((trip) => trip.routeId === routeId);
      },
      async orderHasStop(orderId) {
        return stops.some((stop) => stop.orderId === orderId);
      },
      async createTrip(input) {
        const trip: StoredTrip = {
          id: `trip-${String(trips.length + 1)}`,
          routeId: input.routeId,
          operationalDate: input.operationalDate,
          vehicleId: input.vehicleId,
          depot: input.depot,
          tripNumber: input.tripNumber,
          status: "PLANNED",
          stops: [],
        };
        trips.push(trip);
        return trip;
      },
      async createStop(input) {
        const stop = {
          id: `stop-${String(stops.length + 1)}`,
          tripId: input.tripId,
          orderId: input.orderId,
          sequence: input.sequence,
          plannedArrival: input.plannedArrival,
        };
        stops.push(stop);
        if (state.sabotageSecondTransition && stops.length === 2) {
          const target = orders.find((order) => order.id === "order-2");
          if (target !== undefined) {
            target.status = "SUBMITTED";
          }
        }
        return stop;
      },
      async recordTripDispatched(input) {
        audits.push(input);
      },
      async compareAndSetTripStatus(id, expected, next) {
        const trip = trips.find((item) => item.id === id);
        if (trip === undefined || trip.status !== expected) {
          return null;
        }
        trip.status = next;
        return { ...trip, stops: stops.filter((stop) => stop.tripId === trip.id) };
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
        const order = orders.find((item) => item.id === id);
        return order === undefined ? null : toStored(order);
      },
      async findTransitionFacts(orderId) {
        return {
          tripStopCount: stops.filter((stop) => stop.orderId === orderId).length,
          deferralCount: 0,
          loaderUserIds: [],
          deliveryDriverUserIds: [],
        };
      },
      async create() {
        throw new Error("trip allocation does not create an order");
      },
      async compareAndSetStatus(input) {
        const order = orders.find((item) => item.id === input.id);
        if (order === undefined || order.status !== input.expected) {
          return null;
        }
        order.status = input.next;
        return toStored(order);
      },
    };
  }
}

function order(id: string): MemoryOrder {
  return {
    id,
    status: "CONFIRMED",
    tempRequirement: "chilled",
    orderWeightKg: "40",
    orderVolumeM3: "1",
    brand: "Fresh",
    district: "Colombo",
    depot: "Peliyagoda",
    parkingConstraint: "van_only",
    windowOpen: "05:00",
    windowClose: "07:30",
    submittedAt,
    deliveryId: id,
    orderDate: "2026-06-02",
    outletId: "outlet-1",
    outletCode: "OUT001",
    createdByUserId: managerId,
    orderUnits: 10,
  };
}

function toStored(order: MemoryOrder): StoredOrder {
  return {
    id: order.id,
    deliveryId: order.deliveryId,
    orderDate: order.orderDate,
    outletId: order.outletId,
    outletCode: order.outletCode,
    brand: order.brand,
    district: order.district,
    depot: order.depot,
    createdByUserId: order.createdByUserId,
    status: order.status,
    tempRequirement: order.tempRequirement,
    orderUnits: order.orderUnits,
    orderWeightKg: order.orderWeightKg,
    orderVolumeM3: order.orderVolumeM3,
    submittedAt: order.submittedAt,
  };
}
