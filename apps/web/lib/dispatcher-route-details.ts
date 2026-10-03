import type { DispatcherOrder } from "./dispatcher-orders";

export type TripStop = {
  id: string;
  tripId: string;
  orderId: string;
  sequence: number;
  plannedArrival: string | null;
};

export type TripDetail = {
  id: string;
  routeId: string | null;
  operationalDate: string;
  vehicleId: string;
  depot: string;
  tripNumber: number;
  status: string;
  stops: TripStop[];
};

export function readTripDetail(value: unknown): TripDetail | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || typeof record.vehicleId !== "string") return null;

  const stops: TripStop[] = Array.isArray(record.stops)
    ? record.stops.flatMap((s): TripStop[] => {
        if (typeof s !== "object" || s === null) return [];
        const sr = s as Record<string, unknown>;
        if (typeof sr.id !== "string" || typeof sr.orderId !== "string") return [];
        return [
          {
            id: sr.id,
            tripId: typeof sr.tripId === "string" ? sr.tripId : "",
            orderId: sr.orderId,
            sequence: typeof sr.sequence === "number" ? sr.sequence : 0,
            plannedArrival: typeof sr.plannedArrival === "string" ? sr.plannedArrival : null,
          },
        ];
      })
    : [];

  stops.sort((a, b) => a.sequence - b.sequence);

  return {
    id: record.id,
    routeId: typeof record.routeId === "string" ? record.routeId : null,
    operationalDate: typeof record.operationalDate === "string" ? record.operationalDate : "—",
    vehicleId: record.vehicleId,
    depot: typeof record.depot === "string" ? record.depot : "—",
    tripNumber: typeof record.tripNumber === "number" ? record.tripNumber : 0,
    status: typeof record.status === "string" ? record.status : "PLANNED",
    stops,
  };
}

export function computeTripOrderTotals(stops: readonly TripStop[], orderById: Map<string, DispatcherOrder>) {
  let totalUnits = 0;
  let totalWeightKg = 0;
  let totalVolumeM3 = 0;
  let hasChilled = false;
  let matchedOrders = 0;

  for (const stop of stops) {
    const order = orderById.get(stop.orderId);
    if (order) {
      matchedOrders++;
      totalUnits += order.items;
      const w = parseFloat(order.weightKg);
      if (!isNaN(w)) totalWeightKg += w;
      const v = parseFloat(order.volumeM3);
      if (!isNaN(v)) totalVolumeM3 += v;
      if (order.temperature.toLowerCase() === "chilled") {
        hasChilled = true;
      }
    }
  }

  return {
    matchedOrders,
    totalUnits,
    totalWeightKg: Math.round(totalWeightKg * 10) / 10,
    totalVolumeM3: Math.round(totalVolumeM3 * 100) / 100,
    hasChilled,
  };
}

export function tripDetailKpis(trip: TripDetail, totals: ReturnType<typeof computeTripOrderTotals>) {
  return [
    {
      id: "status",
      label: "Route Status",
      value: trip.status,
      subtitle: `Trip #${trip.tripNumber} • ${trip.depot}`,
    },
    {
      id: "stops",
      label: "Total Stops",
      value: String(trip.stops.length),
      subtitle: `${totals.matchedOrders} orders assigned`,
    },
    {
      id: "weight",
      label: "Assigned Weight",
      value: totals.totalWeightKg > 0 ? `${totals.totalWeightKg} kg` : "—",
      subtitle: totals.hasChilled ? "Includes chilled orders" : "Ambient orders",
    },
    {
      id: "distance",
      label: "Total Distance",
      value: "—",
      subtitle: "Distance is not in the planning result",
    },
    {
      id: "est-time",
      label: "Estimated Duration",
      value: "—",
      subtitle: "Duration is not in the planning result",
    },
  ];
}
