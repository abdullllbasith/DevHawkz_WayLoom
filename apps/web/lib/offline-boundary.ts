/** Approved local cache for the Driver delivery workflow. Loader and Dispatcher data are excluded. */

export const offlineLocalStates = ["Saved Locally", "Pending Sync", "Syncing", "Synced", "Failed / Needs Attention"] as const;

export type OfflineLocalState = (typeof offlineLocalStates)[number];

export const driverCacheFields = [
  "id",
  "routeId",
  "operationalDate",
  "vehicleId",
  "depot",
  "tripNumber",
  "status",
  "stops",
  "sequence",
  "orderId",
  "plannedArrival",
] as const;

export const offlineEventTypes = ["delivery outcome", "proof of delivery"] as const;

export type OfflineEventType = (typeof offlineEventTypes)[number];

const forbiddenLocalKeys = ["password", "passwordHash", "sessionToken", "csrfToken", "cookie", "DATABASE_URL"];

export function isDriverCacheField(field: string): boolean {
  return driverCacheFields.some((item) => item === field);
}

export function localRecordIsServerConfirmed(state: OfflineLocalState): boolean {
  return state === "Synced";
}

export function canRemoveLocalRecord(input: { state: OfflineLocalState; reason: "route-complete" | "logout" }): boolean {
  if (input.state === "Pending Sync" || input.state === "Syncing" || input.state === "Failed / Needs Attention" || input.state === "Saved Locally") {
    return false;
  }
  return input.reason === "route-complete" || input.reason === "logout";
}

export function localPayloadIsAllowed(value: Record<string, unknown>): boolean {
  return Object.keys(value).every((key) => !forbiddenLocalKeys.includes(key));
}
