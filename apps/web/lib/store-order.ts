export type StoreOrderDraft = {
  deliveryId: string;
  orderDate: string;
  outletId: string;
  tempRequirement: "chilled" | "ambient";
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
};

export function storeOrderBody(input: {
  deliveryId: string;
  orderDate: string;
  outletId: string;
  tempRequirement: string;
  orderUnits: string;
  orderWeightKg: string;
  orderVolumeM3: string;
}): StoreOrderDraft | null {
  const deliveryId = input.deliveryId.trim();
  const orderDate = input.orderDate.trim();
  const outletId = input.outletId.trim();
  const units = Number(input.orderUnits);
  const weight = input.orderWeightKg.trim();
  const volume = input.orderVolumeM3.trim();
  if (deliveryId.length === 0 || !/^\d{4}-\d{2}-\d{2}$/.test(orderDate) || outletId.length === 0) return null;
  if (input.tempRequirement !== "chilled" && input.tempRequirement !== "ambient") return null;
  if (!Number.isInteger(units) || units <= 0) return null;
  if (!/^\d+(\.\d+)?$/.test(weight) || Number(weight) <= 0) return null;
  if (!/^\d+(\.\d+)?$/.test(volume) || Number(volume) <= 0) return null;
  return {
    deliveryId,
    orderDate,
    outletId,
    tempRequirement: input.tempRequirement,
    orderUnits: units,
    orderWeightKg: weight,
    orderVolumeM3: volume,
  };
}

export function assignedOutlets(orders: readonly { outletId: string; outletCode: string }[]): { outletId: string; outletCode: string }[] {
  const seen = new Set<string>();
  const outlets: { outletId: string; outletCode: string }[] = [];
  for (const order of orders) {
    if (seen.has(order.outletId)) continue;
    seen.add(order.outletId);
    outlets.push({ outletId: order.outletId, outletCode: order.outletCode });
  }
  return outlets;
}
