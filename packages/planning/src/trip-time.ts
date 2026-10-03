/**
 * Approved trip minutes for one already-defined candidate.
 * This does not compare a time budget, choose stops, or persist a trip.
 */
import { addDecimal, multiplyDecimal } from "./decimal.js";
import type { PlanningInput, PlanningOrder } from "./contract.js";

const brands = new Set(["Fresh", "Style", "Tech"]);
const dockTypes = new Set(["rear_dock", "street", "mall_bay"]);
const nonNegative = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const secretKeys = new Set(["password", "passwordhash", "session", "sessionid", "cookie", "csrf", "csrftoken", "authorization", "token", "secret"]);

export type TripTimeStopInput = {
  brand: string;
  dockType: string;
  serviceAllowanceMin: string | null;
};

export type TripTimeRequest = {
  depotToDistrictFreeflowMin: string | null;
  interStopFreeflowMin: string | null;
  orderCount: number;
  stops: TripTimeStopInput[];
};

export type TripTimeFailureCode =
  | "missing_depot_travel"
  | "missing_inter_stop_travel"
  | "missing_service_allowance"
  | "invalid_travel_time"
  | "invalid_service_allowance"
  | "invalid_order_count"
  | "unknown_brand"
  | "unknown_dock_type"
  | "invalid_value";

export type TripTimeResult =
  | {
      ok: true;
      tripMinutes: string;
      components: {
        depotToDistrictFreeflowMin: string;
        interStopFreeflowMin: string;
        orderCount: number;
        interStopMinutes: string;
        serviceAllowanceMin: string;
        stops: { brand: string; dockType: string; serviceAllowanceMin: string }[];
      };
    }
  | {
      ok: false;
      tripMinutes: null;
      code: TripTimeFailureCode;
      path: string;
    };

export function calculateTripTime(request: TripTimeRequest): TripTimeResult {
  if (containsSecret(request)) return failure("invalid_value", "secret");
  if (!Number.isInteger(request.orderCount) || request.orderCount < 1 || request.orderCount !== request.stops.length) {
    return failure("invalid_order_count", "orderCount");
  }
  const stops: { brand: string; dockType: string; serviceAllowanceMin: string }[] = [];
  for (let index = 0; index < request.stops.length; index += 1) {
    const stop = request.stops[index];
    if (stop === undefined) return failure("invalid_order_count", "orderCount");
    if (!brands.has(stop.brand)) return failure("unknown_brand", `stops/${index}/brand`);
    if (!dockTypes.has(stop.dockType)) return failure("unknown_dock_type", `stops/${index}/dockType`);
    if (stop.serviceAllowanceMin === null) return failure("missing_service_allowance", `stops/${index}/serviceAllowanceMin`);
    if (!nonNegative.test(stop.serviceAllowanceMin)) return failure("invalid_service_allowance", `stops/${index}/serviceAllowanceMin`);
    stops.push({ brand: stop.brand, dockType: stop.dockType, serviceAllowanceMin: stop.serviceAllowanceMin });
  }
  const depot = minute(request.depotToDistrictFreeflowMin, "depotToDistrictFreeflowMin", "missing_depot_travel");
  if (typeof depot !== "string") return depot;
  const between = minute(request.interStopFreeflowMin, "interStopFreeflowMin", "missing_inter_stop_travel");
  if (typeof between !== "string") return between;
  const interStopMinutes = request.orderCount === 1 ? "0" : multiplyDecimal(between, request.orderCount - 1);
  const serviceAllowanceMin = stops.reduce((total, stop) => addDecimal(total, stop.serviceAllowanceMin), "0");
  const tripMinutes = addDecimal(addDecimal(depot, interStopMinutes), serviceAllowanceMin);
  return {
    ok: true,
    tripMinutes,
    components: {
      depotToDistrictFreeflowMin: depot,
      interStopFreeflowMin: between,
      orderCount: request.orderCount,
      interStopMinutes,
      serviceAllowanceMin,
      stops,
    },
  };
}

export function tripTimeForOrders(input: PlanningInput, orders: readonly PlanningOrder[]): TripTimeResult {
  const first = orders[0];
  if (first === undefined) {
    return calculateTripTime({ depotToDistrictFreeflowMin: null, interStopFreeflowMin: null, orderCount: 0, stops: [] });
  }
  if (orders.some((order) => order.depot !== first.depot || order.district !== first.district)) {
    return { ok: false, tripMinutes: null, code: "invalid_value", path: "district" };
  }
  const travel = input.travel.find((item) => item.depot === first.depot && item.district === first.district);
  const stops = orders.map((order) => {
    const outlet = input.outlets.find((item) => item.id === order.outletId);
    const allowance = input.serviceAllowances.find((item) => item.brand === outlet?.brand && item.dockType === outlet?.dockType);
    return {
      brand: outlet?.brand ?? "",
      dockType: outlet?.dockType ?? "",
      serviceAllowanceMin: allowance?.serviceAllowanceMin ?? null,
    };
  });
  return calculateTripTime({
    depotToDistrictFreeflowMin: travel?.depotToDistrictFreeflowMin ?? null,
    interStopFreeflowMin: travel?.interStopFreeflowMin ?? null,
    orderCount: orders.length,
    stops,
  });
}

function minute(value: string | null, path: string, missing: TripTimeFailureCode): string | TripTimeResult {
  if (value === null) return failure(missing, path);
  if (!nonNegative.test(value)) return failure("invalid_travel_time", path);
  return value;
}

function failure(code: TripTimeFailureCode, path: string): TripTimeResult {
  return { ok: false, tripMinutes: null, code, path };
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret((value as Record<string, unknown>)[key]));
}
