/**
 * Approved fuel litres for supplied trip distances.
 * Division keeps six decimal places and ceilings a remainder so fuel is not understated.
 * Trip distance is not composed here, and no fuel deferral reason is assigned.
 */
import { addDecimal, compareDecimal, divideDecimalCeil } from "./decimal.js";

const nonNegative = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const secretKeys = new Set(["password", "passwordhash", "session", "sessionid", "cookie", "csrf", "csrftoken", "authorization", "token", "secret"]);

export type FuelTripInput = {
  tripDistanceKm: string | null;
};

export type FuelContext = {
  vehicleId: string;
  kmPerL: string | null;
  weeklyFuelQuotaL: string | null;
  existingWeeklyFuelL: string | null;
  trips: FuelTripInput[];
};

export type FuelFailureCode =
  | "missing_distance"
  | "invalid_distance"
  | "missing_efficiency"
  | "invalid_efficiency"
  | "missing_quota"
  | "invalid_quota"
  | "missing_existing_fuel"
  | "invalid_existing_fuel"
  | "inconsistent_vehicle"
  | "invalid_value";

export type FuelResult =
  | {
      ok: true;
      vehicleId: string;
      fuelUsedL: string;
      existingWeeklyFuelL: string;
      projectedWeeklyFuelL: string;
      weeklyFuelQuotaL: string;
      status: "feasible" | "infeasible";
      trips: { fuelUsedL: string }[];
    }
  | {
      ok: false;
      vehicleId: string;
      fuelUsedL: null;
      projectedWeeklyFuelL: null;
      status: "invalid";
      code: FuelFailureCode;
      path: string;
    };

export function validateWeeklyFuel(context: FuelContext): FuelResult {
  if (containsSecret(context)) return failure(context.vehicleId, "invalid_value", "secret");
  if (context.vehicleId.length === 0) return failure(context.vehicleId, "inconsistent_vehicle", "vehicleId");
  const efficiency = positive(context.kmPerL, "kmPerL", "missing_efficiency", "invalid_efficiency");
  if (typeof efficiency !== "string") return failure(context.vehicleId, efficiency.code, efficiency.path);
  const quota = nonNegativeDecimal(context.weeklyFuelQuotaL, "weeklyFuelQuotaL", "missing_quota", "invalid_quota");
  if (typeof quota !== "string") return failure(context.vehicleId, quota.code, quota.path);
  const existing = nonNegativeDecimal(context.existingWeeklyFuelL, "existingWeeklyFuelL", "missing_existing_fuel", "invalid_existing_fuel");
  if (typeof existing !== "string") return failure(context.vehicleId, existing.code, existing.path);
  const trips: { fuelUsedL: string }[] = [];
  for (let index = 0; index < context.trips.length; index += 1) {
    const trip = context.trips[index];
    if (trip === undefined) return failure(context.vehicleId, "invalid_distance", "trips");
    const distance = nonNegativeDecimal(trip.tripDistanceKm, `trips/${index}/tripDistanceKm`, "missing_distance", "invalid_distance");
    if (typeof distance !== "string") return failure(context.vehicleId, distance.code, distance.path);
    trips.push({ fuelUsedL: divideDecimalCeil(distance, efficiency) });
  }
  const fuelUsedL = trips.reduce((total, trip) => addDecimal(total, trip.fuelUsedL), "0");
  const projectedWeeklyFuelL = addDecimal(existing, fuelUsedL);
  return {
    ok: true,
    vehicleId: context.vehicleId,
    fuelUsedL,
    existingWeeklyFuelL: existing,
    projectedWeeklyFuelL,
    weeklyFuelQuotaL: quota,
    status: compareDecimal(projectedWeeklyFuelL, quota) <= 0 ? "feasible" : "infeasible",
    trips,
  };
}

export function validateVehicleFuel(contexts: readonly FuelContext[]): FuelResult[] {
  const counts = new Map<string, number>();
  for (const context of contexts) counts.set(context.vehicleId, (counts.get(context.vehicleId) ?? 0) + 1);
  return contexts.map((context) => {
    if ((counts.get(context.vehicleId) ?? 0) > 1) return failure(context.vehicleId, "inconsistent_vehicle", "vehicleId");
    return validateWeeklyFuel(context);
  });
}

function positive(value: string | null, path: string, missing: FuelFailureCode, invalid: FuelFailureCode): string | { code: FuelFailureCode; path: string } {
  const checked = nonNegativeDecimal(value, path, missing, invalid);
  if (typeof checked !== "string") return checked;
  if (compareDecimal(checked, "0") <= 0) return { code: invalid, path };
  return checked;
}

function nonNegativeDecimal(
  value: string | null,
  path: string,
  missing: FuelFailureCode,
  invalid: FuelFailureCode,
): string | { code: FuelFailureCode; path: string } {
  if (value === null) return { code: missing, path };
  if (!nonNegative.test(value)) return { code: invalid, path };
  return value;
}

function failure(vehicleId: string, code: FuelFailureCode, path: string): FuelResult {
  return { ok: false, vehicleId, fuelUsedL: null, projectedWeeklyFuelL: null, status: "invalid", code, path };
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret((value as Record<string, unknown>)[key]));
}
