import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import { domainTransactionOptions } from "./domain-transaction.js";
import { prismaOrderStore } from "./order-store.js";
import type {
  AllocationOrder,
  StoredStop,
  StoredTrip,
  TripStatusName,
  TripStore,
  TripUnit,
  TripVehicle,
} from "./trip.js";

type TripDatabase = Pick<PrismaClient, "vehicle" | "order" | "trip" | "tripStop" | "outlet" | "deferral">;

export function prismaTripStore(prisma: PrismaClient): TripStore {
  return {
    transaction(work) {
      return prisma.$transaction((transaction) => work(tripUnit(transaction)), domainTransactionOptions);
    },
  };
}

function tripUnit(prisma: TripDatabase): TripUnit {
  return {
    orders: prismaOrderStore(prisma),
    async findVehicle(id) {
      const vehicle = await prisma.vehicle.findUnique({ where: { id } });
      if (vehicle === null) {
        return null;
      }
      return {
        id: vehicle.id,
        type: vehicle.type,
        temp: vehicle.temp,
        weightCapKg: vehicle.weightCapKg.toString(),
        volumeCapM3: vehicle.volumeCapM3.toString(),
        depot: vehicle.depot,
        driverUserId: vehicle.driverUserId,
      } satisfies TripVehicle;
    },
    async findAllocationOrder(id) {
      const order = await prisma.order.findUnique({ where: { id }, include: { outlet: true } });
      if (order === null) {
        return null;
      }
      return {
        id: order.id,
        status: order.status,
        tempRequirement: order.tempRequirement,
        orderWeightKg: order.orderWeightKg.toString(),
        orderVolumeM3: order.orderVolumeM3.toString(),
        brand: order.outlet.brand,
        district: order.outlet.district,
        depot: order.outlet.depot,
        parkingConstraint: order.outlet.parkingConstraint,
        windowOpen: clock(order.outlet.windowOpenTime),
        windowClose: clock(order.outlet.windowCloseTime),
        submittedAt: order.submittedAt,
      } satisfies AllocationOrder;
    },
    async findTripById(id) {
      const trip = await prisma.trip.findUnique({
        where: { id },
        include: { stops: { orderBy: { sequence: "asc" } } },
      });
      return trip === null ? null : toStoredTrip(trip);
    },
    async tripSlotTaken(vehicleId, operationalDate, tripNumber) {
      const trip = await prisma.trip.findUnique({
        where: {
          vehicleId_operationalDate_tripNumber: {
            vehicleId,
            operationalDate: utcDate(operationalDate),
            tripNumber,
          },
        },
      });
      return trip !== null;
    },
    async countTrips(vehicleId, operationalDate) {
      return prisma.trip.count({
        where: { vehicleId, operationalDate: utcDate(operationalDate) },
      });
    },
    async routeTaken(routeId) {
      const trip = await prisma.trip.findUnique({ where: { routeId } });
      return trip !== null;
    },
    async orderHasStop(orderId) {
      const stop = await prisma.tripStop.findFirst({ where: { orderId }, select: { id: true } });
      return stop !== null;
    },
    async createTrip(input) {
      try {
        const trip = await prisma.trip.create({
          data: {
            id: randomUUID(),
            routeId: input.routeId,
            operationalDate: utcDate(input.operationalDate),
            vehicleId: input.vehicleId,
            depot: input.depot as TripVehicle["depot"] & ("Peliyagoda" | "Kandy"),
            tripNumber: input.tripNumber,
            status: "PLANNED",
          },
        });
        return { ...toStoredTrip({ ...trip, stops: [] }) };
      } catch (error) {
        if (isUniqueConflict(error)) {
          return "conflict";
        }
        throw error;
      }
    },
    async createStop(input) {
      try {
        const stop = await prisma.tripStop.create({
          data: {
            id: randomUUID(),
            tripId: input.tripId,
            orderId: input.orderId,
            sequence: input.sequence,
            plannedArrival: input.plannedArrival === null ? null : utcTime(input.plannedArrival),
          },
        });
        return toStoredStop(stop);
      } catch (error) {
        if (isUniqueConflict(error)) {
          return "conflict";
        }
        throw error;
      }
    },
    async compareAndSetTripStatus(id, expected, next) {
      const written = await prisma.trip.updateMany({
        where: { id, status: expected },
        data: { status: next },
      });
      if (written.count !== 1) {
        return null;
      }
      const trip = await prisma.trip.findUnique({
        where: { id },
        include: { stops: { orderBy: { sequence: "asc" } } },
      });
      return trip === null ? null : toStoredTrip(trip);
    },
  };
}

function toStoredTrip(trip: {
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
    stops: trip.stops.map((stop) => toStoredStop(stop)),
  };
}

function toStoredStop(stop: {
  id: string;
  tripId: string;
  orderId: string;
  sequence: number;
  plannedArrival: Date | null;
}): StoredStop {
  return {
    id: stop.id,
    tripId: stop.tripId,
    orderId: stop.orderId,
    sequence: stop.sequence,
    plannedArrival: clock(stop.plannedArrival),
  };
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function utcTime(value: string): Date {
  const seconds = value.length === 5 ? `${value}:00` : value;
  return new Date(`1970-01-01T${seconds}.000Z`);
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

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
