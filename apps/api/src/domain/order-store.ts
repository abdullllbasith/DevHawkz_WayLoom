import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { OrderStatusName, OrderStore, OrderTemperature, StoredOrder } from "./order.js";

export function prismaOrderStore(prisma: PrismaClient): OrderStore {
  return {
    async findOutletById(id) {
      const outlet = await prisma.outlet.findUnique({ where: { id } });
      if (outlet === null) {
        return null;
      }
      return {
        id: outlet.id,
        outletCode: outlet.outletId,
        brand: outlet.brand,
        district: outlet.district,
        depot: outlet.depot,
      };
    },
    async findByDeliveryId(deliveryId) {
      const order = await prisma.order.findUnique({
        where: { deliveryId },
        include: { outlet: true },
      });
      return order === null ? null : toStoredOrder(order);
    },
    async findById(id) {
      const order = await prisma.order.findUnique({
        where: { id },
        include: { outlet: true },
      });
      return order === null ? null : toStoredOrder(order);
    },
    async create(input) {
      const order = await prisma.order.create({
        data: {
          id: randomUUID(),
          deliveryId: input.deliveryId,
          orderDate: new Date(`${input.orderDate}T00:00:00.000Z`),
          outletId: input.outletId,
          createdByUserId: input.createdByUserId,
          status: "DRAFT",
          tempRequirement: input.tempRequirement,
          orderUnits: input.orderUnits,
          orderWeightKg: input.orderWeightKg,
          orderVolumeM3: input.orderVolumeM3,
          submittedAt: null,
        },
        include: { outlet: true },
      });
      return toStoredOrder(order);
    },
    async markSubmitted(id, submittedAt) {
      const order = await prisma.order.update({
        where: { id },
        data: {
          status: "SUBMITTED",
          submittedAt,
        },
        include: { outlet: true },
      });
      return toStoredOrder(order);
    },
  };
}

function toStoredOrder(order: {
  id: string;
  deliveryId: string;
  orderDate: Date;
  outletId: string;
  createdByUserId: string;
  status: OrderStatusName;
  tempRequirement: OrderTemperature;
  orderUnits: number;
  orderWeightKg: { toString(): string };
  orderVolumeM3: { toString(): string };
  submittedAt: Date | null;
  outlet: { outletId: string; brand: string; district: string; depot: string };
}): StoredOrder {
  return {
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
  };
}
