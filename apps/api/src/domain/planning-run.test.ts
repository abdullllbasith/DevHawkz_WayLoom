import assert from "node:assert/strict";
import test from "node:test";

import { parsePlanningInput, planningScenarios } from "@wayloom/planning";

import { buildPlanningInput, type PlanningMasterSnapshot } from "./planning-context.js";
import type { DeferralStore, StoredDeferral } from "./deferral.js";
import { executePlanningRun } from "./planning-run.js";
import type { OrderActor, OrderStore, StoredOrder } from "./order.js";
import type { AllocationOrder, StoredStop, StoredTrip, TripStore, TripVehicle } from "./trip.js";

const dispatcherId = "11111111-1111-4111-8111-111111111111";
const vehicleUuid = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const outletUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const feasibleOrderId = "55555555-5555-4555-8555-555555555555";
const heavyOrderId = "66666666-6666-4666-8666-666666666666";
const now = new Date("2026-06-01T08:00:00.000Z");

test("executePlanningRun persists a feasible allocation and a deferral outcome", async () => {
  const world = memoryWorld([
    confirmedOrder(feasibleOrderId, "ORD-OK", "10", "1"),
    confirmedOrder(heavyOrderId, "ORD-HEAVY", "1000.1", "1"),
  ]);
  const context = buildPlanningInput("2026-06-02", world.orders, masterSnapshot(), { VEH001: 0 });
  assert.equal(context.ok, true);
  if (!context.ok) return;
  const result = await executePlanningRun({
    actor: dispatcher(),
    context,
    now,
    trips: world.tripStore,
    deferrals: world.deferralStore,
  });
  assert.equal(result.ok, true);
  assert.equal(world.tripRows.length, 1);
  assert.equal(world.tripRows[0]?.status, "PLANNED");
  assert.equal(world.deferralRows.some((item) => item.reason === "NO_CAPACITY"), true);
});

test("executePlanningRun returns validation failure for broken planning input", async () => {
  const world = memoryWorld([confirmedOrder(feasibleOrderId, "ORD-1", "10", "1")]);
  const broken = buildPlanningInput("2026-06-02", world.orders, masterSnapshot(), { VEH001: 0 });
  assert.equal(broken.ok, true);
  if (!broken.ok) return;
  broken.input.operationalDate = "2026-06-31";
  const result = await executePlanningRun({
    actor: dispatcher(),
    context: broken,
    now,
    trips: world.tripStore,
    deferrals: world.deferralStore,
  });
  assert.deepEqual(result, { ok: false, code: "planning_validation_failure" });
  assert.equal(world.tripRows.length, 0);
});

test("executePlanningRun with no confirmed orders completes without fabricating trips", async () => {
  const world = memoryWorld([]);
  const context = buildPlanningInput("2026-06-02", world.orders, masterSnapshot(), { VEH001: 0 });
  assert.equal(context.ok, true);
  if (!context.ok) return;
  const result = await executePlanningRun({
    actor: dispatcher(),
    context,
    now,
    trips: world.tripStore,
    deferrals: world.deferralStore,
  });
  assert.equal(result.ok, true);
  assert.equal(world.tripRows.length, 0);
  assert.equal(world.deferralRows.length, 0);
});

function masterSnapshot(): PlanningMasterSnapshot {
  const scenario = planningScenarios().find((item) => item.name === "planning_basic_feasible");
  if (scenario === undefined) throw new Error("scenario");
  const parsed = parsePlanningInput(scenario.input);
  if (!parsed.ok) throw new Error("scenario");
  return {
    operationalDate: "2026-06-02",
    calendar: parsed.value.calendar,
    travel: parsed.value.travel,
    serviceAllowances: parsed.value.serviceAllowances,
    vehicles: parsed.value.vehicles.map((vehicle) => ({ ...vehicle, id: vehicleUuid })),
    outlets: parsed.value.outlets.map((outlet) => ({ ...outlet, id: outletUuid })),
    vehicleUuidBySourceId: new Map([["VEH001", vehicleUuid]]),
  };
}

function confirmedOrder(id: string, deliveryId: string, weightKg: string, volumeM3: string): StoredOrder {
  return {
    id,
    deliveryId,
    orderDate: "2026-06-02",
    outletId: outletUuid,
    outletCode: "OUT001",
    brand: "Fresh",
    district: "Colombo",
    depot: "Peliyagoda",
    createdByUserId: dispatcherId,
    status: "CONFIRMED",
    tempRequirement: "chilled",
    orderUnits: 10,
    orderWeightKg: weightKg,
    orderVolumeM3: volumeM3,
    submittedAt: new Date("2026-06-01T08:00:00.000Z"),
  };
}

function dispatcher(): OrderActor {
  return { userId: dispatcherId, role: "DISPATCHER", assignedOutletIds: [] };
}

function memoryWorld(initialOrders: StoredOrder[]) {
  const orders = [...initialOrders];
  const trips: StoredTrip[] = [];
  const stops: StoredStop[] = [];
  const deferrals: StoredDeferral[] = [];
  const vehicle: TripVehicle = {
    id: vehicleUuid,
    type: "van",
    temp: "reefer",
    weightCapKg: "1000",
    volumeCapM3: "10",
    depot: "Peliyagoda",
    driverUserId: null,
  };
  return {
    orders,
    tripStore: tripStore(),
    deferralStore: deferralStore(),
    tripRows: trips,
    deferralRows: deferrals,
  };

  function tripStore(): TripStore {
    return { transaction: (work) => rollback(work, tripUnit()) };
  }

  function deferralStore(): DeferralStore {
    return { transaction: (work) => rollback(work, deferralUnit()) };
  }

  function tripUnit(): import("./trip.js").TripUnit {
    return {
      orders: orderStore(),
      async findVehicle(id) {
        return id === vehicle.id ? vehicle : null;
      },
      async findAllocationOrder(id) {
        const order = orders.find((item) => item.id === id);
        if (order === undefined || order.status !== "CONFIRMED") return null;
        return {
          id: order.id,
          status: order.status,
          tempRequirement: order.tempRequirement,
          orderWeightKg: order.orderWeightKg,
          orderVolumeM3: order.orderVolumeM3,
          brand: order.brand,
          district: order.district,
          depot: order.depot,
          parkingConstraint: "normal",
          windowOpen: "08:00",
          windowClose: "12:00",
          submittedAt: order.submittedAt,
        } satisfies AllocationOrder;
      },
      async findTripById(id) {
        const trip = trips.find((item) => item.id === id);
        return trip === undefined ? null : { ...trip, stops: stops.filter((stop) => stop.tripId === trip.id) };
      },
      async tripSlotTaken(vehicleId, operationalDate, tripNumber) {
        return trips.some((trip) => trip.vehicleId === vehicleId && trip.operationalDate === operationalDate && trip.tripNumber === tripNumber);
      },
      async countTrips(vehicleId, operationalDate) {
        return trips.filter((trip) => trip.vehicleId === vehicleId && trip.operationalDate === operationalDate).length;
      },
      async routeTaken() {
        return false;
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
        const stop: StoredStop = {
          id: `stop-${String(stops.length + 1)}`,
          tripId: input.tripId,
          orderId: input.orderId,
          sequence: input.sequence,
          plannedArrival: input.plannedArrival,
        };
        stops.push(stop);
        const trip = trips.find((item) => item.id === input.tripId);
        if (trip !== undefined) trip.stops.push(stop);
        return stop;
      },
      async compareAndSetTripStatus(id, expected, next) {
        const trip = trips.find((item) => item.id === id);
        if (trip === undefined || trip.status !== expected) return null;
        trip.status = next;
        return { ...trip, stops: stops.filter((stop) => stop.tripId === trip.id) };
      },
    };
  }

  function deferralUnit(): import("./deferral.js").DeferralUnit {
    return {
      orders: orderStore(),
      async findOrder(id) {
        const order = orders.find((item) => item.id === id);
        if (order === undefined) return null;
        return {
          id: order.id,
          status: order.status,
          hasTripStop: stops.some((stop) => stop.orderId === order.id),
          orderUnits: order.orderUnits,
          orderWeightKg: order.orderWeightKg,
          orderVolumeM3: order.orderVolumeM3,
          tempRequirement: order.tempRequirement,
          brand: order.brand,
          district: order.district,
          depot: order.depot,
        };
      },
      async listByOrder(orderId) {
        return deferrals.filter((item) => item.orderId === orderId);
      },
      async create(input) {
        const row: StoredDeferral = {
          id: `deferral-${String(deferrals.length + 1)}`,
          orderId: input.orderId,
          reason: input.reason,
          reportedAt: input.reportedAt,
        };
        deferrals.push(row);
        return row;
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
        return orders.find((item) => item.id === id) ?? null;
      },
      async findTransitionFacts(orderId) {
        return {
          tripStopCount: stops.filter((stop) => stop.orderId === orderId).length,
          deferralCount: deferrals.filter((item) => item.orderId === orderId).length,
          loaderUserIds: [],
          deliveryDriverUserIds: [],
        };
      },
      async create() {
        throw new Error("unused");
      },
      async compareAndSetStatus(input) {
        const order = orders.find((item) => item.id === input.id);
        if (order === undefined || order.status !== input.expected) return null;
        order.status = input.next;
        return order;
      },
    };
  }

  async function rollback<TUnit, T>(work: (unit: TUnit) => Promise<T>, unit: TUnit): Promise<T> {
    const snapshot = structuredClone({ orders, trips, stops, deferrals });
    try {
      return await work(unit);
    } catch (error) {
      orders.splice(0, orders.length, ...snapshot.orders);
      trips.splice(0, trips.length, ...snapshot.trips);
      stops.splice(0, stops.length, ...snapshot.stops);
      deferrals.splice(0, deferrals.length, ...snapshot.deferrals);
      throw error;
    }
  }
}
