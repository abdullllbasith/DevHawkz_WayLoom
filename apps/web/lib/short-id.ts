const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/** Visible label for a stored identifier. Short codes stay intact. UUIDs keep the first 8 characters. Longer business ids keep the trailing 12. */
export function shortId(value: string): string {
  const text = value.trim();
  if (text.length === 0 || text === "—") return text;
  if (isUuid(text)) return text.slice(0, 8);
  if (text.length <= 14) return text;
  return text.slice(-12);
}

export function displayRouteLabel(trip: { routeId: string | null; tripNumber: number }): string {
  const routeId = trip.routeId?.trim() ?? "";
  if (routeId.length > 0 && !isUuid(routeId)) return shortId(routeId);
  return `RTE-${String(trip.tripNumber).padStart(3, "0")}`;
}
