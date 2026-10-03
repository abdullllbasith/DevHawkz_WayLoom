import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import { domainTransactionOptions } from "./domain-transaction.js";
import { prismaOrderStore } from "./order-store.js";
import type { DeferralOrder, DeferralReasonName, DeferralStore, DeferralUnit, StoredDeferral } from "./deferral.js";

type DeferralDatabase = Pick<PrismaClient, "order" | "outlet" | "tripStop" | "deferral">;

export function prismaDeferralStore(prisma: PrismaClient): DeferralStore {
  return {
    transaction(work) {
      return prisma.$transaction((transaction) => work(deferralUnit(transaction)), domainTransactionOptions);
    },
  };
}

function deferralUnit(prisma: DeferralDatabase): DeferralUnit {
  return {
    orders: prismaOrderStore(prisma),
    async findOrder(id) {
      const order = await prisma.order.findUnique({
        where: { id },
        include: { outlet: true, tripStops: { select: { id: true }, take: 1 } },
      });
      if (order === null) {
        return null;
      }
      return {
        id: order.id,
        status: order.status,
        hasTripStop: order.tripStops.length > 0,
        orderUnits: order.orderUnits,
        orderWeightKg: order.orderWeightKg.toString(),
        orderVolumeM3: order.orderVolumeM3.toString(),
        tempRequirement: order.tempRequirement,
        brand: order.outlet.brand,
        district: order.outlet.district,
        depot: order.outlet.depot,
      } satisfies DeferralOrder;
    },
    async listByOrder(orderId) {
      const rows = await prisma.deferral.findMany({ where: { orderId }, orderBy: { reportedAt: "asc" } });
      return rows.map((row) => toStored(row));
    },
    async create(input) {
      const row = await prisma.deferral.create({
        data: {
          id: randomUUID(),
          orderId: input.orderId,
          reason: input.reason,
          reportedAt: input.reportedAt,
        },
      });
      return toStored(row);
    },
  };
}

function toStored(row: {
  id: string;
  orderId: string;
  reason: DeferralReasonName;
  reportedAt: Date;
}): StoredDeferral {
  return {
    id: row.id,
    orderId: row.orderId,
    reason: row.reason,
    reportedAt: row.reportedAt,
  };
}
