import type { PrismaClient } from "../generated/prisma/client.js";
import type { DeferralReasonName, StoredDeferral } from "../domain/deferral.js";
import { prismaDeferralStore } from "../domain/deferral-store.js";
import { prismaDeliveryStore } from "../domain/delivery-store.js";
import { prismaExceptionStore } from "../domain/exception-store.js";
import type { StoredException } from "../domain/exception.js";
import type { StoredLoading } from "../domain/loading.js";
import { prismaLoadingStore } from "../domain/loading-store.js";
import type { StoredOrder } from "../domain/order.js";
import { prismaOrderStore } from "../domain/order-store.js";
import { prismaReceiptStore } from "../domain/receipt-store.js";
import { prismaSyncBatchStore } from "../domain/sync-event-store.js";
import type { StoredTrip, TripStatusName } from "../domain/trip.js";
import { prismaTripStore } from "../domain/trip-store.js";
import { loadPlanningRunContext } from "./planning-load.js";
import type { EligibleLoadingStopResponse } from "../contracts/api-contracts.js";
import type { CoreDependencies, OrderListFilter, TripScope } from "./core-routes.js";

export function prismaCore(prisma: PrismaClient): Omit<CoreDependencies, "now"> {
  return {
    orders: prismaOrderStore(prisma),
    trips: prismaTripStore(prisma),
    loading: prismaLoadingStore(prisma),
    deliveries: prismaDeliveryStore(prisma),
    deferrals: prismaDeferralStore(prisma),
    exceptions: prismaExceptionStore(prisma),
    receipts: prismaReceiptStore(prisma),
    sync: prismaSyncBatchStore(prisma),
    listOrders(filter) {
      return listOrders(prisma, filter);
    },
    findTripScope(id) {
      return findTripScope(prisma, id);
    },
    listDriverTrips(driverUserId) {
      return listDriverTrips(prisma, driverUserId);
    },
    listTripsOnDate(operationalDate) {
      return listTripsOnDate(prisma, operationalDate);
    },
    listDeferrals(filter) {
      return listDeferrals(prisma, filter);
    },
    listLoading(loaderUserId) {
      return listLoading(prisma, loaderUserId);
    },
    listEligibleLoadingStops() {
      return listEligibleLoadingStops(prisma);
    },
    deliveryIdsForOrder(orderId) {
      return deliveryIdsForOrder(prisma, orderId);
    },
    listExceptions() {
      return listExceptions(prisma);
    },
    loadPlanningRunContext(operationalDate) {
      return loadPlanningRunContext(prisma, operationalDate);
    },
  };
}

async function listOrders(prisma: PrismaClient, filter: OrderListFilter): Promise<StoredOrder[]> {
  const orders = await prisma.order.findMany({
    where: {
      ...(filter.outletIds === undefined ? {} : { outletId: { in: [...filter.outletIds] } }),
      ...(filter.outletId === undefined ? {} : { outletId: filter.outletId }),
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.orderDate === undefined ? {} : { orderDate: utcDate(filter.orderDate) }),
    },
    include: { outlet: true },
    orderBy: { deliveryId: "asc" },
  });
  return orders.map((order) => ({
    id: order.id,
    deliveryId: order.deliveryId,
    orderDate: order.orderDate.toISOString().slice(0, 10),
    outletId: order.outletId,
    outletCode: order.outlet.outletId,
    brand: order.outlet.brand,
    district: order.outlet.district,
    depot: order.outlet.depot,
    createdByUserId: order.createdByUserId,
    status: order.status,
    tempRequirement: order.tempRequirement,
    orderUnits: order.orderUnits,
    orderWeightKg: order.orderWeightKg.toString(),
    orderVolumeM3: order.orderVolumeM3.toString(),
    submittedAt: order.submittedAt,
  }));
}

async function findTripScope(prisma: PrismaClient, id: string): Promise<TripScope | null> {
  const trip = await prisma.trip.findUnique({
    where: { id },
    include: {
      vehicle: { select: { driverUserId: true } },
      stops: {
        orderBy: { sequence: "asc" },
        include: {
          order: { select: { outletId: true } },
          loadingRecords: { select: { loaderUserId: true } },
        },
      },
    },
  });
  if (trip === null) {
    return null;
  }
  return {
    ...toTrip(trip),
    vehicleDriverUserId: trip.vehicle.driverUserId,
    outletIds: trip.stops.map((stop) => stop.order.outletId),
    loaderUserIds: trip.stops.flatMap((stop) => stop.loadingRecords.map((record) => record.loaderUserId)),
  };
}

async function listDriverTrips(prisma: PrismaClient, driverUserId: string): Promise<StoredTrip[]> {
  const trips = await prisma.trip.findMany({
    where: { vehicle: { driverUserId } },
    include: { stops: { orderBy: { sequence: "asc" } } },
    orderBy: [{ operationalDate: "asc" }, { tripNumber: "asc" }],
  });
  return trips.map((trip) => toTrip(trip));
}

async function listTripsOnDate(prisma: PrismaClient, operationalDate: string): Promise<StoredTrip[]> {
  const trips = await prisma.trip.findMany({
    where: { operationalDate: utcDate(operationalDate) },
    include: { stops: { orderBy: { sequence: "asc" } } },
    orderBy: { tripNumber: "asc" },
  });
  return trips.map((trip) => toTrip(trip));
}

async function listDeferrals(
  prisma: PrismaClient,
  filter: { orderId?: string; reason?: DeferralReasonName; orderDate?: string },
): Promise<StoredDeferral[]> {
  const rows = await prisma.deferral.findMany({
    where: {
      ...(filter.orderId === undefined ? {} : { orderId: filter.orderId }),
      ...(filter.reason === undefined ? {} : { reason: filter.reason }),
      ...(filter.orderDate === undefined ? {} : { order: { orderDate: utcDate(filter.orderDate) } }),
    },
    orderBy: { reportedAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    orderId: row.orderId,
    reason: row.reason,
    reportedAt: row.reportedAt,
  }));
}

async function listEligibleLoadingStops(prisma: PrismaClient): Promise<EligibleLoadingStopResponse[]> {
  const rows = await prisma.tripStop.findMany({
    where: {
      trip: { status: "CONFIRMED" },
      order: { status: "PLANNED_ALLOCATED" },
      loadingRecords: { none: {} },
    },
    include: {
      trip: { include: { vehicle: { include: { driver: { select: { displayName: true } } } } } },
      order: { include: { outlet: true } },
    },
    orderBy: [{ trip: { operationalDate: "asc" } }, { trip: { tripNumber: "asc" } }, { sequence: "asc" }],
  });
  return rows.map((row) => ({
    tripStopId: row.id,
    sequence: row.sequence,
    plannedArrival: clock(row.plannedArrival),
    tripId: row.tripId,
    routeId: row.trip.routeId,
    operationalDate: row.trip.operationalDate.toISOString().slice(0, 10),
    depot: row.trip.depot,
    tripNumber: row.trip.tripNumber,
    vehicleId: row.trip.vehicle.vehicleId,
    vehicleType: row.trip.vehicle.type,
    vehicleTemp: row.trip.vehicle.temp,
    weightCapKg: row.trip.vehicle.weightCapKg.toString(),
    volumeCapM3: row.trip.vehicle.volumeCapM3.toString(),
    driverName: row.trip.vehicle.driver?.displayName ?? null,
    orderId: row.orderId,
    deliveryId: row.order.deliveryId,
    outletCode: row.order.outlet.outletId,
    district: row.order.outlet.district,
    brand: row.order.outlet.brand,
    tempRequirement: row.order.tempRequirement,
    expectedUnits: row.order.orderUnits,
    orderWeightKg: row.order.orderWeightKg.toString(),
    orderVolumeM3: row.order.orderVolumeM3.toString(),
  }));
}

async function listLoading(prisma: PrismaClient, loaderUserId: string): Promise<StoredLoading[]> {
  const rows = await prisma.loadingRecord.findMany({
    where: { loaderUserId },
    orderBy: { verifiedAt: "asc" },
  });
  return rows.map((row) => ({
    id: row.id,
    tripStopId: row.tripStopId,
    loaderUserId: row.loaderUserId,
    expectedUnits: row.expectedUnits,
    loadedUnits: row.loadedUnits,
    shortfallUnits: row.shortfallUnits,
    verifiedAt: row.verifiedAt,
    shortfallReportedAt: row.shortfallReportedAt,
    details: row.details,
  }));
}

async function deliveryIdsForOrder(prisma: PrismaClient, orderId: string): Promise<string[]> {
  const rows = await prisma.deliveryRecord.findMany({
    where: { tripStop: { orderId } },
    select: { id: true },
    orderBy: { deliveredAt: "asc" },
  });
  return rows.map((row) => row.id);
}

async function listExceptions(prisma: PrismaClient): Promise<StoredException[]> {
  const rows = await prisma.exception.findMany({ orderBy: { occurredAt: "asc" } });
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    details: row.details,
    occurredAt: row.occurredAt,
    reportedByUserId: row.reportedByUserId,
  }));
}

function toTrip(trip: {
  id: string;
  routeId: string | null;
  operationalDate: Date;
  vehicleId: string;
  depot: string;
  tripNumber: number;
  status: TripStatusName;
  stops: readonly {
    id: string;
    tripId: string;
    orderId: string;
    sequence: number;
    plannedArrival: Date | null;
  }[];
}): StoredTrip {
  return {
    id: trip.id,
    routeId: trip.routeId,
    operationalDate: trip.operationalDate.toISOString().slice(0, 10),
    vehicleId: trip.vehicleId,
    depot: trip.depot,
    tripNumber: trip.tripNumber,
    status: trip.status,
    stops: trip.stops.map((stop) => ({
      id: stop.id,
      tripId: stop.tripId,
      orderId: stop.orderId,
      sequence: stop.sequence,
      plannedArrival: clock(stop.plannedArrival),
    })),
  };
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function clock(value: Date | null): string | null {
  if (value === null) {
    return null;
  }
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  const seconds = String(value.getUTCSeconds()).padStart(2, "0");
  return seconds === "00" ? `${hours}:${minutes}` : `${hours}:${minutes}:${seconds}`;
}
