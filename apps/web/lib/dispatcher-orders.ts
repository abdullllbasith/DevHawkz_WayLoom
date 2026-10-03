export type DispatcherOrder = {
  id: string;
  orderId: string;
  outlet: string;
  district: string;
  depot: string;
  brand: string;
  items: number;
  weightKg: string;
  volumeM3: string;
  temperature: string;
  status: string;
  orderDate: string;
  submittedAt: string | null;
};

export type OrderCategoryTab = "All" | "Fresh" | "Style" | "Tech" | "High Risk";

export type OrderFilters = {
  search: string;
  district: string;
  brand: string;
};

const unsupportedTabs = new Set<OrderCategoryTab>(["High Risk"]);

export function readOrderList(value: unknown): DispatcherOrder[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.deliveryId !== "string") return [];
    const units = typeof record.orderUnits === "number" ? record.orderUnits : Number(record.orderUnits);
    if (!Number.isFinite(units)) return [];
    return [
      {
        id: record.id,
        orderId: record.deliveryId,
        outlet: text(record.outletCode),
        district: text(record.district),
        depot: text(record.depot),
        brand: text(record.brand),
        items: units,
        weightKg: text(record.orderWeightKg),
        volumeM3: text(record.orderVolumeM3),
        temperature: text(record.tempRequirement),
        status: text(record.status),
        orderDate: text(record.orderDate),
        submittedAt: typeof record.submittedAt === "string" ? record.submittedAt : null,
      },
    ];
  });
}

export function filterOrdersList(orders: readonly DispatcherOrder[], filters: Partial<OrderFilters> & { tab?: OrderCategoryTab }): DispatcherOrder[] {
  if (filters.tab !== undefined && unsupportedTabs.has(filters.tab)) return [];
  const search = (filters.search ?? "").trim().toLowerCase();
  return orders.filter((order) => {
    if (filters.tab && filters.tab !== "All" && order.brand.toLowerCase() !== filters.tab.toLowerCase()) return false;
    if (filters.district && filters.district !== "All Regions" && order.district !== filters.district) return false;
    if (filters.brand && filters.brand !== "All Categories" && order.brand !== filters.brand) return false;
    if (search === "") return true;
    return [order.orderId, order.outlet, order.district, order.brand, order.status, order.depot]
      .join(" ")
      .toLowerCase()
      .includes(search);
  });
}

export function countOrdersTabs(orders: readonly DispatcherOrder[]): Record<OrderCategoryTab, number> {
  return {
    All: orders.length,
    Fresh: orders.filter((order) => order.brand.toLowerCase() === "fresh").length,
    Style: orders.filter((order) => order.brand.toLowerCase() === "style").length,
    Tech: orders.filter((order) => order.brand.toLowerCase() === "tech").length,
    "High Risk": 0,
  };
}

export function orderKpis(orders: readonly DispatcherOrder[]) {
  const chilled = orders.filter((order) => order.temperature === "chilled").length;
  const deferred = orders.filter((order) => order.status === "DEFERRED").length;
  return [
    { id: "total", label: "Total Orders", value: String(orders.length), subtitle: "From order records" },
    { id: "fresh", label: "Fresh Orders", value: String(countOrdersTabs(orders).Fresh), subtitle: "Brand Fresh" },
    { id: "standard", label: "Standard Orders", value: "—", subtitle: "Order type is not provided" },
    { id: "tech", label: "Tech Orders", value: String(countOrdersTabs(orders).Tech), subtitle: "Brand Tech" },
    { id: "high-risk", label: "High-Risk Orders", value: "—", subtitle: deferred === 0 ? `${chilled} chilled` : `${deferred} deferred` },
  ];
}

export function brandBreakdown(orders: readonly DispatcherOrder[]) {
  const counts = new Map<string, number>();
  for (const order of orders) {
    const name = order.brand === "—" ? "Unspecified" : order.brand;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const total = orders.length;
  return [...counts.entries()].map(([name, count]) => ({
    name,
    count,
    percentage: total === 0 ? 0 : Math.round((count / total) * 100),
  }));
}

export function recentOrders(orders: readonly DispatcherOrder[]): DispatcherOrder[] {
  return [...orders]
    .sort((left, right) => (right.submittedAt ?? "").localeCompare(left.submittedAt ?? ""))
    .slice(0, 5);
}

export function exportOrdersCsv(orders: readonly DispatcherOrder[]): string {
  const header = "Order ID,Outlet,District,Depot,Brand,Units,Weight(kg),Temperature,Status,Order Date";
  const rows = orders.map((order) =>
    [order.orderId, order.outlet, order.district, order.depot, order.brand, order.items, order.weightKg, order.temperature, order.status, order.orderDate]
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(","),
  );
  return [header, ...rows].join("\n");
}

export function latestOrderDate(orders: readonly DispatcherOrder[]): string | null {
  const dates = orders.map((order) => order.orderDate).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  return [...dates].sort().at(-1) ?? null;
}

export type ConfirmOrderApiResult =
  | { ok: true; order: DispatcherOrder }
  | { ok: false; code: string; message: string };

export async function confirmOrderOnServer(input: {
  orderId: string;
  csrfToken?: string;
  fetchFn?: typeof fetch;
}): Promise<ConfirmOrderApiResult> {
  const clientFetch = input.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!clientFetch) {
    return { ok: false, code: "environment_error", message: "Client fetch is unavailable." };
  }
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.csrfToken) headers["x-wayloom-csrf"] = input.csrfToken;
  try {
    const response = await clientFetch(`/api/orders/${encodeURIComponent(input.orderId)}/confirm`, {
      method: "POST",
      headers,
      body: JSON.stringify({}),
    });
    const data = (await response.json().catch(() => ({}))) as {
      id?: string;
      deliveryId?: string;
      error?: { code?: string; message?: string };
    };
    if (response.ok && typeof data.id === "string") {
      const parsed = readOrderList([data])[0];
      if (parsed) {
        return { ok: true, order: parsed };
      }
      return { ok: false, code: "parse_error", message: "Order response format invalid." };
    }
    const code = data.error?.code ?? "confirmation_failed";
    if (code === "CSRF_INVALID" || code === "csrf_invalid") {
      return {
        ok: false,
        code: "csrf_invalid",
        message: "Security validation failed. Please refresh and try again.",
      };
    }
    if (code === "INVALID_STATE_TRANSITION" || code === "lifecycle_conflict" || response.status === 409) {
      return {
        ok: false,
        code: "lifecycle_conflict",
        message: "Order cannot be closed because it is no longer in SUBMITTED state.",
      };
    }
    if (code === "FORBIDDEN" || code === "authorization_failure" || response.status === 403 || response.status === 401) {
      return {
        ok: false,
        code: "authorization_failure",
        message: "Dispatcher authorization required to close orders.",
      };
    }
    return {
      ok: false,
      code,
      message: data.error?.message ?? "Unable to close order on the server.",
    };
  } catch {
    return {
      ok: false,
      code: "connection_error",
      message: "Network error: unable to contact the order confirmation service.",
    };
  }
}

function text(value: unknown): string {
  return typeof value === "string" && value.length > 0 ? value : "—";
}
