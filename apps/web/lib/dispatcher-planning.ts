export type PlanStop = {
  id: string;
  orderId: string;
  sequence: number;
  plannedArrival: string | null;
};

export type PlanTrip = {
  id: string;
  vehicleId: string;
  depot: string;
  tripNumber: number;
  status: string;
  routeId: string | null;
  stops: PlanStop[];
};

export type PlanDeferral = {
  id: string;
  orderId: string;
  reason: string;
  reportedAt: string;
};

export type PlanningView = {
  operationalDate: string | null;
  trips: PlanTrip[];
  deferrals: PlanDeferral[];
};

const allowedReasons = ["NO_CAPACITY", "NO_REEFER", "VAN_ACCESS", "WINDOW_CONFLICT", "DEPOT_MISMATCH", "TIME_BUDGET", "FUEL_QUOTA"] as const;

export function readPlanningResult(value: unknown): PlanningView {
  if (typeof value !== "object" || value === null) return { operationalDate: null, trips: [], deferrals: [] };
  const record = value as Record<string, unknown>;
  return {
    operationalDate: typeof record.operationalDate === "string" ? record.operationalDate : null,
    trips: Array.isArray(record.trips) ? record.trips.flatMap(readTrip) : [],
    deferrals: Array.isArray(record.deferrals) ? record.deferrals.flatMap(readDeferral) : [],
  };
}

export function filterTrips(trips: readonly PlanTrip[], query: string): PlanTrip[] {
  const normalized = query.trim().toLowerCase();
  if (normalized === "") return [...trips];
  return trips.filter((trip) =>
    [trip.vehicleId, trip.depot, trip.status, trip.routeId ?? "", String(trip.tripNumber)].join(" ").toLowerCase().includes(normalized),
  );
}

export function planningCounts(view: PlanningView) {
  const vehicles = new Set(view.trips.map((trip) => trip.vehicleId)).size;
  const scheduled = view.trips.reduce((sum, trip) => sum + trip.stops.length, 0);
  return {
    vehicles: view.trips.length === 0 ? "—" : String(vehicles),
    scheduled: String(scheduled),
    deferred: String(view.deferrals.length),
    onTime: "—",
    fuel: "—",
    co2: "—",
    violations: "—",
  };
}

export function preserveDeferralReason(reason: string): string {
  return allowedReasons.some((code) => code === reason) ? reason : reason;
}

function readTrip(value: unknown): PlanTrip[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.vehicleId !== "string") return [];
  return [
    {
      id: record.id,
      vehicleId: record.vehicleId,
      depot: typeof record.depot === "string" ? record.depot : "—",
      tripNumber: typeof record.tripNumber === "number" ? record.tripNumber : 0,
      status: typeof record.status === "string" ? record.status : "—",
      routeId: typeof record.routeId === "string" ? record.routeId : null,
      stops: Array.isArray(record.stops) ? record.stops.flatMap(readStop) : [],
    },
  ];
}

function readStop(value: unknown): PlanStop[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.orderId !== "string") return [];
  return [
    {
      id: record.id,
      orderId: record.orderId,
      sequence: typeof record.sequence === "number" ? record.sequence : 0,
      plannedArrival: typeof record.plannedArrival === "string" ? record.plannedArrival : null,
    },
  ];
}

function readDeferral(value: unknown): PlanDeferral[] {
  if (typeof value !== "object" || value === null) return [];
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.orderId !== "string" || typeof record.reason !== "string") return [];
  return [
    {
      id: record.id,
      orderId: record.orderId,
      reason: preserveDeferralReason(record.reason),
      reportedAt: typeof record.reportedAt === "string" ? record.reportedAt : "—",
    },
  ];
}
