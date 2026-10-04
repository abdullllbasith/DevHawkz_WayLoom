export type DashboardOrder = {
  id: string;
  orderId: string;
  outlet: string;
  brand: string;
  items: number;
  weightKg: string;
  deliveryWindow: string;
  priority: string;
  status: string;
};

export type DashboardKpi = {
  id: string;
  label: string;
  value: string;
  subtitle: string;
};

export type DashboardAlert = {
  text: string;
};

export type DashboardTrip = {
  id: string;
  vehicleId: string;
  tripNumber: number;
  status: string;
  stopCount: number;
  depot: string;
};

export type DashboardPlanningSummary = {
  vehiclesOnPlan: string;
  ordersDeferred: string;
  estimatedOnTime: string;
  fuelReduction: string;
};

export type OrderCategoryTab = "All" | "Fresh" | "Style" | "Tech" | "High Risk";

export const unsupportedCategoryTab: OrderCategoryTab = "High Risk";

type OrderRecord = {
  id?: unknown;
  deliveryId?: unknown;
  orderDate?: unknown;
  outletCode?: unknown;
  brand?: unknown;
  status?: unknown;
  orderUnits?: unknown;
  orderWeightKg?: unknown;
};

type TripRecord = {
  id?: unknown;
  vehicleId?: unknown;
  tripNumber?: unknown;
  status?: unknown;
  depot?: unknown;
  stops?: unknown;
};

type PlanningRecord = {
  operationalDate?: unknown;
  trips?: unknown;
  deferrals?: unknown;
};

export function toDashboardOrder(value: OrderRecord): DashboardOrder | null {
  if (typeof value.id !== "string" || typeof value.deliveryId !== "string") return null;
  const units = typeof value.orderUnits === "number" ? value.orderUnits : Number(value.orderUnits);
  if (!Number.isFinite(units)) return null;
  return {
    id: value.id,
    orderId: value.deliveryId,
    outlet: typeof value.outletCode === "string" ? value.outletCode : "—",
    brand: typeof value.brand === "string" ? value.brand : "—",
    items: units,
    weightKg: typeof value.orderWeightKg === "string" ? value.orderWeightKg : String(value.orderWeightKg ?? "—"),
    deliveryWindow: "—",
    priority: "—",
    status: typeof value.status === "string" ? value.status : "—",
  };
}

export function readOrders(value: unknown): { orders: DashboardOrder[]; dates: { orderDate: string }[] } {
  if (!Array.isArray(value)) return { orders: [], dates: [] };
  const orders: DashboardOrder[] = [];
  const dates: { orderDate: string }[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as OrderRecord;
    const order = toDashboardOrder(record);
    if (order === null) continue;
    orders.push(order);
    if (typeof record.orderDate === "string") dates.push({ orderDate: record.orderDate });
  }
  return { orders, dates };
}

export function readPlanning(value: unknown): { trips: DashboardTrip[]; deferralCount: number; operationalDate: string | null } {
  if (typeof value !== "object" || value === null) {
    return { trips: [], deferralCount: 0, operationalDate: null };
  }
  const record = value as PlanningRecord;
  const trips = Array.isArray(record.trips)
    ? record.trips.flatMap((trip) => {
        if (typeof trip !== "object" || trip === null) return [];
        const item = trip as TripRecord;
        if (typeof item.id !== "string" || typeof item.vehicleId !== "string") return [];
        return [
          {
            id: item.id,
            vehicleId: item.vehicleId,
            tripNumber: typeof item.tripNumber === "number" ? item.tripNumber : 0,
            status: typeof item.status === "string" ? item.status : "—",
            stopCount: Array.isArray(item.stops) ? item.stops.length : 0,
            depot: typeof item.depot === "string" ? item.depot : "—",
          },
        ];
      })
    : [];
  const deferralCount = Array.isArray(record.deferrals) ? record.deferrals.length : 0;
  const operationalDate = typeof record.operationalDate === "string" ? record.operationalDate : null;
  return { trips, deferralCount, operationalDate };
}

export function countRecords(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

export function filterOrders(
  orders: readonly DashboardOrder[],
  tab: OrderCategoryTab,
  query: string,
): DashboardOrder[] {
  if (tab === unsupportedCategoryTab) return [];
  const normalizedQuery = query.trim().toLowerCase();
  return orders.filter((order) => {
    const matchesTab = tab === "All" || order.brand.toLowerCase() === tab.toLowerCase();
    if (!matchesTab) return false;
    if (normalizedQuery === "") return true;
    return (
      order.orderId.toLowerCase().includes(normalizedQuery) ||
      order.outlet.toLowerCase().includes(normalizedQuery) ||
      order.brand.toLowerCase().includes(normalizedQuery) ||
      order.status.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function countOrdersByCategory(orders: readonly DashboardOrder[]): Record<OrderCategoryTab, number> {
  return {
    All: orders.length,
    Fresh: orders.filter((order) => order.brand.toLowerCase() === "fresh").length,
    Style: orders.filter((order) => order.brand.toLowerCase() === "style").length,
    Tech: orders.filter((order) => order.brand.toLowerCase() === "tech").length,
    "High Risk": 0,
  };
}

export function dashboardKpis(input: {
  orders: readonly DashboardOrder[];
  trips: readonly DashboardTrip[];
  deferralCount: number;
  exceptionCount: number;
}): DashboardKpi[] {
  const units = input.orders.reduce((sum, order) => sum + order.items, 0);
  const vehicles = new Set(input.trips.map((trip) => trip.vehicleId)).size;
  return [
    { id: "orders", label: "Total Orders", value: String(input.orders.length), subtitle: "From order records" },
    { id: "items", label: "Total Items", value: units.toLocaleString("en-US"), subtitle: "Sum of order units" },
    {
      id: "vehicles",
      label: "Vehicles on plan",
      value: input.trips.length === 0 ? "—" : String(vehicles),
      subtitle: "Distinct vehicles in the planning result",
    },
    { id: "target", label: "On-time Target", value: "—", subtitle: "Not provided by the planning result" },
    {
      id: "risk",
      label: "Open exceptions",
      value: String(input.exceptionCount),
      subtitle: input.deferralCount === 0 ? "No deferred orders in the planning result" : `${input.deferralCount} deferred in the planning result`,
    },
  ];
}

export function dashboardAlerts(input: { deferralCount: number; exceptionCount: number }): DashboardAlert[] {
  const alerts: DashboardAlert[] = [];
  if (input.deferralCount > 0) {
    alerts.push({ text: `${input.deferralCount} deferred ${input.deferralCount === 1 ? "order" : "orders"} in the planning result` });
  }
  if (input.exceptionCount > 0) {
    alerts.push({ text: `${input.exceptionCount} open ${input.exceptionCount === 1 ? "exception" : "exceptions"}` });
  }
  if (alerts.length === 0) alerts.push({ text: "No deferred orders or open exceptions" });
  return alerts;
}

export function planningSummary(input: { trips: readonly DashboardTrip[]; deferralCount: number }): DashboardPlanningSummary {
  const vehicles = new Set(input.trips.map((trip) => trip.vehicleId)).size;
  return {
    vehiclesOnPlan: input.trips.length === 0 ? "—" : String(vehicles),
    ordersDeferred: String(input.deferralCount),
    estimatedOnTime: "—",
    fuelReduction: "—",
  };
}
