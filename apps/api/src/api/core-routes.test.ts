import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { coreRoutes, type CoreDependencies, type TripScope } from "./core-routes.js";
import { createApp } from "../app.js";
import type { DeferralStore, StoredDeferral } from "../domain/deferral.js";
import type { DeliveryStore, StoredDelivery, StoredProof } from "../domain/delivery.js";
import type { ExceptionStore, StoredException } from "../domain/exception.js";
import type { LoadingStore, StoredLoading } from "../domain/loading.js";
import type { OrderOutlet, OrderStore, OrderTransitionFacts, StoredOrder } from "../domain/order.js";
import type { ReceiptStore } from "../domain/receipt.js";
import type { StoredStop, TripStore } from "../domain/trip.js";
import type { Logger } from "../log.js";
import type { AuthUserRecord, UserDirectory } from "../security/auth.js";
import { createCsrfToken } from "../security/csrf.js";
import { createAuthenticatedSession, type SessionRecord, type SessionStore } from "../security/session.js";

const now = new Date("2026-06-02T14:00:00.000Z");
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const outletB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const dispatcher = user("11111111-1111-4111-8111-111111111111", "seed.dispatcher", "DISPATCHER");
const loader = user("22222222-2222-4222-8222-222222222222", "seed.loader", "LOADER");
const otherLoader = user("22222222-2222-4222-8222-222222222223", "seed.loader-2", "LOADER");
const driver = user("33333333-3333-4333-8333-333333333333", "seed.driver", "DRIVER");
const otherDriver = user("33333333-3333-4333-8333-333333333334", "seed.driver-2", "DRIVER");
const manager = user("44444444-4444-4444-8444-444444444444", "seed.store-manager", "STORE_MANAGER");
const otherManager = user("44444444-4444-4444-8444-444444444445", "seed.store-manager-2", "STORE_MANAGER");
const loadStop = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const deliveryStop = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const receiptStop = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
const earlyStop = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4";
const plannedTrip = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
const driverTrip = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
const otherDriverTrip = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";
const receiptTrip = "cccccccc-cccc-4ccc-8ccc-ccccccccccc4";
const earlyTrip = "cccccccc-cccc-4ccc-8ccc-ccccccccccc5";
const loadOrder = "dddddddd-dddd-4ddd-8ddd-ddddddddddd1";
const deliveryOrder = "dddddddd-dddd-4ddd-8ddd-ddddddddddd2";
const receiptOrder = "dddddddd-dddd-4ddd-8ddd-ddddddddddd3";
const earlyOrder = "dddddddd-dddd-4ddd-8ddd-ddddddddddd4";
const receiptDelivery = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1";
const earlyDelivery = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2";

test("core endpoints keep authorization, validation, and domain results", async () => {
  const sessions = memorySessions();
  const world = memoryCore();
  const server = await listen(
    createApp({
      nodeEnv: "test",
      log: silentLog(),
      users: directory([dispatcher, loader, otherLoader, driver, otherDriver, manager, otherManager]),
      sessions,
      now: () => now,
      assignedOutletIds: async (userId) => (userId === manager.id ? [outletA] : userId === otherManager.id ? [outletB] : []),
      businessRoutes: coreRoutes(world),
    }),
  );
  const managerCookie = await cookieFor(manager, sessions);
  const otherManagerCookie = await cookieFor(otherManager, sessions);
  const dispatcherCookie = await cookieFor(dispatcher, sessions);
  const loaderCookie = await cookieFor(loader, sessions);
  const otherLoaderCookie = await cookieFor(otherLoader, sessions);
  const driverCookie = await cookieFor(driver, sessions);
  const otherDriverCookie = await cookieFor(otherDriver, sessions);
  try {
    assert.equal((await fetch(url(server, "/api/orders"))).status, 401);
    const forged = await send(server, "/api/orders", managerCookie, {
      ...orderBody(),
      actorUserId: dispatcher.id,
      role: "DISPATCHER",
      status: "DELIVERED",
    });
    assert.equal(forged.status, 400);
    assert.equal(world.orderRows.find((order) => order.deliveryId === "ORD-100"), undefined);

    const created = await send(server, "/api/orders", managerCookie, orderBody());
    assert.equal(created.status, 201);
    const order = (await created.json()) as { id: string; status: string; outletId: string };
    assert.equal(order.status, "DRAFT");
    assert.equal(order.outletId, outletA);
    assert.equal(JSON.stringify(order).includes("passwordHash"), false);
    assert.equal(JSON.stringify(order).includes("createdAt"), false);

    const hidden = await fetch(url(server, `/api/orders/${order.id}`), { headers: { cookie: otherManagerCookie } });
    assert.equal(hidden.status, 403);
    const visible = await fetch(url(server, `/api/orders/${order.id}`), { headers: { cookie: managerCookie } });
    assert.equal(visible.status, 200);
    const otherOutlet = await fetch(url(server, `/api/orders?outletId=${outletB}`), { headers: { cookie: managerCookie } });
    assert.equal(otherOutlet.status, 200);
    assert.deepEqual(await otherOutlet.json(), []);
    const earlyClose = await send(server, `/api/orders/${order.id}/confirm`, dispatcherCookie, {});
    assert.equal(earlyClose.status, 409);
    assert.equal(((await earlyClose.json()) as { error: { code: string } }).error.code, "INVALID_STATE_TRANSITION");
    const submitted = await send(server, `/api/orders/${order.id}/submit`, managerCookie, {});
    assert.equal(submitted.status, 200);
    assert.equal(((await submitted.json()) as { status: string }).status, "SUBMITTED");
    const skipped = await send(server, `/api/orders/${order.id}/submit`, managerCookie, { status: "DELIVERED" });
    assert.equal(skipped.status, 400);
    const closed = await send(server, `/api/orders/${order.id}/confirm`, dispatcherCookie, {});
    assert.equal(closed.status, 200);
    const closedOrder = (await closed.json()) as { status: string; submittedAt: string | null };
    assert.equal(closedOrder.status, "CONFIRMED");
    assert.equal(closedOrder.submittedAt, now.toISOString());
    const repeatedClose = await send(server, `/api/orders/${order.id}/confirm`, dispatcherCookie, {});
    assert.equal(repeatedClose.status, 409);
    assert.equal(((await repeatedClose.json()) as { error: { code: string } }).error.code, "INVALID_STATE_TRANSITION");
    const loaderClose = await send(server, `/api/orders/${order.id}/confirm`, loaderCookie, {});
    assert.equal(loaderClose.status, 403);
    const managerClose = await send(server, `/api/orders/${order.id}/confirm`, managerCookie, {});
    assert.equal(managerClose.status, 403);
    const extraClose = await send(server, `/api/orders/${order.id}/confirm`, dispatcherCookie, { status: "CONFIRMED" });
    assert.equal(extraClose.status, 400);
    const missingCloseCsrf = await fetch(url(server, `/api/orders/${order.id}/confirm`), {
      method: "POST",
      headers: { cookie: dispatcherCookie, "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missingCloseCsrf.status, 403);
    assert.equal(((await missingCloseCsrf.json()) as { error: { code: string } }).error.code, "CSRF_INVALID");

    const planned = await send(server, "/api/planning/run", loaderCookie, { operationalDate: "2026-06-02" });
    assert.equal(planned.status, 403);
    const fabricated = await send(server, "/api/planning/run", dispatcherCookie, {
      operationalDate: "2026-06-02",
      feasible: true,
    });
    assert.equal(fabricated.status, 400);
    const before = world.tripRows.length;
    const ran = await send(server, "/api/planning/run", dispatcherCookie, { operationalDate: "2026-06-02" });
    assert.equal(ran.status, 200);
    const plan = (await ran.json()) as { operationalDate: string; trips: unknown[]; deferrals: { reason: string }[] };
    assert.equal(plan.operationalDate, "2026-06-02");
    assert.equal(plan.trips.length, 1);
    assert.equal(plan.deferrals[0]?.reason, "NO_CAPACITY");
    assert.equal(JSON.stringify(plan).includes("ortools"), false);
    assert.equal(world.tripRows.length, before);
    const readPlan = await fetch(url(server, "/api/planning/2026-06-02"), { headers: { cookie: dispatcherCookie } });
    assert.equal(readPlan.status, 200);
    const storedPlan = (await readPlan.json()) as { trips: { id: string; status: string }[] };
    assert.equal(storedPlan.trips.find((trip) => trip.id === plannedTrip)?.status, "PLANNED");
    assert.equal((await fetch(url(server, "/api/deferrals"), { headers: { cookie: managerCookie } })).status, 403);
    const deferrals = (await (await fetch(url(server, "/api/deferrals"), { headers: { cookie: dispatcherCookie } })).json()) as { reason: string }[];
    assert.equal(deferrals.some((item) => item.reason === "NO_CAPACITY"), true);
    const tripDetail = await fetch(url(server, `/api/trips/${plannedTrip}`), { headers: { cookie: dispatcherCookie } });
    assert.equal(tripDetail.status, 200);
    assert.equal(((await tripDetail.json()) as { status: string; depot: string }).depot, "Peliyagoda");
    assert.equal((await fetch(url(server, "/api/exceptions"), { headers: { cookie: loaderCookie } })).status, 403);
    const missingCsrf = await fetch(url(server, "/api/planning/run"), {
      method: "POST",
      headers: { cookie: dispatcherCookie, "content-type": "application/json" },
      body: JSON.stringify({ operationalDate: "2026-06-02" }),
    });
    assert.equal(missingCsrf.status, 403);
    assert.equal(((await missingCsrf.json()) as { error: { code: string } }).error.code, "CSRF_INVALID");

    const verified = await send(server, `/api/loading/${loadStop}/verify`, loaderCookie, { loadedUnits: 8 });
    assert.equal(verified.status, 201);
    const otherTask = await send(server, `/api/loading/${loadStop}/verify`, otherLoaderCookie, { loadedUnits: 8 });
    assert.equal(otherTask.status, 404);
    const shortfall = await send(server, `/api/loading/${loadStop}/shortfall`, loaderCookie, { shortfallUnits: 2, loaderUserId: loader.id });
    assert.equal(shortfall.status, 400);
    const reported = await send(server, `/api/loading/${loadStop}/shortfall`, loaderCookie, { shortfallUnits: 2, details: "missing" });
    assert.equal(reported.status, 200);
    const tasks = (await (await fetch(url(server, "/api/loading/tasks"), { headers: { cookie: otherLoaderCookie } })).json()) as unknown[];
    assert.equal(tasks.length, 0);

    const foreignRoute = await fetch(url(server, `/api/trips/${otherDriverTrip}`), { headers: { cookie: driverCookie } });
    assert.equal(foreignRoute.status, 404);
    const ownRoutes = (await (await fetch(url(server, "/api/driver/routes"), { headers: { cookie: driverCookie } })).json()) as { id: string }[];
    assert.equal(ownRoutes.some((trip) => trip.id === otherDriverTrip), false);
    const outcome = await send(server, `/api/deliveries/${deliveryStop}/outcome`, driverCookie, { outcome: "left at gate", status: "RECEIPT_CONFIRMED" });
    assert.equal(outcome.status, 400);
    const delivered = await send(server, `/api/deliveries/${deliveryStop}/outcome`, driverCookie, { outcome: "left at gate" });
    assert.equal(delivered.status, 201);
    const unassigned = await send(server, `/api/deliveries/${deliveryStop}/pod`, otherDriverCookie, { evidenceReference: "ref-1" });
    assert.equal(unassigned.status, 404);
    const proof = await send(server, `/api/deliveries/${deliveryStop}/pod`, driverCookie, { evidenceReference: "ref-1" });
    assert.equal(proof.status, 201);
    assert.equal(JSON.stringify(await proof.json()).includes("passwordHash"), false);

    const early = await send(server, `/api/orders/${earlyOrder}/receipt`, managerCookie, { result: "accepted" });
    assert.equal(early.status, 409);
    const cross = await send(server, `/api/orders/${receiptOrder}/receipt`, otherManagerCookie, { result: "accepted" });
    assert.equal(cross.status, 404);
    const confirmed = await send(server, `/api/orders/${receiptOrder}/receipt`, managerCookie, { result: "accepted", issueDetails: "one case short" });
    assert.equal(confirmed.status, 201);
    assert.equal(world.orderRows.find((item) => item.id === receiptOrder)?.status, "RECEIPT_CONFIRMED");

    const deniedException = await send(server, "/api/exceptions", loaderCookie, { category: "loading problem" });
    assert.equal(deniedException.status, 403);
    const context = await send(server, "/api/exceptions", dispatcherCookie, { category: "loading problem", orderId: loadOrder, severity: "high" });
    assert.equal(context.status, 400);
    const exception = await send(server, "/api/exceptions", dispatcherCookie, { category: "loading problem" });
    assert.equal(exception.status, 201);
    const listed = (await (await fetch(url(server, "/api/exceptions"), { headers: { cookie: dispatcherCookie } })).json()) as { category: string }[];
    assert.equal(listed.some((item) => item.category === "loading problem"), true);
    assert.equal(JSON.stringify(listed).includes("orderId"), false);
    const confirmedTrip = await send(server, `/api/trips/${plannedTrip}/confirm`, dispatcherCookie, {});
    assert.equal(confirmedTrip.status, 200);
    assert.equal(((await confirmedTrip.json()) as { status: string }).status, "CONFIRMED");
    const repeated = await send(server, `/api/trips/${plannedTrip}/confirm`, dispatcherCookie, {});
    assert.equal(repeated.status, 409);
    assert.equal(((await repeated.json()) as { error: { code: string } }).error.code, "INVALID_STATE_TRANSITION");
    const reread = (await (await fetch(url(server, "/api/planning/2026-06-02"), { headers: { cookie: dispatcherCookie } })).json()) as { trips: { id: string; status: string }[] };
    assert.equal(reread.trips.find((trip) => trip.id === plannedTrip)?.status, "CONFIRMED");
    assert.equal(world.orderRows.find((item) => item.id === loadOrder)?.orderUnits, 10);
    assert.equal(world.orderRows.find((item) => item.id === loadOrder)?.orderWeightKg, "12.5");
  } finally {
    await close(server);
  }
});

function orderBody(): Record<string, unknown> {
  return {
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId: outletA,
    tempRequirement: "chilled",
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
  };
}

function memoryCore(): CoreDependencies & { orderRows: StoredOrder[]; tripRows: MemoryTrip[] } {
  const outlets = new Map<string, OrderOutlet>([
    [outletA, { id: outletA, outletCode: "OUT001", brand: "Fresh", district: "Colombo", depot: "Peliyagoda" }],
    [outletB, { id: outletB, outletCode: "OUT002", brand: "Fresh", district: "Colombo", depot: "Peliyagoda" }],
  ]);
  const state = {
    orders: [
      order(loadOrder, "LOAD-1", "PLANNED_ALLOCATED"),
      order(deliveryOrder, "DEL-1", "DISPATCHED"),
      order(receiptOrder, "REC-1", "DELIVERED"),
      order(earlyOrder, "EARLY-1", "DISPATCHED"),
    ] as StoredOrder[],
    trips: [
      trip(plannedTrip, driver.id, "PLANNED", "2026-06-02", []),
      trip(driverTrip, driver.id, "CONFIRMED", "2026-06-07", [stop(loadStop, loadOrder), stop(deliveryStop, deliveryOrder)]),
      trip(otherDriverTrip, otherDriver.id, "CONFIRMED", "2026-06-03", []),
      trip(receiptTrip, driver.id, "CONFIRMED", "2026-06-04", [stop(receiptStop, receiptOrder)]),
      trip(earlyTrip, driver.id, "CONFIRMED", "2026-06-05", [stop(earlyStop, earlyOrder)]),
    ] as MemoryTrip[],
    loading: [] as StoredLoading[],
    deliveries: [
      delivery(receiptDelivery, receiptStop),
      delivery(earlyDelivery, earlyStop),
    ] as StoredDelivery[],
    proofs: [] as StoredProof[],
    deferrals: [{ id: randomUUID(), orderId: loadOrder, reason: "NO_CAPACITY", reportedAt: now }] as StoredDeferral[],
    exceptions: [] as StoredException[],
    receipts: [] as string[],
  };
  const ordersApi = orderStore();
  const core: CoreDependencies = {
    now: () => now,
    orders: ordersApi,
    trips: tripStore(),
    loading: loadingStore(),
    deliveries: deliveryStore(),
    deferrals: unusedStore<DeferralStore>(),
    exceptions: {
      async create(input) {
        const row: StoredException = { ...input, id: randomUUID(), reportedByUserId: input.reportedByUserId };
        state.exceptions.push(row);
        return row;
      },
    } satisfies ExceptionStore,
    receipts: receiptStore(),
    async listOrders(filter) {
      return state.orders.filter((item) => {
        if (filter.outletIds !== undefined && !filter.outletIds.includes(item.outletId)) return false;
        if (filter.outletId !== undefined && item.outletId !== filter.outletId) return false;
        if (filter.status !== undefined && item.status !== filter.status) return false;
        if (filter.orderDate !== undefined && item.orderDate !== filter.orderDate) return false;
        return true;
      });
    },
    async findTripScope(id) {
      return state.trips.find((item) => item.id === id) ?? null;
    },
    async listDriverTrips(driverUserId) {
      return state.trips.filter((item) => item.vehicleDriverUserId === driverUserId);
    },
    async listTripsOnDate(operationalDate) {
      return state.trips.filter((item) => item.operationalDate === operationalDate);
    },
    async listDeferrals(filter) {
      return state.deferrals.filter((item) => {
        if (filter.orderId !== undefined && item.orderId !== filter.orderId) return false;
        if (filter.reason !== undefined && item.reason !== filter.reason) return false;
        if (filter.orderDate !== undefined) {
          return state.orders.find((order) => order.id === item.orderId)?.orderDate === filter.orderDate;
        }
        return true;
      });
    },
    async listLoading(loaderUserId) {
      return state.loading.filter((item) => item.loaderUserId === loaderUserId);
    },
    async deliveryIdsForOrder(orderId) {
      const stopIds = new Set(state.trips.flatMap((item) => item.stops).filter((stop) => stop.orderId === orderId).map((stop) => stop.id));
      return state.deliveries.filter((item) => stopIds.has(item.tripStopId)).map((item) => item.id);
    },
    async listExceptions() {
      return state.exceptions;
    },
  };
  return Object.assign(core, { orderRows: state.orders, tripRows: state.trips });

  function orderStore(): OrderStore {
    return {
      async findOutletById(id) {
        return outlets.get(id) ?? null;
      },
      async findByDeliveryId(deliveryId) {
        return state.orders.find((item) => item.deliveryId === deliveryId) ?? null;
      },
      async findById(id) {
        return state.orders.find((item) => item.id === id) ?? null;
      },
      async findTransitionFacts(orderId) {
        return facts(orderId);
      },
      async create(input) {
        const outlet = outlets.get(input.outletId);
        if (outlet === undefined) throw new Error("missing outlet");
        const created: StoredOrder = {
          id: randomUUID(),
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
        state.orders.push(created);
        return created;
      },
      async compareAndSetStatus(input) {
        const current = state.orders.find((item) => item.id === input.id);
        if (current === undefined || current.status !== input.expected) return null;
        current.status = input.next;
        if (input.next === "SUBMITTED") current.submittedAt = input.submittedAt;
        return current;
      },
    };
  }

  function tripStore(): TripStore {
    return {
      transaction: (work) => rollback(work, tripUnit()),
    };
  }

  function loadingStore(): LoadingStore {
    return { transaction: (work) => rollback(work, loadingUnit()) };
  }

  function deliveryStore(): DeliveryStore {
    return { transaction: (work) => rollback(work, deliveryUnit()) };
  }

  function receiptStore(): ReceiptStore {
    return { transaction: (work) => rollback(work, receiptUnit()) };
  }

  function tripUnit(): import("../domain/trip.js").TripUnit {
    return {
      orders: orderStore(),
      async findVehicle() { return null; },
      async findAllocationOrder() { return null; },
      async findTripById(id) { return state.trips.find((item) => item.id === id) ?? null; },
      async tripSlotTaken() { return false; },
      async countTrips() { return 0; },
      async routeTaken() { return false; },
      async orderHasStop() { return false; },
      async createTrip() { throw new Error("the endpoint does not create a trip"); },
      async createStop() { throw new Error("the endpoint does not create a stop"); },
      async compareAndSetTripStatus(id, expected, next) {
        const current = state.trips.find((item) => item.id === id);
        if (current === undefined || current.status !== expected) return null;
        current.status = next;
        return current;
      },
    };
  }

  function loadingUnit(): import("../domain/loading.js").LoadingUnit {
    return {
      orders: orderStore(),
      async findStop(id) {
        const located = locateStop(id);
        if (located === null) return null;
        return {
          id: located.stop.id,
          tripStatus: located.trip.status,
          orderId: located.order.id,
          orderStatus: located.order.status,
          orderUnits: located.order.orderUnits,
          orderWeightKg: located.order.orderWeightKg,
          orderVolumeM3: located.order.orderVolumeM3,
          brand: located.order.brand,
          district: located.order.district,
          depot: located.order.depot,
        };
      },
      async findByStop(tripStopId) {
        return state.loading.find((item) => item.tripStopId === tripStopId) ?? null;
      },
      async create(input) {
        if (state.loading.some((item) => item.tripStopId === input.tripStopId)) return "conflict";
        const row: StoredLoading = { ...input, id: randomUUID(), shortfallUnits: null, shortfallReportedAt: null, details: null };
        state.loading.push(row);
        const trip = state.trips.find((item) => item.stops.some((stop) => stop.id === input.tripStopId));
        if (trip !== undefined) {
          trip.loaderUserIds = [...trip.loaderUserIds, input.loaderUserId];
        }
        return row;
      },
      async recordShortfall(input) {
        const row = state.loading.find((item) => item.id === input.id);
        if (row === undefined || row.shortfallUnits !== null) return null;
        row.shortfallUnits = input.shortfallUnits;
        row.shortfallReportedAt = input.reportedAt;
        row.details = input.details;
        return row;
      },
    };
  }

  function deliveryUnit(): import("../domain/delivery.js").DeliveryUnit {
    return {
      orders: orderStore(),
      async findStop(id) {
        const located = locateStop(id);
        if (located === null) return null;
        return {
          id: located.stop.id,
          tripStatus: located.trip.status,
          vehicleDriverUserId: located.trip.vehicleDriverUserId,
          orderId: located.order.id,
          orderStatus: located.order.status,
          orderUnits: located.order.orderUnits,
          orderWeightKg: located.order.orderWeightKg,
          orderVolumeM3: located.order.orderVolumeM3,
          tempRequirement: located.order.tempRequirement,
          brand: located.order.brand,
          district: located.order.district,
          depot: located.order.depot,
        };
      },
      async findDeliveryByStop(tripStopId) {
        return state.deliveries.find((item) => item.tripStopId === tripStopId) ?? null;
      },
      async createDelivery(input) {
        if (state.deliveries.some((item) => item.tripStopId === input.tripStopId)) return "conflict";
        const row: StoredDelivery = { ...input, id: randomUUID() };
        state.deliveries.push(row);
        return row;
      },
      async createProof(input) {
        const row: StoredProof = { ...input, id: randomUUID(), capturedByUserId: input.capturedByUserId };
        state.proofs.push(row);
        return row;
      },
    };
  }

  function receiptUnit(): import("../domain/receipt.js").ReceiptUnit {
    return {
      orders: orderStore(),
      async findDelivery(id) {
        const row = state.deliveries.find((item) => item.id === id);
        const located = row === undefined ? null : locateStop(row.tripStopId);
        if (row === undefined || located === null) return null;
        return {
          id: row.id,
          orderId: located.order.id,
          orderStatus: located.order.status,
          outletId: located.order.outletId,
          orderUnits: located.order.orderUnits,
          orderWeightKg: located.order.orderWeightKg,
          orderVolumeM3: located.order.orderVolumeM3,
          tempRequirement: located.order.tempRequirement,
          brand: located.order.brand,
          district: located.order.district,
          depot: located.order.depot,
          outcome: row.outcome,
          hasReceipt: state.receipts.includes(row.id),
        };
      },
      async create(input) {
        if (state.receipts.includes(input.deliveryRecordId)) return "conflict";
        state.receipts.push(input.deliveryRecordId);
        return {
          id: randomUUID(),
          deliveryRecordId: input.deliveryRecordId,
          storeManagerUserId: input.storeManagerUserId,
          confirmedAt: input.confirmedAt,
          result: input.result,
          issueDetails: input.issueDetails,
        };
      },
    };
  }

  function locateStop(id: string): { trip: MemoryTrip; stop: StoredStop; order: StoredOrder } | null {
    for (const current of state.trips) {
      const stop = current.stops.find((item) => item.id === id);
      const currentOrder = stop === undefined ? undefined : state.orders.find((item) => item.id === stop.orderId);
      if (stop !== undefined && currentOrder !== undefined) return { trip: current, stop, order: currentOrder };
    }
    return null;
  }

  function facts(orderId: string): OrderTransitionFacts {
    const stopIds = state.trips.flatMap((item) => item.stops).filter((stop) => stop.orderId === orderId).map((stop) => stop.id);
    return {
      tripStopCount: stopIds.length,
      deferralCount: state.deferrals.filter((item) => item.orderId === orderId).length,
      loaderUserIds: state.loading.filter((item) => stopIds.includes(item.tripStopId)).map((item) => item.loaderUserId),
      deliveryDriverUserIds: state.deliveries.filter((item) => stopIds.includes(item.tripStopId)).map((item) => item.driverUserId),
    };
  }

  async function rollback<TUnit, T>(work: (unit: TUnit) => Promise<T>, unit: TUnit): Promise<T> {
    const snapshot = structuredClone(state);
    try {
      return await work(unit);
    } catch (error) {
      state.orders.splice(0, state.orders.length, ...snapshot.orders);
      state.trips.splice(0, state.trips.length, ...snapshot.trips);
      state.loading.splice(0, state.loading.length, ...snapshot.loading);
      state.deliveries.splice(0, state.deliveries.length, ...snapshot.deliveries);
      state.proofs.splice(0, state.proofs.length, ...snapshot.proofs);
      state.deferrals.splice(0, state.deferrals.length, ...snapshot.deferrals);
      state.exceptions.splice(0, state.exceptions.length, ...snapshot.exceptions);
      state.receipts.splice(0, state.receipts.length, ...snapshot.receipts);
      throw error;
    }
  }
}

type MemoryTrip = TripScope;

function order(id: string, deliveryId: string, status: StoredOrder["status"]): StoredOrder {
  return {
    id,
    deliveryId,
    orderDate: "2026-06-02",
    outletId: outletA,
    outletCode: "OUT001",
    brand: "Fresh",
    district: "Colombo",
    depot: "Peliyagoda",
    createdByUserId: manager.id,
    status,
    tempRequirement: "chilled",
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
    submittedAt: now,
  };
}

function trip(id: string, driverUserId: string, status: MemoryTrip["status"], operationalDate: string, stops: StoredStop[]): MemoryTrip {
  return {
    id,
    routeId: null,
    operationalDate,
    vehicleId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    depot: "Peliyagoda",
    tripNumber: 1,
    status,
    stops: stops.map((stop) => ({ ...stop, tripId: id })),
    vehicleDriverUserId: driverUserId,
    outletIds: [outletA],
    loaderUserIds: [],
  };
}

function stop(id: string, orderId: string): StoredStop {
  return { id, tripId: "", orderId, sequence: 0, plannedArrival: null };
}

function delivery(id: string, tripStopId: string): StoredDelivery {
  return {
    id,
    tripStopId,
    driverUserId: driver.id,
    deliveredAt: now,
    outcome: "left at gate",
    deliveredUnits: 10,
    notes: null,
  };
}

function unusedStore<T>(): T {
  return { transaction: async () => { throw new Error("unused"); } } as T;
}

function user(id: string, loginIdentifier: string, role: AuthUserRecord["role"]): AuthUserRecord {
  return { id, loginIdentifier, displayName: loginIdentifier, role, active: true, passwordHash: "not-used" };
}

function directory(records: AuthUserRecord[]): UserDirectory {
  return {
    async findByLoginIdentifier(loginIdentifier) {
      return records.find((item) => item.loginIdentifier === loginIdentifier) ?? null;
    },
    async findById(id) {
      return records.find((item) => item.id === id) ?? null;
    },
  };
}

function memorySessions(): SessionStore {
  const rows: SessionRecord[] = [];
  return {
    async create(record) { rows.push({ ...record }); },
    async findByTokenHash(sessionTokenHash) { return rows.find((row) => row.sessionTokenHash === sessionTokenHash) ?? null; },
    async revoke(sessionId, revokedAt) {
      const row = rows.find((item) => item.id === sessionId);
      if (row) row.revokedAt = revokedAt;
    },
    async touchLastSeen(sessionId, lastSeenAt) {
      const row = rows.find((item) => item.id === sessionId);
      if (row) row.lastSeenAt = lastSeenAt;
    },
  };
}

async function cookieFor(record: AuthUserRecord, sessions: SessionStore): Promise<string> {
  const created = await createAuthenticatedSession({ userId: record.id, now, store: sessions, nodeEnv: "test" });
  return created.cookie.split(";")[0] ?? "";
}

function csrfFor(cookie: string): string {
  return createCsrfToken(cookie.split("=")[1] ?? "");
}

async function send(server: Server, path: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(url(server, path), {
    method: "POST",
    headers: { cookie, "content-type": "application/json", "x-wayloom-csrf": csrfFor(cookie) },
    body: JSON.stringify(body),
  });
}

function silentLog(): Logger {
  return { error() {}, info() {} };
}

async function listen(handler: ReturnType<typeof createApp>): Promise<Server> {
  const server = createServer(handler);
  await new Promise<void>((resolveListen) => { server.listen(0, "127.0.0.1", () => resolveListen()); });
  return server;
}

function url(server: Server, path: string): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(address.port)}${path}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => { if (error) rejectClose(error); else resolveClose(); });
  });
}
