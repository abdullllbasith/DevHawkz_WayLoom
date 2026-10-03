/**
 * Fail-closed checks for a version 1 planning input.
 * This does not allocate, calculate fuel, or write operational records.
 */
import { parsePlanningInput, type PlanningInput } from "./contract.js";

export const validationCategories = [
  "missing_required_field",
  "invalid_field_value",
  "invalid_reference",
  "duplicate_identity",
  "cross_record_inconsistency",
  "unsupported_value",
  "missing_required_dataset",
  "malformed_optional_dataset",
] as const;

export type ValidationCategory = (typeof validationCategories)[number];

export type PlanningValidationFailure = {
  category: ValidationCategory;
  path: string;
};

export type PlanningValidationResult =
  | { ok: true; input: PlanningInput }
  | { ok: false; failures: PlanningValidationFailure[] };

const requiredSections = ["contractVersion", "operationalDate", "cutoff", "orders", "outlets", "vehicles", "calendar", "travel", "serviceAllowances"] as const;

const secretKeys = new Set([
  "password",
  "passwordhash",
  "session",
  "sessionid",
  "cookie",
  "csrf",
  "csrftoken",
  "authorization",
  "token",
  "secret",
]);

const optionalDatasetKeys = new Set(["traffic", "trafficspeed", "roadconditions", "road_conditions", "speed_index"]);

export function validatePlanningInput(value: unknown): PlanningValidationResult {
  const structural = structuralFailure(value);
  if (structural !== null) return { ok: false, failures: [structural] };
  const parsed = parsePlanningInput(value);
  if (!parsed.ok) return { ok: false, failures: [{ category: "invalid_field_value", path: "input" }] };
  const failures = semanticFailures(parsed.value);
  if (failures.length > 0) return { ok: false, failures };
  return { ok: true, input: parsed.value };
}

function structuralFailure(value: unknown): PlanningValidationFailure | null {
  if (containsSecret(value)) return { category: "unsupported_value", path: "input" };
  if (!isRecord(value)) return { category: "invalid_field_value", path: "input" };
  for (const key of Object.keys(value)) {
    if (optionalDatasetKeys.has(key.toLowerCase())) return { category: "malformed_optional_dataset", path: key };
  }
  if (!Object.prototype.hasOwnProperty.call(value, "contractVersion")) return { category: "missing_required_field", path: "contractVersion" };
  if (value.contractVersion !== "1") return { category: "unsupported_value", path: "contractVersion" };
  for (const key of requiredSections) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return { category: "missing_required_field", path: key };
  }
  return null;
}

function semanticFailures(input: PlanningInput): PlanningValidationFailure[] {
  const failures: PlanningValidationFailure[] = [];
  duplicate(failures, input.orders.map((item) => item.id), (id) => `orders/${id}`);
  duplicate(failures, input.orders.map((item) => item.deliveryId), (id) => `orders/delivery/${id}`);
  duplicate(failures, input.outlets.map((item) => item.id), (id) => `outlets/${id}`);
  duplicate(failures, input.outlets.map((item) => item.outletId), (id) => `outlets/code/${id}`);
  duplicate(failures, input.vehicles.map((item) => item.id), (id) => `vehicles/${id}`);
  duplicate(failures, input.vehicles.map((item) => item.vehicleId), (id) => `vehicles/code/${id}`);
  duplicate(failures, input.travel.map((item) => `${item.depot}/${item.district}`), (id) => `travel/${id}`);
  duplicate(failures, input.serviceAllowances.map((item) => `${item.brand}/${item.dockType}`), (id) => `serviceAllowances/${id}`);

  const outlets = new Map(input.outlets.map((item) => [item.id, item]));
  const travel = new Set(input.travel.map((item) => `${item.depot}\u0000${item.district}`));
  const allowances = new Set(input.serviceAllowances.map((item) => `${item.brand}\u0000${item.dockType}`));
  for (const order of input.orders) {
    const outlet = outlets.get(order.outletId);
    if (outlet === undefined) {
      failures.push({ category: "invalid_reference", path: `orders/${order.deliveryId}/outletId` });
      continue;
    }
    if (order.brand !== outlet.brand) failures.push({ category: "cross_record_inconsistency", path: `orders/${order.deliveryId}/brand` });
    if (order.district !== outlet.district) failures.push({ category: "cross_record_inconsistency", path: `orders/${order.deliveryId}/district` });
    if (order.depot !== outlet.depot) failures.push({ category: "cross_record_inconsistency", path: `orders/${order.deliveryId}/depot` });
    if (!travel.has(`${outlet.depot}\u0000${outlet.district}`)) {
      failures.push({ category: "missing_required_dataset", path: `travel/${outlet.depot}/${outlet.district}` });
    }
    if (!allowances.has(`${outlet.brand}\u0000${outlet.dockType}`)) {
      failures.push({ category: "missing_required_dataset", path: `serviceAllowances/${outlet.brand}/${outlet.dockType}` });
    }
  }
  return sortFailures(failures);
}

function duplicate(failures: PlanningValidationFailure[], values: readonly string[], path: (value: string) => string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) failures.push({ category: "duplicate_identity", path: path(value) });
    seen.add(value);
  }
}

function sortFailures(failures: readonly PlanningValidationFailure[]): PlanningValidationFailure[] {
  return [...failures].sort((left, right) => left.path.localeCompare(right.path) || left.category.localeCompare(right.category));
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (!isRecord(value)) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret(value[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
