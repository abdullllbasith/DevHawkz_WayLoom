export type InboxNotice = {
  id: string;
  title: string;
  detail: string;
  href: string;
};

const storeUpdateStatuses = new Set([
  "CONFIRMED",
  "PLANNED_ALLOCATED",
  "DEFERRED",
  "LOADING",
  "EXCEPTION_REPORTED",
  "LOADED",
  "DISPATCHED",
  "DELIVERED",
  "RECEIPT_CONFIRMED",
]);

const statusLabels: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  CONFIRMED: "Confirmed",
  PLANNED_ALLOCATED: "Allocated",
  DEFERRED: "Deferred",
  LOADING: "Loading",
  EXCEPTION_REPORTED: "Exception reported",
  LOADED: "Loaded",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  RECEIPT_CONFIRMED: "Receipt confirmed",
};

export function dispatcherNotices(orders: unknown, exceptions: unknown): InboxNotice[] {
  const orderNotices = readOrders(orders)
    .filter((order) => order.status === "SUBMITTED" || order.status === "DRAFT")
    .sort((left, right) => (right.submittedAt ?? "").localeCompare(left.submittedAt ?? ""))
    .map((order) => ({
      id: `order:${order.id}`,
      title: `New order ${noticeLabel(order.deliveryId)}`,
      detail: `${order.outletCode} · ${statusLabels[order.status] ?? order.status}`,
      href: "/dispatcher/orders",
    }));
  const exceptionNotices = readExceptions(exceptions).map((item) => ({
    id: `exception:${item.id}`,
    title: `Exception ${noticeLabel(item.id)}`,
    detail: item.category,
    href: "/dispatcher/exceptions",
  }));
  return [...orderNotices, ...exceptionNotices].slice(0, 12);
}

export function storeNotices(orders: unknown): InboxNotice[] {
  return readOrders(orders)
    .filter((order) => storeUpdateStatuses.has(order.status))
    .sort((left, right) => (right.submittedAt ?? "").localeCompare(left.submittedAt ?? ""))
    .slice(0, 12)
    .map((order) => ({
      id: `order:${order.id}:${order.status}`,
      title: `Order ${noticeLabel(order.deliveryId)}`,
      detail: `${order.outletCode} · ${statusLabels[order.status] ?? order.status}`,
      href: `/store/orders/${encodeURIComponent(order.id)}`,
    }));
}

export function loaderNotices(stops: unknown): InboxNotice[] {
  if (!Array.isArray(stops)) return [];
  const notices: InboxNotice[] = [];
  for (const item of stops) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.tripStopId !== "string") continue;
    const deliveryId = typeof record.deliveryId === "string" ? record.deliveryId : "Stop";
    const outlet = typeof record.outletCode === "string" ? record.outletCode : "—";
    const vehicle = typeof record.vehicleId === "string" ? record.vehicleId : "—";
    notices.push({
      id: `stop:${record.tripStopId}`,
      title: `Stop ready to load`,
      detail: `${noticeLabel(deliveryId)} · ${outlet} · ${noticeLabel(vehicle)}`,
      href: "/loader",
    });
  }
  return notices.slice(0, 12);
}

export function driverNotices(trips: unknown): InboxNotice[] {
  if (!Array.isArray(trips)) return [];
  const notices: InboxNotice[] = [];
  for (const item of trips) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.tripNumber !== "number") continue;
    if (record.status !== "PLANNED" && record.status !== "CONFIRMED") continue;
    const routeId = typeof record.routeId === "string" ? record.routeId : null;
    const vehicleId = typeof record.vehicleId === "string" ? record.vehicleId : "—";
    notices.push({
      id: `trip:${record.id}:${record.status}`,
      title: `Route ${routeLabel(routeId, record.tripNumber)}`,
      detail: `Vehicle ${noticeLabel(vehicleId)} · ${record.status === "CONFIRMED" ? "Confirmed" : "Planned"}`,
      href: "/driver",
    });
  }
  return notices.slice(0, 12);
}

export function unreadNotices(items: readonly InboxNotice[], seen: ReadonlySet<string>): InboxNotice[] {
  return items.filter((item) => !seen.has(item.id));
}

function readOrders(value: unknown): { id: string; deliveryId: string; outletCode: string; status: string; submittedAt: string | null }[] {
  if (!Array.isArray(value)) return [];
  const orders = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.deliveryId !== "string" || typeof record.status !== "string") continue;
    orders.push({
      id: record.id,
      deliveryId: record.deliveryId,
      outletCode: typeof record.outletCode === "string" ? record.outletCode : "—",
      status: record.status,
      submittedAt: typeof record.submittedAt === "string" ? record.submittedAt : null,
    });
  }
  return orders;
}

function readExceptions(value: unknown): { id: string; category: string }[] {
  if (!Array.isArray(value)) return [];
  const items = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.category !== "string") continue;
    items.push({ id: record.id, category: record.category });
  }
  return items;
}

function noticeLabel(value: string): string {
  const text = value.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return text.slice(0, 8);
  if (text.length <= 14) return text;
  return text.slice(-12);
}

function routeLabel(routeId: string | null, tripNumber: number): string {
  const text = routeId?.trim() ?? "";
  if (text.length > 0 && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return noticeLabel(text);
  return `RTE-${String(tripNumber).padStart(3, "0")}`;
}
