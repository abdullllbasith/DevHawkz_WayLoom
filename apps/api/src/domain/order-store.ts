import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import type {
  OrderStatusName,
  OrderStore,
  OrderTemperature,
  OrderTransitionFacts,
  StoredOrder,
} from "./order.js";

type OrderDatabase = Pick<PrismaClient, "outlet" | "order" | "tripStop" | "deferral">;

export function prismaOrderStore(prisma: OrderDatabase): OrderStore {
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
    async findTransitionFacts(orderId) {
      const [stops, deferralCount] = await Promise.all([
        prisma.tripStop.findMany({
          where: { orderId },
          select: {
            loadingRecords: { select: { loaderUserId: true } },
            deliveryRecords: { select: { driverUserId: true } },
          },
        }),
        prisma.deferral.count({ where: { orderId } }),
      ]);
      return transitionFacts(stops, deferralCount);
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
    async compareAndSetStatus(input) {
      const written = await prisma.order.updateMany({
        where: { id: input.id, status: input.expected },
        data:
          input.next === "SUBMITTED"
            ? { status: "SUBMITTED", submittedAt: input.submittedAt ?? undefined }
            : { status: input.next },
      });
      if (written.count !== 1) {
        return null;
      }
      const order = await prisma.order.findUnique({
        where: { id: input.id },
        include: { outlet: true },
      });
      return order === null ? null : toStoredOrder(order);
    },
  };
}

function transitionFacts(
  stops: readonly {
    loadingRecords: readonly { loaderUserId: string }[];
    deliveryRecords: readonly { driverUserId: string }[];
  }[],
  deferralCount: number,
): OrderTransitionFacts {
  return {
    tripStopCount: stops.length,
    deferralCount,
    loaderUserIds: stops.flatMap((stop) => stop.loadingRecords.map((record) => record.loaderUserId)),
    deliveryDriverUserIds: stops.flatMap((stop) =>
      stop.deliveryRecords.map((record) => record.driverUserId),
    ),
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
