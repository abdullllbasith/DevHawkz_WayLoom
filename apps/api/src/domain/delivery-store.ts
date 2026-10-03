import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import { domainTransactionOptions } from "./domain-transaction.js";
import { prismaOrderStore } from "./order-store.js";
import type { DeliveryStop, DeliveryStore, DeliveryUnit, StoredDelivery, StoredProof } from "./delivery.js";

type DeliveryDatabase = Pick<
  PrismaClient,
  "tripStop" | "deliveryRecord" | "proofOfDelivery" | "order" | "outlet" | "deferral"
>;

export function prismaDeliveryStore(prisma: PrismaClient): DeliveryStore {
  return {
    transaction(work) {
      return prisma.$transaction((transaction) => work(deliveryUnit(transaction)), domainTransactionOptions);
    },
  };
}

function deliveryUnit(prisma: DeliveryDatabase): DeliveryUnit {
  return {
    orders: prismaOrderStore(prisma),
    async findStop(id) {
      const stop = await prisma.tripStop.findUnique({
        where: { id },
        include: {
          trip: { include: { vehicle: true } },
          order: { include: { outlet: true } },
        },
      });
      if (stop === null) {
        return null;
      }
      return {
        id: stop.id,
        tripStatus: stop.trip.status,
        vehicleDriverUserId: stop.trip.vehicle.driverUserId,
        orderId: stop.orderId,
        orderStatus: stop.order.status,
        orderUnits: stop.order.orderUnits,
        orderWeightKg: stop.order.orderWeightKg.toString(),
        orderVolumeM3: stop.order.orderVolumeM3.toString(),
        tempRequirement: stop.order.tempRequirement,
        brand: stop.order.outlet.brand,
        district: stop.order.outlet.district,
        depot: stop.order.outlet.depot,
      } satisfies DeliveryStop;
    },
    async findDeliveryByStop(tripStopId) {
      const delivery = await prisma.deliveryRecord.findFirst({ where: { tripStopId } });
      return delivery === null ? null : toDelivery(delivery);
    },
    async createDelivery(input) {
      try {
        const delivery = await prisma.deliveryRecord.create({
          data: {
            id: randomUUID(),
            tripStopId: input.tripStopId,
            driverUserId: input.driverUserId,
            deliveredAt: input.deliveredAt,
            outcome: input.outcome,
            deliveredUnits: input.deliveredUnits,
            notes: input.notes,
          },
        });
        return toDelivery(delivery);
      } catch (error) {
        if (isUniqueConflict(error)) {
          return "conflict";
        }
        throw error;
      }
    },
    async createProof(input) {
      const proof = await prisma.proofOfDelivery.create({
        data: {
          id: randomUUID(),
          deliveryRecordId: input.deliveryRecordId,
          evidenceReference: input.evidenceReference,
          capturedAt: input.capturedAt,
          capturedByUserId: input.capturedByUserId,
        },
      });
      return toProof(proof);
    },
  };
}

function toDelivery(delivery: {
  id: string;
  tripStopId: string;
  driverUserId: string;
  deliveredAt: Date;
  outcome: string;
  deliveredUnits: number | null;
  notes: string | null;
}): StoredDelivery {
  return {
    id: delivery.id,
    tripStopId: delivery.tripStopId,
    driverUserId: delivery.driverUserId,
    deliveredAt: delivery.deliveredAt,
    outcome: delivery.outcome,
    deliveredUnits: delivery.deliveredUnits,
    notes: delivery.notes,
  };
}

function toProof(proof: {
  id: string;
  deliveryRecordId: string;
  evidenceReference: string;
  capturedAt: Date;
  capturedByUserId: string | null;
}): StoredProof {
  return {
    id: proof.id,
    deliveryRecordId: proof.deliveryRecordId,
    evidenceReference: proof.evidenceReference,
    capturedAt: proof.capturedAt,
    capturedByUserId: proof.capturedByUserId,
  };
}

function isUniqueConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
