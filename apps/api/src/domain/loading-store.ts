import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import { domainTransactionOptions } from "./domain-transaction.js";
import { prismaOrderStore } from "./order-store.js";
import type { LoadingStop, LoadingStore, LoadingUnit, StoredLoading } from "./loading.js";

type LoadingDatabase = Pick<PrismaClient, "tripStop" | "loadingRecord" | "order" | "outlet" | "deferral">;

export function prismaLoadingStore(prisma: PrismaClient): LoadingStore {
  return {
    transaction(work) {
      return prisma.$transaction((transaction) => work(loadingUnit(transaction)), domainTransactionOptions);
    },
  };
}

function loadingUnit(prisma: LoadingDatabase): LoadingUnit {
  return {
    orders: prismaOrderStore(prisma),
    async findStop(id) {
      const stop = await prisma.tripStop.findUnique({
        where: { id },
        include: { trip: true, order: { include: { outlet: true } } },
      });
      if (stop === null) {
        return null;
      }
      return {
        id: stop.id,
        tripStatus: stop.trip.status,
        orderId: stop.orderId,
        orderStatus: stop.order.status,
        orderUnits: stop.order.orderUnits,
        orderWeightKg: stop.order.orderWeightKg.toString(),
        orderVolumeM3: stop.order.orderVolumeM3.toString(),
        brand: stop.order.outlet.brand,
        district: stop.order.outlet.district,
        depot: stop.order.outlet.depot,
      } satisfies LoadingStop;
    },
    async findByStop(tripStopId) {
      const record = await prisma.loadingRecord.findFirst({ where: { tripStopId } });
      return record === null ? null : toStored(record);
    },
    async create(input) {
      try {
        const record = await prisma.loadingRecord.create({
          data: {
            id: randomUUID(),
            tripStopId: input.tripStopId,
            loaderUserId: input.loaderUserId,
            expectedUnits: input.expectedUnits,
            loadedUnits: input.loadedUnits,
            shortfallUnits: null,
            verifiedAt: input.verifiedAt,
            shortfallReportedAt: null,
            details: null,
          },
        });
        return toStored(record);
      } catch (error) {
        if (isUniqueConflict(error)) {
          return "conflict";
        }
        throw error;
      }
    },
    async recordShortfall(input) {
      const written = await prisma.loadingRecord.updateMany({
        where: { id: input.id, shortfallReportedAt: null },
        data: {
          shortfallUnits: input.shortfallUnits,
          shortfallReportedAt: input.reportedAt,
          details: input.details,
        },
      });
      if (written.count !== 1) {
        return null;
      }
      const record = await prisma.loadingRecord.findUnique({ where: { id: input.id } });
      return record === null ? null : toStored(record);
    },
  };
}

function toStored(record: {
  id: string;
  tripStopId: string;
  loaderUserId: string;
  expectedUnits: number;
  loadedUnits: number;
  shortfallUnits: number | null;
  verifiedAt: Date;
  shortfallReportedAt: Date | null;
  details: string | null;
}): StoredLoading {
  return {
    id: record.id,
    tripStopId: record.tripStopId,
    loaderUserId: record.loaderUserId,
    expectedUnits: record.expectedUnits,
    loadedUnits: record.loadedUnits,
    shortfallUnits: record.shortfallUnits,
    verifiedAt: record.verifiedAt,
    shortfallReportedAt: record.shortfallReportedAt,
    details: record.details,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
