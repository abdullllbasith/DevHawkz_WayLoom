const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DriverStop = {
  id: string;
  tripId: string;
  orderId: string;
  sequence: number;
  plannedArrival: string | null;
};

export type DriverTrip = {
  id: string;
  routeId: string | null;
  operationalDate: string;
  vehicleId: string;
  depot: string;
  tripNumber: number;
  status: "PLANNED" | "CONFIRMED";
  stops: DriverStop[];
};

export function readDriverRoutes(value: unknown): DriverTrip[] | null {
  if (!Array.isArray(value)) return null;
  const trips: DriverTrip[] = [];
  for (const item of value) {
    const trip = readTrip(item);
    if (trip === null) return null;
    trips.push(trip);
  }
  return trips;
}

export function readDriverTrip(value: unknown): DriverTrip | null {
  return readTrip(value);
}

export function displayRouteIdentity(trip: DriverTrip): string {
  const routeId = trip.routeId?.trim() ?? "";
  if (routeId.length > 0 && !UUID_PATTERN.test(routeId)) return routeId;
  return `RTE-${String(trip.tripNumber).padStart(3, "0")}`;
}

function readTrip(value: unknown): DriverTrip | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.operationalDate !== "string" || typeof record.vehicleId !== "string") return null;
  if (typeof record.depot !== "string" || typeof record.tripNumber !== "number") return null;
  if (record.status !== "PLANNED" && record.status !== "CONFIRMED") return null;
  if (!Array.isArray(record.stops)) return null;
  const stops: DriverStop[] = [];
  for (const stop of record.stops) {
    const parsed = readStop(stop);
    if (parsed === null) return null;
    stops.push(parsed);
  }
  stops.sort((left, right) => left.sequence - right.sequence);
  return {
    id: record.id,
    routeId: typeof record.routeId === "string" ? record.routeId : null,
    operationalDate: record.operationalDate,
    vehicleId: record.vehicleId,
    depot: record.depot,
    tripNumber: record.tripNumber,
    status: record.status,
    stops,
  };
}

function readStop(value: unknown): DriverStop | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.tripId !== "string" || typeof record.orderId !== "string") return null;
  if (typeof record.sequence !== "number") return null;
  return {
    id: record.id,
    tripId: record.tripId,
    orderId: record.orderId,
    sequence: record.sequence,
    plannedArrival: typeof record.plannedArrival === "string" ? record.plannedArrival : null,
  };
}
