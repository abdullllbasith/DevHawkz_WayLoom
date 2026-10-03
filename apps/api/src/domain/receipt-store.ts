import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import { prismaOrderStore } from "./order-store.js";
import type { ReceiptDelivery, ReceiptStore, ReceiptUnit, StoredReceipt } from "./receipt.js";

type ReceiptDatabase = Pick<
  PrismaClient,
  "deliveryRecord" | "receipt" | "order" | "outlet" | "tripStop" | "deferral"
>;

export function prismaReceiptStore(prisma: PrismaClient): ReceiptStore {
  return {
    transaction(work) {
      return prisma.$transaction((transaction) => work(receiptUnit(transaction)));
    },
  };
}

function receiptUnit(prisma: ReceiptDatabase): ReceiptUnit {
  return {
    orders: prismaOrderStore(prisma),
    async findDelivery(id) {
      const delivery = await prisma.deliveryRecord.findUnique({
        where: { id },
        include: {
          receipt: { select: { id: true } },
          tripStop: { include: { order: { include: { outlet: true } } } },
        },
      });
      if (delivery === null) {
        return null;
      }
      return {
        id: delivery.id,
        orderId: delivery.tripStop.orderId,
        orderStatus: delivery.tripStop.order.status,
        outletId: delivery.tripStop.order.outletId,
        orderUnits: delivery.tripStop.order.orderUnits,
        orderWeightKg: delivery.tripStop.order.orderWeightKg.toString(),
        orderVolumeM3: delivery.tripStop.order.orderVolumeM3.toString(),
        tempRequirement: delivery.tripStop.order.tempRequirement,
        brand: delivery.tripStop.order.outlet.brand,
        district: delivery.tripStop.order.outlet.district,
        depot: delivery.tripStop.order.outlet.depot,
        outcome: delivery.outcome,
        hasReceipt: delivery.receipt !== null,
      } satisfies ReceiptDelivery;
    },
    async create(input) {
      try {
        const receipt = await prisma.receipt.create({
          data: {
            id: randomUUID(),
            deliveryRecordId: input.deliveryRecordId,
            storeManagerUserId: input.storeManagerUserId,
            confirmedAt: input.confirmedAt,
            result: input.result,
            issueDetails: input.issueDetails,
          },
        });
        return toStored(receipt);
      } catch (error) {
        if (isUniqueConflict(error)) {
          return "conflict";
        }
        throw error;
      }
    },
  };
}

function toStored(receipt: {
  id: string;
  deliveryRecordId: string;
  storeManagerUserId: string;
  confirmedAt: Date;
  result: string;
  issueDetails: string | null;
}): StoredReceipt {
  return {
    id: receipt.id,
    deliveryRecordId: receipt.deliveryRecordId,
    storeManagerUserId: receipt.storeManagerUserId,
    confirmedAt: receipt.confirmedAt,
    result: receipt.result,
    issueDetails: receipt.issueDetails,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
