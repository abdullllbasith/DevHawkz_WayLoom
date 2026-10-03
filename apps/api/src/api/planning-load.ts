import type { PrismaClient } from "../generated/prisma/client.js";
import { buildPlanningInput, type PlanningContextLoadResult, type PlanningMasterSnapshot } from "../domain/planning-context.js";
import type { StoredOrder } from "../domain/order.js";

export async function loadPlanningRunContext(
  prisma: PrismaClient,
  operationalDate: string,
): Promise<PlanningContextLoadResult> {
  const calendarRow = await prisma.calendarSource.findUnique({
    where: { date: utcDate(operationalDate) },
  });
  if (calendarRow === null) {
    return { ok: false, code: "planning_input_unavailable" };
  }
  const orders = await prisma.order.findMany({
    where: {
      orderDate: utcDate(operationalDate),
      status: "CONFIRMED",
      submittedAt: { not: null },
      tripStops: { none: {} },
    },
    include: { outlet: true },
    orderBy: { deliveryId: "asc" },
  });
  const vehicles = await prisma.vehicle.findMany({ orderBy: { vehicleId: "asc" } });
  if (vehicles.length === 0) {
    return { ok: false, code: "planning_input_unavailable" };
  }
  const travelRows = await prisma.districtTravelSource.findMany({ orderBy: [{ depot: "asc" }, { district: "asc" }] });
  const allowanceRows = await prisma.serviceAllowanceSource.findMany({ orderBy: [{ brand: "asc" }, { dockType: "asc" }] });
  if (travelRows.length === 0 || allowanceRows.length === 0) {
    return { ok: false, code: "planning_input_unavailable" };
  }
  const outletIds = [...new Set(orders.map((order) => order.outletId))];
  const outletRows =
    outletIds.length === 0
      ? []
      : await prisma.outlet.findMany({ where: { id: { in: outletIds } }, orderBy: { outletId: "asc" } });
  if (outletRows.length !== outletIds.length) {
    return { ok: false, code: "planning_input_unavailable" };
  }
  const tripRows = await prisma.trip.findMany({
    where: { operationalDate: utcDate(operationalDate) },
    include: { vehicle: { select: { vehicleId: true } } },
  });
  const committedTripCounts: Record<string, number> = Object.fromEntries(
    vehicles.map((vehicle) => [vehicle.vehicleId, 0]),
  );
  for (const trip of tripRows) {
    committedTripCounts[trip.vehicle.vehicleId] = (committedTripCounts[trip.vehicle.vehicleId] ?? 0) + 1;
  }
  const vehicleUuidBySourceId = new Map(vehicles.map((vehicle) => [vehicle.vehicleId, vehicle.id]));
  const master: PlanningMasterSnapshot = {
    operationalDate,
    calendar: {
      date: operationalDate,
      dow: calendarRow.dow,
      dowName: calendarRow.dowName as PlanningMasterSnapshot["calendar"]["dowName"],
      isWeekend: calendarRow.isWeekend as 0 | 1,
      isoYear: calendarRow.isoYear,
      isoWeek: calendarRow.isoWeek,
      isPayday: calendarRow.isPayday as 0 | 1,
      festival: calendarRow.festival,
      festivalRamp: calendarRow.festivalRamp,
      isHoliday: calendarRow.isHoliday as 0 | 1,
      monsoon: calendarRow.monsoon as 0 | 1,
      isOperating: calendarRow.isOperating as 0 | 1,
    },
    travel: travelRows.map((row) => ({
      depot: row.depot,
      district: row.district,
      depotToDistrictKm: row.depotToDistrictKm,
      depotToDistrictFreeflowMin: row.depotToDistrictFreeflowMin,
      interStopKm: row.interStopKm,
      interStopFreeflowMin: row.interStopFreeflowMin,
    })),
    serviceAllowances: allowanceRows.map((row) => ({
      brand: row.brand,
      dockType: row.dockType,
      serviceAllowanceMin: row.serviceAllowanceMin,
    })),
    vehicles: vehicles.map((vehicle) => ({
      id: vehicle.id,
      vehicleId: vehicle.vehicleId,
      type: vehicle.type,
      temp: vehicle.temp,
      weightCapKg: vehicle.weightCapKg.toString(),
      volumeCapM3: vehicle.volumeCapM3.toString(),
      fuelType: vehicle.fuelType,
      kmPerL: vehicle.kmPerL.toString(),
      weeklyFuelQuotaL: vehicle.weeklyFuelQuotaL.toString(),
      existingWeeklyFuelL: "0",
      depot: vehicle.depot,
    })),
    outlets: outletRows.map((outlet) => ({
      id: outlet.id,
      outletId: outlet.outletId,
      brand: outlet.brand,
      district: outlet.district,
      depot: outlet.depot,
      dockType: outlet.dockType,
      parkingConstraint: outlet.parkingConstraint,
      mallWindow: outlet.mallWindow,
      windowOpen: clock(outlet.windowOpenTime),
      windowClose: clock(outlet.windowCloseTime),
    })),
    vehicleUuidBySourceId,
  };
  const storedOrders: StoredOrder[] = orders.map((order) => ({
    id: order.id,
    deliveryId: order.deliveryId,
    orderDate: order.orderDate.toISOString().slice(0, 10),
    outletId: order.outletId,
    outletCode: order.outlet.outletId,
    brand: order.outlet.brand,
    district: order.outlet.district,
    depot: order.outlet.depot,
    createdByUserId: order.createdByUserId,
    status: "CONFIRMED",
    tempRequirement: order.tempRequirement,
    orderUnits: order.orderUnits,
    orderWeightKg: order.orderWeightKg.toString(),
    orderVolumeM3: order.orderVolumeM3.toString(),
    submittedAt: order.submittedAt,
  }));
  return buildPlanningInput(operationalDate, storedOrders, master, committedTripCounts);
}

function utcDate(value: string): Date {
  const [year, month, day] = value.split("-").map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

function clock(value: Date | null): string | null {
  if (value === null) {
    return null;
  }
  const hours = value.getUTCHours().toString().padStart(2, "0");
  const minutes = value.getUTCMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}
