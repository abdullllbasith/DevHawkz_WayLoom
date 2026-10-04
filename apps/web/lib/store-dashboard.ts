export type StoreOrder = {
  id: string;
  deliveryId: string;
  orderDate: string;
  outletId: string;
  outletCode: string;
  brand: string;
  district: string;
  depot: string;
  status: string;
  orderUnits: number;
  tempRequirement: string;
};

export function readStoreOrders(value: unknown): StoreOrder[] | null {
  if (!Array.isArray(value)) return null;
  const orders: StoreOrder[] = [];
  for (const item of value) {
    const order = readStoreOrder(item);
    if (order === null) return null;
    orders.push(order);
  }
  return orders;
}

export function pendingOrders(orders: readonly StoreOrder[]): StoreOrder[] {
  return orders.filter((order) => order.status !== "RECEIPT_CONFIRMED");
}

export function receivedOrders(orders: readonly StoreOrder[]): StoreOrder[] {
  return orders.filter((order) => order.status === "RECEIPT_CONFIRMED");
}

export function awaitingReceiptOrders(orders: readonly StoreOrder[]): StoreOrder[] {
  return orders.filter((order) => order.status === "DELIVERED");
}

export function storeStatusCounts(orders: readonly StoreOrder[]): { status: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const order of orders) {
    counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
  }
  return [...counts.entries()].map(([status, count]) => ({ status, count }));
}

export function readStoreOrder(value: unknown): StoreOrder | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.deliveryId !== "string" || typeof record.status !== "string") return null;
  if (typeof record.orderDate !== "string" || typeof record.outletId !== "string" || typeof record.outletCode !== "string") return null;
  if (typeof record.orderUnits !== "number") return null;
  return {
    id: record.id,
    deliveryId: record.deliveryId,
    orderDate: record.orderDate,
    outletId: record.outletId,
    outletCode: record.outletCode,
    brand: typeof record.brand === "string" ? record.brand : "—",
    district: typeof record.district === "string" ? record.district : "—",
    depot: typeof record.depot === "string" ? record.depot : "—",
    status: record.status,
    orderUnits: record.orderUnits,
    tempRequirement: typeof record.tempRequirement === "string" ? record.tempRequirement : "—",
  };
}
