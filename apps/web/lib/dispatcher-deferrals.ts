import type { DispatcherOrder } from "./dispatcher-orders";

export const APPROVED_DEFERRAL_REASONS = [
  "NO_CAPACITY",
  "NO_REEFER",
  "VAN_ACCESS",
  "WINDOW_CONFLICT",
  "DEPOT_MISMATCH",
  "TIME_BUDGET",
  "FUEL_QUOTA",
] as const;

export type DeferralReasonCode = (typeof APPROVED_DEFERRAL_REASONS)[number];

export type StoredDeferral = {
  id: string;
  orderId: string;
  reason: DeferralReasonCode;
  reportedAt: string;
};

export type DeferralReasonInfo = {
  code: DeferralReasonCode;
  label: string;
  constraint: string;
  description: string;
  badgeClass: string;
};

export const DEFERRAL_REASON_INFO: Record<DeferralReasonCode, DeferralReasonInfo> = {
  NO_CAPACITY: {
    code: "NO_CAPACITY",
    label: "No Vehicle Capacity",
    constraint: "Weight & Volume Capacity",
    description: "No available vehicle had sufficient remaining cargo weight or volume capacity on feasible routes.",
    badgeClass: "badge-reason-capacity",
  },
  NO_REEFER: {
    code: "NO_REEFER",
    label: "No Reefer Available",
    constraint: "Temperature Control",
    description: "Order requires chilled transport, but no refrigerated vehicle (Reefer) with available capacity was reachable.",
    badgeClass: "badge-reason-reefer",
  },
  VAN_ACCESS: {
    code: "VAN_ACCESS",
    label: "Van Access Required",
    constraint: "Access Restriction",
    description: "Store requires van delivery access due to physical constraints, but available capacity was in larger non-van vehicles.",
    badgeClass: "badge-reason-van",
  },
  WINDOW_CONFLICT: {
    code: "WINDOW_CONFLICT",
    label: "Delivery Window Conflict",
    constraint: "Operating Time Window",
    description: "Order could not be scheduled within the destination outlet's operational delivery window.",
    badgeClass: "badge-reason-window",
  },
  DEPOT_MISMATCH: {
    code: "DEPOT_MISMATCH",
    label: "Depot Mismatch",
    constraint: "Depot Compatibility",
    description: "Order is assigned to a depot incompatible with available vehicle routes for this operational date.",
    badgeClass: "badge-reason-depot",
  },
  TIME_BUDGET: {
    code: "TIME_BUDGET",
    label: "Driver Time Budget",
    constraint: "Duty Hours & Driving Time",
    description: "Adding this stop would cause the vehicle route duration to exceed the maximum driver shift or time budget.",
    badgeClass: "badge-reason-time",
  },
  FUEL_QUOTA: {
    code: "FUEL_QUOTA",
    label: "Weekly Fuel Quota",
    constraint: "Vehicle Fuel Allocation",
    description: "Vehicle weekly fuel quota is exhausted or would be exceeded by adding route mileage for this delivery.",
    badgeClass: "badge-reason-fuel",
  },
};

export type EnrichedDeferral = {
  id: string;
  orderId: string;
  deliveryId: string;
  outlet: string;
  district: string;
  depot: string;
  brand: string;
  items: number;
  weightKg: string;
  volumeM3: string;
  temperature: string;
  reason: DeferralReasonCode;
  reasonInfo: DeferralReasonInfo;
  reportedAt: string;
  status: string;
  orderDate: string;
  submittedAt: string | null;
  isCutoffIneligible?: boolean;
};

export type DeferralsKpiSummary = {
  totalDeferred: number;
  totalUnits: number;
  totalWeightKg: number;
  capacityCount: number;
  reeferCount: number;
  fuelQuotaCount: number;
  otherCount: number;
};

export type DeferralFilters = {
  search: string;
  reason: string;
  depot: string;
  brand: string;
};

export function isDeferralReasonCode(value: unknown): value is DeferralReasonCode {
  return typeof value === "string" && APPROVED_DEFERRAL_REASONS.includes(value as DeferralReasonCode);
}

export function readDeferralList(value: unknown): StoredDeferral[] {
  if (!Array.isArray(value)) return [];
  const deferrals: StoredDeferral[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.orderId !== "string") continue;
    if (!isDeferralReasonCode(record.reason)) continue;
    const reportedAt = typeof record.reportedAt === "string" ? record.reportedAt : "—";
    deferrals.push({
      id: record.id,
      orderId: record.orderId,
      reason: record.reason,
      reportedAt,
    });
  }
  return deferrals;
}

export function mergeOrderDeferrals(
  deferrals: readonly StoredDeferral[],
  orders: readonly DispatcherOrder[],
): EnrichedDeferral[] {
  const orderById = new Map<string, DispatcherOrder>();
  for (const o of orders) {
    orderById.set(o.id, o);
    orderById.set(o.orderId, o);
  }

  return deferrals.map((deferral) => {
    const order = orderById.get(deferral.orderId);
    const reasonInfo = DEFERRAL_REASON_INFO[deferral.reason] ?? {
      code: deferral.reason,
      label: deferral.reason,
      constraint: "Unclassified Constraint",
      description: "Planning constraint was not met.",
      badgeClass: "badge-reason-capacity",
    };

    return {
      id: deferral.id,
      orderId: deferral.orderId,
      deliveryId: order?.orderId ?? deferral.orderId,
      outlet: order?.outlet ?? "—",
      district: order?.district ?? "—",
      depot: order?.depot ?? "—",
      brand: order?.brand ?? "—",
      items: order?.items ?? 0,
      weightKg: order?.weightKg ?? "—",
      volumeM3: order?.volumeM3 ?? "—",
      temperature: order?.temperature ?? "—",
      reason: deferral.reason,
      reasonInfo,
      reportedAt: deferral.reportedAt,
      status: order?.status ?? "DEFERRED",
      orderDate: order?.orderDate ?? "—",
      submittedAt: order?.submittedAt ?? null,
    };
  });
}

/**
 * Checks if an order was submitted past the 16:00:00 Asia/Colombo cutoff on the day before the operational date.
 * Cutoff in Asia/Colombo is UTC+05:30.
 * 16:00:00 Colombo time = 10:30:00 UTC.
 */
export function isPostCutoffOrder(submittedAt: string | null, operationalDate: string): boolean {
  if (!submittedAt || !/^\d{4}-\d{2}-\d{2}$/.test(operationalDate)) return false;
  const submittedMs = Date.parse(submittedAt);
  if (Number.isNaN(submittedMs)) return false;

  const [year, month, day] = operationalDate.split("-").map(Number);
  const cutoffUtcMs = Date.UTC(year, month - 1, day - 1, 10, 30, 0, 0);

  return submittedMs >= cutoffUtcMs;
}

export function computeDeferralsKpis(deferrals: readonly EnrichedDeferral[]): DeferralsKpiSummary {
  let totalUnits = 0;
  let totalWeightKg = 0;
  let capacityCount = 0;
  let reeferCount = 0;
  let fuelQuotaCount = 0;
  let otherCount = 0;

  for (const d of deferrals) {
    totalUnits += d.items;
    const w = parseFloat(d.weightKg);
    if (!Number.isNaN(w)) {
      totalWeightKg += w;
    }

    if (d.reason === "NO_CAPACITY") {
      capacityCount++;
    } else if (d.reason === "NO_REEFER") {
      reeferCount++;
    } else if (d.reason === "FUEL_QUOTA") {
      fuelQuotaCount++;
    } else {
      otherCount++;
    }
  }

  return {
    totalDeferred: deferrals.length,
    totalUnits,
    totalWeightKg: Math.round(totalWeightKg * 10) / 10,
    capacityCount,
    reeferCount,
    fuelQuotaCount,
    otherCount,
  };
}

export function filterDeferralsList(
  deferrals: readonly EnrichedDeferral[],
  filters: DeferralFilters,
): EnrichedDeferral[] {
  const search = filters.search.trim().toLowerCase();

  return deferrals.filter((d) => {
    if (filters.reason && filters.reason !== "ALL" && d.reason !== filters.reason) {
      return false;
    }
    if (filters.depot && filters.depot !== "ALL" && d.depot.toLowerCase() !== filters.depot.toLowerCase()) {
      return false;
    }
    if (filters.brand && filters.brand !== "ALL" && d.brand.toLowerCase() !== filters.brand.toLowerCase()) {
      return false;
    }
    if (search === "") return true;

    return (
      d.deliveryId.toLowerCase().includes(search) ||
      d.orderId.toLowerCase().includes(search) ||
      d.outlet.toLowerCase().includes(search) ||
      d.district.toLowerCase().includes(search) ||
      d.brand.toLowerCase().includes(search) ||
      d.reason.toLowerCase().includes(search) ||
      d.reasonInfo.label.toLowerCase().includes(search)
    );
  });
}

export function exportDeferralsCsv(deferrals: readonly EnrichedDeferral[]): string {
  const header = [
    "Order ID",
    "Outlet",
    "District",
    "Depot",
    "Brand",
    "Items",
    "Weight (kg)",
    "Volume (m3)",
    "Temperature",
    "Reason Code",
    "Reason Label",
    "Constraint",
    "Status",
    "Reported At",
  ].join(",");

  const rows = deferrals.map((d) =>
    [
      csvEscape(d.deliveryId),
      csvEscape(d.outlet),
      csvEscape(d.district),
      csvEscape(d.depot),
      csvEscape(d.brand),
      d.items,
      csvEscape(d.weightKg),
      csvEscape(d.volumeM3),
      csvEscape(d.temperature),
      csvEscape(d.reason),
      csvEscape(d.reasonInfo.label),
      csvEscape(d.reasonInfo.constraint),
      csvEscape(d.status),
      csvEscape(d.reportedAt),
    ].join(","),
  );

  return [header, ...rows].join("\r\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
