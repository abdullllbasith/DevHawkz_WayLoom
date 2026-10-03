export type DashboardOrder = {
  id: string;
  orderId: string;
  outlet: string;
  category: "Tech" | "Style" | "Fresh" | "General";
  items: number;
  weightKg: number;
  deliveryWindow: string;
  priority: "High" | "Medium" | "Low";
  status: "Pending" | "Allocated" | "Confirmed" | "Deferred";
  selected?: boolean;
};

export type DashboardKpi = {
  id: string;
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative";
  subtitle: string;
};

export type DashboardVehicleStatus = {
  vehicleId: string;
  type: "Reefer" | "Van";
  status: "Available" | "On Route" | "Maintenance";
  utilizationPercent: number;
};

export type DashboardAlert = {
  text: string;
};

export const defaultKpis: readonly DashboardKpi[] = [
  { id: "orders", label: "Total Orders", value: "105", change: "+12%", changeType: "positive", subtitle: "vs. yesterday" },
  { id: "items", label: "Total Items", value: "1,342", change: "+8%", changeType: "positive", subtitle: "vs. yesterday" },
  { id: "vehicles", label: "Available Vehicles", value: "18/20", change: "-5%", changeType: "negative", subtitle: "2 in maintenance" },
  { id: "target", label: "On-time Target", value: "95%", change: "+15%", changeType: "positive", subtitle: "Target" },
  { id: "risk", label: "High-Risk Orders", value: "7", subtitle: "Need attention" },
];

export const defaultAlerts: readonly DashboardAlert[] = [
  { text: "3 vehicles under maintenance" },
  { text: "7 orders at high risk of delay" },
  { text: "Reefer capacity is 80% utilized" },
];

export const defaultOrders: readonly DashboardOrder[] = [
  { id: "1", orderId: "ORD521", outlet: "NailArtistry - Kandy", category: "Tech", items: 20, weightKg: 155, deliveryWindow: "8:00 - 10:00 AM", priority: "High", status: "Pending", selected: false },
  { id: "2", orderId: "ORD632", outlet: "Elektronus - Jaffna", category: "Tech", items: 31, weightKg: 123, deliveryWindow: "8:00 - 10:00 AM", priority: "Medium", status: "Pending", selected: true },
  { id: "3", orderId: "ORD893", outlet: "StyleHub - Trinco", category: "Style", items: 22, weightKg: 220, deliveryWindow: "9:00 - 12:00 PM", priority: "High", status: "Pending", selected: false },
  { id: "4", orderId: "ORD404", outlet: "FreshMart - Galle", category: "Fresh", items: 12, weightKg: 45, deliveryWindow: "9:00 - 12:00 PM", priority: "Low", status: "Pending", selected: false },
  { id: "5", orderId: "ORD305", outlet: "HomeZ - Negombo", category: "General", items: 25, weightKg: 450, deliveryWindow: "10:00 - 2:00 PM", priority: "Medium", status: "Pending", selected: true },
  { id: "6", orderId: "ORD306", outlet: "CityCare Colombo 03", category: "Fresh", items: 10, weightKg: 85, deliveryWindow: "10:00 - 2:00 PM", priority: "Medium", status: "Pending", selected: false },
  { id: "7", orderId: "ORD307", outlet: "BuildMart - Rajagiriya", category: "General", items: 15, weightKg: 240, deliveryWindow: "12:00 - 4:00 PM", priority: "High", status: "Pending", selected: false },
];

export const defaultVehicles: readonly DashboardVehicleStatus[] = [
  { vehicleId: "VEH001", type: "Reefer", status: "Available", utilizationPercent: 80 },
  { vehicleId: "VEH002", type: "Reefer", status: "On Route", utilizationPercent: 60 },
  { vehicleId: "VEH003", type: "Van", status: "Available", utilizationPercent: 100 },
  { vehicleId: "VEH004", type: "Van", status: "Maintenance", utilizationPercent: 0 },
];

export const defaultAiSummary = {
  vehiclesRequired: 18,
  ordersToDefer: 3,
  estimatedOnTime: "96%",
  fuelReduction: "11%",
};

export type OrderCategoryTab = "All" | "Fresh" | "Style" | "Tech" | "High Risk";

export function filterOrders(
  orders: readonly DashboardOrder[],
  tab: OrderCategoryTab,
  query: string,
): DashboardOrder[] {
  const normalizedQuery = query.trim().toLowerCase();
  return orders.filter((order) => {
    const matchesTab =
      tab === "All" ||
      (tab === "High Risk" ? order.priority === "High" : order.category === tab);
    if (!matchesTab) return false;
    if (normalizedQuery === "") return true;
    return (
      order.orderId.toLowerCase().includes(normalizedQuery) ||
      order.outlet.toLowerCase().includes(normalizedQuery) ||
      order.category.toLowerCase().includes(normalizedQuery)
    );
  });
}

export function countOrdersByCategory(orders: readonly DashboardOrder[]): Record<OrderCategoryTab, number> {
  return {
    All: orders.length,
    Fresh: orders.filter((o) => o.category === "Fresh").length,
    Style: orders.filter((o) => o.category === "Style").length,
    Tech: orders.filter((o) => o.category === "Tech").length,
    "High Risk": orders.filter((o) => o.priority === "High").length,
  };
}
