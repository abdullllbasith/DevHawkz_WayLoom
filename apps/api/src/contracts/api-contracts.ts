import { deferralReasons, type DeferralReasonName, type StoredDeferral } from "../domain/deferral.js";
import type { StoredDelivery, StoredProof } from "../domain/delivery.js";
import type { StoredException } from "../domain/exception.js";
import type { StoredLoading } from "../domain/loading.js";
import { orderStatuses, type OrderStatusName, type StoredOrder } from "../domain/order.js";
import type { StoredReceipt } from "../domain/receipt.js";
import type { StoredStop, StoredTrip, TripStatusName } from "../domain/trip.js";
import type { PublicUser } from "../security/auth.js";

export type ContractResult<T> = { ok: true; value: T } | { ok: false; code: "invalid_input" };

export type LoginRequest = {
  loginIdentifier: string;
  password: string;
};

export type AuthenticatedUserResponse = {
  id: string;
  loginIdentifier: string;
  displayName: string;
  role: string;
};

export type LogoutResponse = {
  status: "ok";
};

export type OrderListQuery = {
  orderDate?: string;
  status?: OrderStatusName;
  outletId?: string;
};

export type CreateOrderRequest = {
  deliveryId: string;
  orderDate: string;
  outletId: string;
  tempRequirement: "chilled" | "ambient";
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
  brand?: string;
  district?: string;
  depot?: string;
};

export type OrderResponse = {
  id: string;
  deliveryId: string;
  orderDate: string;
  outletId: string;
  outletCode: string;
  brand: string;
  district: string;
  depot: string;
  status: OrderStatusName;
  tempRequirement: "chilled" | "ambient";
  orderUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
  submittedAt: string | null;
};

export type PlanningRunRequest = {
  operationalDate: string;
};

export type TripStopResponse = {
  id: string;
  tripId: string;
  orderId: string;
  sequence: number;
  plannedArrival: string | null;
};

export type TripResponse = {
  id: string;
  routeId: string | null;
  operationalDate: string;
  vehicleId: string;
  depot: string;
  tripNumber: number;
  status: TripStatusName;
  stops: TripStopResponse[];
};

export type PlanningResultResponse = {
  operationalDate: string;
  trips: TripResponse[];
  deferrals: DeferralResponse[];
};

export type DeferralListQuery = {
  orderId?: string;
  reason?: DeferralReasonName;
};

export type DeferralResponse = {
  id: string;
  orderId: string;
  reason: DeferralReasonName;
  reportedAt: string;
};

export type EligibleLoadingStopResponse = {
  tripStopId: string;
  sequence: number;
  plannedArrival: string | null;
  tripId: string;
  routeId: string | null;
  operationalDate: string;
  depot: string;
  tripNumber: number;
  vehicleId: string;
  vehicleType: string;
  vehicleTemp: string;
  weightCapKg: string;
  volumeCapM3: string;
  driverName: string | null;
  orderId: string;
  deliveryId: string;
  outletCode: string;
  district: string;
  brand: string;
  tempRequirement: "chilled" | "ambient";
  expectedUnits: number;
  orderWeightKg: string;
  orderVolumeM3: string;
};

export type LoadingTaskResponse = {
  id: string;
  tripStopId: string;
  loaderUserId: string;
  expectedUnits: number;
  loadedUnits: number;
  shortfallUnits: number | null;
  verifiedAt: string;
  shortfallReportedAt: string | null;
  details: string | null;
};

export type VerifyLoadingRequest = {
  loadedUnits: number;
};

export type ShortfallRequest = {
  shortfallUnits: number;
  details?: string;
};

export type DeliveryOutcomeRequest = {
  outcome: string;
  deliveredUnits?: number;
  notes?: string;
};

export type DeliveryResponse = {
  id: string;
  tripStopId: string;
  driverUserId: string;
  deliveredAt: string;
  outcome: string;
  deliveredUnits: number | null;
  notes: string | null;
};

export type ProofRequest = {
  evidenceReference: string;
};

export type ProofResponse = {
  id: string;
  deliveryRecordId: string;
  evidenceReference: string;
  capturedAt: string;
};

export type ReceiptRequest = {
  result: string;
  issueDetails?: string;
};

export type ReceiptResponse = {
  id: string;
  deliveryRecordId: string;
  confirmedAt: string;
  result: string;
  issueDetails: string | null;
};

export type CreateExceptionRequest = {
  category: string;
  details?: string;
};

export type ExceptionResponse = {
  id: string;
  category: string;
  details: string | null;
  occurredAt: string;
};

const createOrderFields = [
  "deliveryId",
  "orderDate",
  "outletId",
  "tempRequirement",
  "orderUnits",
  "orderWeightKg",
  "orderVolumeM3",
  "brand",
  "district",
  "depot",
] as const;

export function parseLoginRequest(value: unknown): ContractResult<LoginRequest> {
  const record = recordWithKeys(value, ["loginIdentifier", "password"]);
  if (record === null) {
    return invalid();
  }
  const loginIdentifier = requiredText(record.loginIdentifier);
  const password = typeof record.password === "string" && record.password.length > 0 ? record.password : null;
  if (loginIdentifier === null || password === null) {
    return invalid();
  }
  return { ok: true, value: { loginIdentifier, password } };
}

export function toAuthenticatedUser(user: PublicUser): AuthenticatedUserResponse {
  return {
    id: user.id,
    loginIdentifier: user.loginIdentifier,
    displayName: user.displayName,
    role: user.role,
  };
}

export function parseLogoutRequest(value: unknown): ContractResult<Record<string, never>> {
  return parseEmpty(value);
}

export function logoutResponse(): LogoutResponse {
  return { status: "ok" };
}

export function parseResourceId(value: unknown): ContractResult<string> {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return invalid();
  }
  return { ok: true, value: value.toLowerCase() };
}

export function parseOrderListQuery(value: unknown): ContractResult<OrderListQuery> {
  const record = recordWithKeys(value, ["orderDate", "status", "outletId"]);
  if (record === null) {
    return invalid();
  }
  const query: OrderListQuery = {};
  if (record.orderDate !== undefined) {
    const orderDate = requiredDate(record.orderDate);
    if (orderDate === null) {
      return invalid();
    }
    query.orderDate = orderDate;
  }
  if (record.status !== undefined) {
    if (!isOrderStatus(record.status)) {
      return invalid();
    }
    query.status = record.status;
  }
  if (record.outletId !== undefined) {
    const outletId = parseResourceId(record.outletId);
    if (!outletId.ok) {
      return invalid();
    }
    query.outletId = outletId.value;
  }
  return { ok: true, value: query };
}

export function parseCreateOrderRequest(value: unknown): ContractResult<CreateOrderRequest> {
  const record = recordWithKeys(value, createOrderFields);
  if (record === null || !createOrderFields.slice(0, 7).every((field) => record[field] !== undefined)) {
    return invalid();
  }
  const deliveryId = requiredText(record.deliveryId);
  const orderDate = requiredDate(record.orderDate);
  const outletId = parseResourceId(record.outletId);
  const tempRequirement = record.tempRequirement === "chilled" || record.tempRequirement === "ambient" ? record.tempRequirement : null;
  const orderUnits = positiveInteger(record.orderUnits);
  const orderWeightKg = positiveDecimal(record.orderWeightKg);
  const orderVolumeM3 = positiveDecimal(record.orderVolumeM3);
  const brand = optionalText(record.brand);
  const district = optionalText(record.district);
  const depot = optionalText(record.depot);
  if (
    deliveryId === null ||
    orderDate === null ||
    !outletId.ok ||
    tempRequirement === null ||
    orderUnits === null ||
    orderWeightKg === null ||
    orderVolumeM3 === null ||
    brand === null ||
    district === null ||
    depot === null
  ) {
    return invalid();
  }
  return {
    ok: true,
    value: {
      deliveryId,
      orderDate,
      outletId: outletId.value,
      tempRequirement,
      orderUnits,
      orderWeightKg,
      orderVolumeM3,
      ...(brand === undefined ? {} : { brand }),
      ...(district === undefined ? {} : { district }),
      ...(depot === undefined ? {} : { depot }),
    },
  };
}

export function toOrderResponse(order: StoredOrder): OrderResponse {
  return {
    id: order.id,
    deliveryId: order.deliveryId,
    orderDate: order.orderDate,
    outletId: order.outletId,
    outletCode: order.outletCode,
    brand: order.brand,
    district: order.district,
    depot: order.depot,
    status: order.status,
    tempRequirement: order.tempRequirement,
    orderUnits: order.orderUnits,
    orderWeightKg: order.orderWeightKg,
    orderVolumeM3: order.orderVolumeM3,
    submittedAt: order.submittedAt === null ? null : order.submittedAt.toISOString(),
  };
}

export function parseSubmitOrderRequest(value: unknown): ContractResult<Record<string, never>> {
  return parseEmpty(value);
}

export function parseConfirmOrderRequest(value: unknown): ContractResult<Record<string, never>> {
  return parseEmpty(value);
}

export function parsePlanningRunRequest(value: unknown): ContractResult<PlanningRunRequest> {
  const record = recordWithKeys(value, ["operationalDate"]);
  if (record === null) {
    return invalid();
  }
  const operationalDate = requiredDate(record.operationalDate);
  if (operationalDate === null) {
    return invalid();
  }
  return { ok: true, value: { operationalDate } };
}

export function parsePlanningDate(value: unknown): ContractResult<string> {
  const operationalDate = requiredDate(value);
  return operationalDate === null ? invalid() : { ok: true, value: operationalDate };
}

export function toTripResponse(trip: StoredTrip): TripResponse {
  return {
    id: trip.id,
    routeId: trip.routeId,
    operationalDate: trip.operationalDate,
    vehicleId: trip.vehicleId,
    depot: trip.depot,
    tripNumber: trip.tripNumber,
    status: trip.status,
    stops: trip.stops.map(toStopResponse),
  };
}

export function toTripDetailResponse(trip: StoredTrip): TripResponse {
  return toTripResponse(trip);
}

export function toPlanningResult(input: {
  operationalDate: string;
  trips: readonly StoredTrip[];
  deferrals: readonly StoredDeferral[];
}): PlanningResultResponse {
  return {
    operationalDate: input.operationalDate,
    trips: input.trips.map(toTripResponse),
    deferrals: input.deferrals.map(toDeferralResponse),
  };
}

export function parseConfirmTripRequest(value: unknown): ContractResult<Record<string, never>> {
  return parseEmpty(value);
}

export function parseDispatchTripRequest(value: unknown): ContractResult<Record<string, never>> {
  return parseEmpty(value);
}

export function parseDeferralListQuery(value: unknown): ContractResult<DeferralListQuery> {
  const record = recordWithKeys(value, ["orderId", "reason"]);
  if (record === null) {
    return invalid();
  }
  const query: DeferralListQuery = {};
  if (record.orderId !== undefined) {
    const orderId = parseResourceId(record.orderId);
    if (!orderId.ok) {
      return invalid();
    }
    query.orderId = orderId.value;
  }
  if (record.reason !== undefined) {
    if (!isDeferralReason(record.reason)) {
      return invalid();
    }
    query.reason = record.reason;
  }
  return { ok: true, value: query };
}

export function toDeferralResponse(deferral: StoredDeferral): DeferralResponse {
  return {
    id: deferral.id,
    orderId: deferral.orderId,
    reason: deferral.reason,
    reportedAt: deferral.reportedAt.toISOString(),
  };
}

export function toLoadingTaskResponse(loading: StoredLoading): LoadingTaskResponse {
  return {
    id: loading.id,
    tripStopId: loading.tripStopId,
    loaderUserId: loading.loaderUserId,
    expectedUnits: loading.expectedUnits,
    loadedUnits: loading.loadedUnits,
    shortfallUnits: loading.shortfallUnits,
    verifiedAt: loading.verifiedAt.toISOString(),
    shortfallReportedAt: loading.shortfallReportedAt === null ? null : loading.shortfallReportedAt.toISOString(),
    details: loading.details,
  };
}

export function parseVerifyLoadingRequest(value: unknown): ContractResult<VerifyLoadingRequest> {
  const record = recordWithKeys(value, ["loadedUnits"]);
  if (record === null) {
    return invalid();
  }
  const loadedUnits = nonNegativeInteger(record.loadedUnits);
  if (loadedUnits === null) {
    return invalid();
  }
  return { ok: true, value: { loadedUnits } };
}

export function parseShortfallRequest(value: unknown): ContractResult<ShortfallRequest> {
  const record = recordWithKeys(value, ["shortfallUnits", "details"]);
  if (record === null || record.shortfallUnits === undefined) {
    return invalid();
  }
  const shortfallUnits = nonNegativeInteger(record.shortfallUnits);
  const details = optionalText(record.details);
  if (shortfallUnits === null || details === null) {
    return invalid();
  }
  return { ok: true, value: { shortfallUnits, ...(details === undefined ? {} : { details }) } };
}

export function parseDeliveryOutcomeRequest(value: unknown): ContractResult<DeliveryOutcomeRequest> {
  const record = recordWithKeys(value, ["outcome", "deliveredUnits", "notes"]);
  if (record === null || record.outcome === undefined) {
    return invalid();
  }
  if (typeof record.outcome !== "string") {
    return invalid();
  }
  const deliveredUnits = record.deliveredUnits === undefined ? undefined : nonNegativeInteger(record.deliveredUnits);
  const notes = optionalText(record.notes);
  if (deliveredUnits === null || notes === null) {
    return invalid();
  }
  return {
    ok: true,
    value: {
      outcome: record.outcome,
      ...(deliveredUnits === undefined ? {} : { deliveredUnits }),
      ...(notes === undefined ? {} : { notes }),
    },
  };
}

export function toDeliveryResponse(delivery: StoredDelivery): DeliveryResponse {
  return {
    id: delivery.id,
    tripStopId: delivery.tripStopId,
    driverUserId: delivery.driverUserId,
    deliveredAt: delivery.deliveredAt.toISOString(),
    outcome: delivery.outcome,
    deliveredUnits: delivery.deliveredUnits,
    notes: delivery.notes,
  };
}

export function parseProofRequest(value: unknown): ContractResult<ProofRequest> {
  const record = recordWithKeys(value, ["evidenceReference"]);
  if (record === null || typeof record.evidenceReference !== "string" || record.evidenceReference.trim() === "") {
    return invalid();
  }
  return { ok: true, value: { evidenceReference: record.evidenceReference } };
}

export function toProofResponse(proof: StoredProof): ProofResponse {
  return {
    id: proof.id,
    deliveryRecordId: proof.deliveryRecordId,
    evidenceReference: proof.evidenceReference,
    capturedAt: proof.capturedAt.toISOString(),
  };
}

export function parseReceiptRequest(value: unknown): ContractResult<ReceiptRequest> {
  const record = recordWithKeys(value, ["result", "issueDetails"]);
  if (record === null || typeof record.result !== "string") {
    return invalid();
  }
  const issueDetails = optionalText(record.issueDetails);
  if (issueDetails === null) {
    return invalid();
  }
  return { ok: true, value: { result: record.result, ...(issueDetails === undefined ? {} : { issueDetails }) } };
}

export function toReceiptResponse(receipt: StoredReceipt): ReceiptResponse {
  return {
    id: receipt.id,
    deliveryRecordId: receipt.deliveryRecordId,
    confirmedAt: receipt.confirmedAt.toISOString(),
    result: receipt.result,
    issueDetails: receipt.issueDetails,
  };
}

export function parseExceptionListQuery(value: unknown): ContractResult<Record<string, never>> {
  return parseEmpty(value);
}

export function parseCreateExceptionRequest(value: unknown): ContractResult<CreateExceptionRequest> {
  const record = recordWithKeys(value, ["category", "details"]);
  if (record === null) {
    return invalid();
  }
  const category = requiredText(record.category);
  const details = optionalText(record.details);
  if (category === null || details === null) {
    return invalid();
  }
  return { ok: true, value: { category, ...(details === undefined ? {} : { details }) } };
}

export function toExceptionResponse(exception: StoredException): ExceptionResponse {
  return {
    id: exception.id,
    category: exception.category,
    details: exception.details,
    occurredAt: exception.occurredAt.toISOString(),
  };
}

function toStopResponse(stop: StoredStop): TripStopResponse {
  return {
    id: stop.id,
    tripId: stop.tripId,
    orderId: stop.orderId,
    sequence: stop.sequence,
    plannedArrival: stop.plannedArrival,
  };
}

function parseEmpty(value: unknown): ContractResult<Record<string, never>> {
  const record = recordWithKeys(value, []);
  return record === null ? invalid() : { ok: true, value: {} };
}

function recordWithKeys(value: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => !allowed.includes(key))) {
    return null;
  }
  return record;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  return value;
}

function requiredDate(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return null;
  }
  return value;
}

function positiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

function nonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function positiveDecimal(value: unknown): string | null {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || Number(value) <= 0) {
    return null;
  }
  return value;
}

function isOrderStatus(value: unknown): value is OrderStatusName {
  return typeof value === "string" && orderStatuses.some((status) => status === value);
}

function isDeferralReason(value: unknown): value is DeferralReasonName {
  return typeof value === "string" && deferralReasons.some((reason) => reason === value);
}

function invalid(): ContractResult<never> {
  return { ok: false, code: "invalid_input" };
}
