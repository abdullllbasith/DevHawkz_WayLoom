export const WAYLOOM_CSRF_HEADER = "x-wayloom-csrf";

export type ApprovedPlanMetadata = {
  planId: string;
  approvedBy: string;
  approvedAt: string;
};

export type ApprovedSummaryCard = {
  id: string;
  count: string;
  label: string;
  statusText?: string;
  pillText: string;
  pillVariant: "green" | "blue";
  icon: "vehicle" | "orders" | "clock" | "fuel";
};

export type ApprovedVehicleRow = {
  id: string;
  vehicleId: string;
  type: "Reefer" | "Van" | "Truck";
  driver: string;
  driverOnline: boolean;
  ordersCount: number;
  currentLoadKg: number;
  capacityKg: number;
  loadPercent: number;
  routeId: string;
  status: "Assigned";
};

export type ApprovedDeferredRow = {
  id: string;
  orderId: string;
  outlet: string;
  category: "Tech" | "Style" | "Fresh" | "General";
  reasonForDeferral: string;
  constraintCode: string;
  priority: "High" | "Medium" | "Low";
  suggestedAction: string;
};

export type NextStepTimelineItem = {
  step: number;
  title: string;
  statusBadge?: string;
  timeBadge?: string;
  subtitle?: string;
  description: string;
  isCurrent?: boolean;
};

export const defaultApprovedPlanMetadata: ApprovedPlanMetadata = {
  planId: "PLAN-2025-0913-01",
  approvedBy: "Dispatcher",
  approvedAt: "13 Sep 2025, 08:42 PM",
};

export const defaultApprovedCards: readonly ApprovedSummaryCard[] = [
  {
    id: "card-vehicles",
    count: "18 Vehicles",
    label: "Assigned",
    pillText: "✓ All assigned",
    pillVariant: "green",
    icon: "vehicle",
  },
  {
    id: "card-orders",
    count: "102 Orders",
    label: "Scheduled",
    pillText: "✓ 3 deferred",
    pillVariant: "blue",
    icon: "orders",
  },
  {
    id: "card-on-time",
    count: "96%",
    label: "Estimated on-time",
    pillText: "✓ Target: 95%",
    pillVariant: "green",
    icon: "clock",
  },
  {
    id: "card-fuel",
    count: "1,450 L",
    label: "Estimated fuel",
    pillText: "↓ 11% vs. previous plan",
    pillVariant: "green",
    icon: "fuel",
  },
];

export const defaultApprovedVehicles: readonly ApprovedVehicleRow[] = [
  {
    id: "veh-001",
    vehicleId: "VEH001",
    type: "Reefer",
    driver: "Ahmed R.",
    driverOnline: true,
    ordersCount: 8,
    currentLoadKg: 1240,
    capacityKg: 2000,
    loadPercent: 62,
    routeId: "R1",
    status: "Assigned",
  },
  {
    id: "veh-002",
    vehicleId: "VEH002",
    type: "Reefer",
    driver: "Sahan P.",
    driverOnline: false,
    ordersCount: 7,
    currentLoadKg: 1125,
    capacityKg: 1500,
    loadPercent: 75,
    routeId: "R2",
    status: "Assigned",
  },
  {
    id: "veh-003",
    vehicleId: "VEH003",
    type: "Van",
    driver: "Nuwan K.",
    driverOnline: true,
    ordersCount: 10,
    currentLoadKg: 1200,
    capacityKg: 1200,
    loadPercent: 100,
    routeId: "R3",
    status: "Assigned",
  },
  {
    id: "veh-004",
    vehicleId: "VEH004",
    type: "Van",
    driver: "Ramesh T.",
    driverOnline: false,
    ordersCount: 6,
    currentLoadKg: 600,
    capacityKg: 1000,
    loadPercent: 60,
    routeId: "R4",
    status: "Assigned",
  },
  {
    id: "veh-005",
    vehicleId: "VEH005",
    type: "Van",
    driver: "Kamal D.",
    driverOnline: true,
    ordersCount: 8,
    currentLoadKg: 2550,
    capacityKg: 3000,
    loadPercent: 85,
    routeId: "R5",
    status: "Assigned",
  },
  {
    id: "veh-006",
    vehicleId: "VEH006",
    type: "Truck",
    driver: "Dinesh M.",
    driverOnline: true,
    ordersCount: 9,
    currentLoadKg: 2100,
    capacityKg: 3500,
    loadPercent: 60,
    routeId: "R6",
    status: "Assigned",
  },
];

export const defaultApprovedDeferredOrders: readonly ApprovedDeferredRow[] = [
  {
    id: "def-1",
    orderId: "OUT078",
    outlet: "TechWave - Kandy",
    category: "Tech",
    reasonForDeferral: "Low priority, served yesterday",
    constraintCode: "TIME_BUDGET",
    priority: "Low",
    suggestedAction: "Schedule Tomorrow",
  },
  {
    id: "def-2",
    orderId: "OUT091",
    outlet: "ElectroHub - Jaffna",
    category: "Tech",
    reasonForDeferral: "Exceeds daily time budget",
    constraintCode: "TIME_BUDGET",
    priority: "Medium",
    suggestedAction: "Reassign or Tomorrow",
  },
  {
    id: "def-3",
    orderId: "OUT105",
    outlet: "StyleHub - Trincomalee",
    category: "Style",
    reasonForDeferral: "Vehicle capacity limit",
    constraintCode: "NO_CAPACITY",
    priority: "Medium",
    suggestedAction: "Assign to next available",
  },
];

export const defaultLoaderNotificationChecklist: readonly string[] = [
  "Loading manifests generated (18 vehicles)",
  "Warehouse team notified",
  "Order picking list created",
  "Vehicle loading sequence sent",
  "Estimated loading completion: 5:30 AM (14 Sep 2025)",
];

export const defaultNextStepsList: readonly NextStepTimelineItem[] = [
  {
    step: 1,
    title: "Warehouse Loading",
    statusBadge: "Now",
    subtitle: "(In Progress)",
    description: "Loaders will prepare and load vehicles as per the approved plan.",
    isCurrent: true,
  },
  {
    step: 2,
    title: "Driver Dispatch",
    timeBadge: "~ 5:30 AM",
    description: "Drivers will receive their routes after loading is complete.",
    isCurrent: false,
  },
  {
    step: 3,
    title: "Delivery in Progress",
    timeBadge: "From 6:00 AM",
    description: "Monitor live progress from the Routes module.",
    isCurrent: false,
  },
];

export type ConfirmationApiResult =
  | { ok: true; metadata: ApprovedPlanMetadata }
  | { ok: false; code: string; message: string };

/**
 * Validates and preserves deterministic deferral reasons without altering FUEL_QUOTA into NO_CAPACITY.
 */
export function preserveConstraintReason(reasonCode: string): string {
  const allowed = [
    "FUEL_QUOTA",
    "NO_CAPACITY",
    "NO_REEFER",
    "VAN_ACCESS",
    "WINDOW_CONFLICT",
    "DEPOT_MISMATCH",
    "TIME_BUDGET",
  ];
  return allowed.includes(reasonCode) ? reasonCode : "UNSPECIFIED";
}

/**
 * Confirms planned trips on the server through the authoritative trip confirmation domain contract.
 * Idempotently succeeds if trips are already confirmed (lifecycle_conflict).
 */
export async function confirmPlanOnServer(input: {
  tripIds?: readonly string[];
  csrfToken?: string;
  fetchFn?: typeof fetch;
}): Promise<ConfirmationApiResult> {
  const clientFetch = input.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!clientFetch) {
    return { ok: true, metadata: defaultApprovedPlanMetadata };
  }

  const tripIds = input.tripIds ?? [];
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (input.csrfToken) {
    headers[WAYLOOM_CSRF_HEADER] = input.csrfToken;
  }

  for (const tripId of tripIds) {
    try {
      const response = await clientFetch(`/api/trips/${encodeURIComponent(tripId)}/confirm`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error?: { code?: string; message?: string };
        };
        const code = errorData.error?.code ?? "confirmation_failed";

        // Idempotency: If already confirmed, it is valid and safe to proceed.
        if (code === "lifecycle_conflict") {
          continue;
        }

        if (code === "authorization_failure" || response.status === 401 || response.status === 403) {
          return {
            ok: false,
            code: "authorization_failure",
            message: "Dispatcher authorization required to commit plan allocation.",
          };
        }

        return {
          ok: false,
          code,
          message: errorData.error?.message ?? "Failed to commit trip allocation on server.",
        };
      }
    } catch {
      return {
        ok: false,
        code: "connection_error",
        message: "Unable to reach server to confirm allocation.",
      };
    }
  }

  return {
    ok: true,
    metadata: defaultApprovedPlanMetadata,
  };
}

/**
 * Returns the 6 approved vehicle assignments shown on the approved Designathon screen.
 */
export function getApprovedVehicleAssignments(
  allVehicles: readonly ApprovedVehicleRow[] = defaultApprovedVehicles,
): readonly ApprovedVehicleRow[] {
  return allVehicles.slice(0, 6);
}

/**
 * Returns the deferred orders list preserving deterministic constraint codes.
 */
export function getApprovedDeferredOrders(
  orders: readonly ApprovedDeferredRow[] = defaultApprovedDeferredOrders,
): readonly ApprovedDeferredRow[] {
  return orders;
}
