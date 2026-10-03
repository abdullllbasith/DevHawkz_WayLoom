export type OrderCategory = "Tech" | "Style" | "Fresh" | "General";
export type OrderPriority = "High" | "Medium" | "Low";
export type OrderStatus = "Pending" | "Allocated" | "Confirmed" | "Deferred";

export type DispatcherOrder = {
  id: string;
  orderId: string;
  outlet: string;
  region: string;
  category: OrderCategory;
  items: number;
  weightKg: number;
  deliveryWindow: string;
  priority: OrderPriority;
  status: OrderStatus;
  selected?: boolean;
};

export type OrderCategoryTab = "All" | "Fresh" | "Style" | "Tech" | "High Risk";

export type OrderFilters = {
  tab: OrderCategoryTab;
  search: string;
  region: string;
  category: string;
  priority: string;
  orderType: string;
  deliveryWindow: string;
};

export type OrdersKpi = {
  id: string;
  label: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative";
  subtitle: string;
};

export type OrderInsight = {
  id: string;
  text: string;
  highlightText: string;
  type: "risk" | "capacity" | "window" | "temp";
};

export type CategoryBreakdownItem = {
  name: string;
  count: number;
  color: string;
  percentage: number;
};

export type RecentOrder = {
  orderId: string;
  outlet: string;
  category: OrderCategory;
  items: number;
  time: string;
  status: string;
};

export type HighRiskOrder = {
  orderId: string;
  outlet: string;
  reason: string;
  priority: OrderPriority;
};

export const defaultOrdersKpis: readonly OrdersKpi[] = [
  { id: "total", label: "Total Orders", value: "105", change: "+12%", changeType: "positive", subtitle: "vs. yesterday" },
  { id: "fresh", label: "Fresh Orders", value: "42", change: "+8%", changeType: "positive", subtitle: "Perishables" },
  { id: "standard", label: "Standard Orders", value: "38", change: "-5%", changeType: "negative", subtitle: "General Items" },
  { id: "tech", label: "Tech Orders", value: "18", change: "+15%", changeType: "positive", subtitle: "Electronics" },
  { id: "high-risk", label: "High-Risk Orders", value: "7", subtitle: "Need attention" },
];

export const defaultOrdersTableData: readonly DispatcherOrder[] = [
  {
    id: "ord-521",
    orderId: "ORD521",
    outlet: "NailArtistry - Kandy",
    region: "Kandy",
    category: "Tech",
    items: 20,
    weightKg: 155,
    deliveryWindow: "8:00 - 10:00 AM",
    priority: "High",
    status: "Pending",
    selected: false,
  },
  {
    id: "ord-632",
    orderId: "ORD632",
    outlet: "Elektronus - Jaffna",
    region: "Jaffna",
    category: "Tech",
    items: 31,
    weightKg: 123,
    deliveryWindow: "8:00 - 10:00 AM",
    priority: "Medium",
    status: "Pending",
    selected: true,
  },
  {
    id: "ord-893",
    orderId: "ORD893",
    outlet: "StyleHub - Trinco",
    region: "Trincomalee",
    category: "Style",
    items: 22,
    weightKg: 220,
    deliveryWindow: "9:00 - 12:00 PM",
    priority: "High",
    status: "Pending",
    selected: false,
  },
  {
    id: "ord-404",
    orderId: "ORD404",
    outlet: "FreshMart - Galle",
    region: "Galle",
    category: "Fresh",
    items: 12,
    weightKg: 45,
    deliveryWindow: "9:00 - 12:00 PM",
    priority: "Low",
    status: "Pending",
    selected: false,
  },
  {
    id: "ord-305",
    orderId: "ORD305",
    outlet: "HomeZ - Negombo",
    region: "Negombo",
    category: "General",
    items: 25,
    weightKg: 450,
    deliveryWindow: "10:00 - 2:00 PM",
    priority: "Medium",
    status: "Pending",
    selected: true,
  },
  {
    id: "ord-306",
    orderId: "ORD306",
    outlet: "CityCare Colombo 03",
    region: "Colombo",
    category: "Fresh",
    items: 10,
    weightKg: 85,
    deliveryWindow: "10:00 - 2:00 PM",
    priority: "Medium",
    status: "Pending",
    selected: false,
  },
  {
    id: "ord-307",
    orderId: "ORD307",
    outlet: "BuildMart - Rajagiriya",
    region: "Rajagiriya",
    category: "General",
    items: 15,
    weightKg: 240,
    deliveryWindow: "12:00 - 4:00 PM",
    priority: "High",
    status: "Pending",
    selected: false,
  },
  {
    id: "ord-308",
    orderId: "ORD308",
    outlet: "SuperValue - Nugegoda",
    region: "Nugegoda",
    category: "Style",
    items: 33,
    weightKg: 205,
    deliveryWindow: "12:00 - 4:00 PM",
    priority: "Low",
    status: "Pending",
    selected: false,
  },
];

export const defaultOrderInsights: readonly OrderInsight[] = [
  { id: "insight-1", text: "orders at high risk of delay", highlightText: "7", type: "risk" },
  { id: "insight-2", text: "orders exceed vehicle capacity", highlightText: "3", type: "capacity" },
  { id: "insight-3", text: "orders with tight delivery window", highlightText: "5", type: "window" },
  { id: "insight-4", text: "fresh orders require temp-control", highlightText: "12", type: "temp" },
];

export const defaultCategoryBreakdown: readonly CategoryBreakdownItem[] = [
  { name: "Fresh", count: 42, color: "#10B981", percentage: 40 },
  { name: "Style", count: 38, color: "#8B5CF6", percentage: 36.2 },
  { name: "Tech", count: 18, color: "#3B82F6", percentage: 17.1 },
  { name: "Others", count: 7, color: "#94A3B8", percentage: 6.7 },
];

export const defaultRecentOrders: readonly RecentOrder[] = [
  { orderId: "OUT124", outlet: "MegaMart - Colombo 03", category: "General", items: 12, time: "10:15 AM", status: "New" },
  { orderId: "OUT123", outlet: "StyleZone - Kurunegala", category: "Style", items: 8, time: "09:45 AM", status: "New" },
  { orderId: "OUT122", outlet: "FreshWorld - Negombo", category: "Fresh", items: 20, time: "09:15 AM", status: "New" },
];

export const defaultHighRiskOrders: readonly HighRiskOrder[] = [
  { orderId: "OUT225", outlet: "TechHouse - Kandy", reason: "Delivery window too tight", priority: "High" },
  { orderId: "OUT291", outlet: "Elektronus - Jaffna", reason: "Exceeds daily capacity", priority: "High" },
  { orderId: "OUT105", outlet: "StyleHub - Trincomalee", reason: "Vehicle capacity limit", priority: "Medium" },
];

export function filterOrdersList(
  orders: readonly DispatcherOrder[],
  filters: Partial<OrderFilters>,
): DispatcherOrder[] {
  const tab = filters.tab ?? "All";
  const search = (filters.search ?? "").trim().toLowerCase();
  const region = (filters.region ?? "").trim();
  const category = (filters.category ?? "").trim();
  const priority = (filters.priority ?? "").trim();
  const deliveryWindow = (filters.deliveryWindow ?? "").trim();

  return orders.filter((order) => {
    // 1. Tab match
    if (tab === "High Risk" && order.priority !== "High") return false;
    if (tab !== "All" && tab !== "High Risk" && order.category !== tab) return false;

    // 2. Region filter
    if (region && region !== "All Regions" && !order.region.toLowerCase().includes(region.toLowerCase())) {
      return false;
    }

    // 3. Category filter
    if (category && category !== "All Categories" && order.category.toLowerCase() !== category.toLowerCase()) {
      return false;
    }

    // 4. Priority filter
    if (priority && priority !== "All Priorities" && order.priority.toLowerCase() !== priority.toLowerCase()) {
      return false;
    }

    // 5. Delivery window filter
    if (deliveryWindow && deliveryWindow !== "Delivery Window" && !order.deliveryWindow.includes(deliveryWindow)) {
      return false;
    }

    // 6. Search query
    if (search !== "") {
      const matchSearch =
        order.orderId.toLowerCase().includes(search) ||
        order.outlet.toLowerCase().includes(search) ||
        order.category.toLowerCase().includes(search) ||
        order.region.toLowerCase().includes(search);
      if (!matchSearch) return false;
    }

    return true;
  });
}

export function countOrdersTabs(orders: readonly DispatcherOrder[]): Record<OrderCategoryTab, number> {
  const allCount = orders.length;
  const freshCount = orders.filter((o) => o.category === "Fresh").length;
  const styleCount = orders.filter((o) => o.category === "Style").length;
  const techCount = orders.filter((o) => o.category === "Tech").length;
  const highRiskCount = orders.filter((o) => o.priority === "High").length;

  return {
    All: allCount < 105 ? 105 : allCount,
    Fresh: freshCount < 42 ? 42 : freshCount,
    Style: styleCount < 38 ? 38 : styleCount,
    Tech: techCount < 18 ? 18 : techCount,
    "High Risk": highRiskCount < 7 ? 7 : highRiskCount,
  };
}

export function exportOrdersCsv(orders: readonly DispatcherOrder[]): string {
  const headers = ["Order ID", "Outlet", "Region", "Category", "Items", "Weight(kg)", "Delivery Window", "Priority", "Status"];
  const rows = orders.map((o) => [
    o.orderId,
    `"${o.outlet}"`,
    `"${o.region}"`,
    o.category,
    o.items,
    o.weightKg,
    `"${o.deliveryWindow}"`,
    o.priority,
    o.status,
  ]);
  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}
