export type DriverLinkPhase = "online" | "offline" | "syncing";

export function driverLinkPhase(input: {
  browserOnline: boolean;
  serverReachable: boolean;
  syncInFlight: boolean;
}): DriverLinkPhase {
  if (!input.browserOnline) return "offline";
  if (input.syncInFlight) return "syncing";
  if (!input.serverReachable) return "offline";
  return "online";
}
