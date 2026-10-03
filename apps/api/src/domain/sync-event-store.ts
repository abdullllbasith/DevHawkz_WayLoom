import type { PrismaClient } from "../generated/prisma/client.js";
import { deliveryStoreBound } from "./delivery-store.js";
import { domainTransactionOptions } from "./domain-transaction.js";
import type { SyncEventTypeName } from "./sync-event.js";
import type { StoredSyncEvent, SyncBatchStore, SyncBatchUnit } from "./sync-batch.js";

type SyncClient = Pick<
  PrismaClient,
  "syncEvent" | "tripStop" | "deliveryRecord" | "proofOfDelivery" | "order" | "outlet" | "deferral"
>;

type SyncRow = {
  clientEventId: string;
  eventType: "DELIVERY_OUTCOME" | "PROOF_OF_DELIVERY";
  targetId: string;
  clientCreatedAt: Date;
  receivedAt: Date;
  errorCode: string | null;
  errorMessage: string | null;
  lastAttemptAt: Date | null;
  attemptCount: number | null;
};

export function prismaSyncBatchStore(prisma: PrismaClient): SyncBatchStore {
  return {
    findByClientEventId(clientEventId) {
      return readEvent(prisma, clientEventId);
    },
    transaction(work) {
      return prisma.$transaction(async (transaction) => work(batchUnit(transaction)), domainTransactionOptions);
    },
  };
}

function batchUnit(prisma: SyncClient): SyncBatchUnit {
  return {
    deliveries: deliveryStoreBound(prisma),
    findByClientEventId(clientEventId) {
      return readEvent(prisma, clientEventId);
    },
    async claim(event) {
      try {
        await prisma.syncEvent.create({
          data: {
            clientEventId: event.clientEventId,
            eventType: event.eventType === "delivery outcome" ? "DELIVERY_OUTCOME" : "PROOF_OF_DELIVERY",
            targetType: "TripStop",
            targetId: event.targetId,
            clientCreatedAt: event.clientCreatedAt,
            receivedAt: event.receivedAt,
            errorCode: null,
            errorMessage: null,
            lastAttemptAt: event.lastAttemptAt,
            attemptCount: event.attemptCount,
          },
        });
        return "ok";
      } catch (error) {
        if (isUniqueConflict(error)) {
          return "conflict";
        }
        throw error;
      }
    },
    async release(clientEventId) {
      await prisma.syncEvent.delete({ where: { clientEventId } });
    },
    async recordError(clientEventId, errorCode) {
      await prisma.syncEvent.update({
        where: { clientEventId },
        data: { errorCode, errorMessage: null },
      });
    },
  };
}

async function readEvent(prisma: SyncClient, clientEventId: string): Promise<StoredSyncEvent | null> {
  const row = await prisma.syncEvent.findUnique({ where: { clientEventId } });
  return row === null ? null : toStored(row);
}

function toStored(row: SyncRow): StoredSyncEvent {
  return {
    clientEventId: row.clientEventId,
    eventType: fromPrismaType(row.eventType),
    targetType: "TripStop",
    targetId: row.targetId,
    clientCreatedAt: row.clientCreatedAt,
    receivedAt: row.receivedAt,
    errorCode: row.errorCode,
    errorMessage: null,
    lastAttemptAt: row.lastAttemptAt,
    attemptCount: row.attemptCount,
  };
}

function fromPrismaType(value: SyncRow["eventType"]): SyncEventTypeName {
  return value === "DELIVERY_OUTCOME" ? "delivery outcome" : "proof of delivery";
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
