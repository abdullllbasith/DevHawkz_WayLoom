import type { PlanTrip } from "./dispatcher-planning";

export type RouteStatusTab = "All" | "Confirmed" | "Planned";

const ROUTE_COLOR_PALETTE = [
  "#2563eb", // blue
  "#059669", // emerald
  "#ea580c", // orange
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#db2777", // pink
] as const;

export function displayRouteId(trip: { routeId: string | null; tripNumber: number; vehicleId: string }): string {
  if (trip.routeId && trip.routeId.trim().length > 0) {
    return trip.routeId;
  }
  const paddedNumber = String(trip.tripNumber).padStart(3, "0");
  return `RTE-${paddedNumber}`;
}

export function routeColor(index: number): string {
  return ROUTE_COLOR_PALETTE[index % ROUTE_COLOR_PALETTE.length] ?? "#2563eb";
}

export function routesKpis(trips: readonly PlanTrip[]) {
  const confirmed = trips.filter((trip) => trip.status === "CONFIRMED").length;
  const planned = trips.filter((trip) => trip.status === "PLANNED").length;
  const subtitle =
    trips.length === 0
      ? "No routes available"
      : `${confirmed} Confirmed • ${planned} Planned`;

  return [
    {
      id: "total-routes",
      label: "Total Routes",
      value: String(trips.length),
      subtitle,
      hasChangeBadge: false,
    },
    {
      id: "total-distance",
      label: "Total Distance",
      value: "—",
      subtitle: "Distance is not in the planning result",
      hasChangeBadge: false,
    },
    {
      id: "estimated-time",
      label: "Estimated Time",
      value: "—",
      subtitle: "Duration is not in the planning result",
      hasChangeBadge: false,
    },
    {
      id: "estimated-fuel",
      label: "Estimated Fuel",
      value: "—",
      subtitle: "Fuel is not in the planning result",
      hasChangeBadge: false,
    },
    {
      id: "co2-reduction",
      label: "CO₂ Reduction",
      value: "—",
      subtitle: "CO₂ is not in the planning result",
      hasChangeBadge: false,
    },
  ];
}

export function filterRoutes(
  trips: readonly PlanTrip[],
  options: { tab: RouteStatusTab; query: string },
): PlanTrip[] {
  let list = [...trips];

  if (options.tab === "Confirmed") {
    list = list.filter((t) => t.status === "CONFIRMED");
  } else if (options.tab === "Planned") {
    list = list.filter((t) => t.status === "PLANNED");
  }

  const normalized = options.query.trim().toLowerCase();
  if (normalized === "") return list;

  return list.filter((trip) => {
    const routeId = displayRouteId(trip).toLowerCase();
    const searchable = [
      routeId,
      trip.vehicleId.toLowerCase(),
      trip.depot.toLowerCase(),
      trip.status.toLowerCase(),
      String(trip.tripNumber),
    ].join(" ");
    return searchable.includes(normalized);
  });
}

export function exportRoutesCsv(trips: readonly PlanTrip[]): string {
  const headers = ["Route ID", "Vehicle ID", "Depot", "Trip Number", "Stops Count", "Status"];
  const rows = trips.map((trip) => [
    displayRouteId(trip),
    trip.vehicleId,
    trip.depot,
    String(trip.tripNumber),
    String(trip.stops.length),
    trip.status,
  ]);

  return [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}
