import type { IncomingMessage, ServerResponse } from "node:http";
import {
  parseConfirmTripRequest,
  parseDispatchTripRequest,
  parseCreateExceptionRequest,
  parseCreateOrderRequest,
  parseDeferralListQuery,
  parseDeliveryOutcomeRequest,
  parseExceptionListQuery,
  parseOrderListQuery,
  parseConfirmOrderRequest,
  parsePlanningDate,
  parsePlanningRunRequest,
  parseProofRequest,
  parseReceiptRequest,
  parseResourceId,
  parseShortfallRequest,
  parseSubmitOrderRequest,
  parseVerifyLoadingRequest,
  toDeferralResponse,
  toDeliveryResponse,
  toExceptionResponse,
  toLoadingTaskResponse,
  toOrderResponse,
  toPlanningResult,
  toProofResponse,
  toReceiptResponse,
  toTripResponse,
} from "../contracts/api-contracts.js";
import type { DeferralReasonName, DeferralStore, StoredDeferral } from "../domain/deferral.js";
import { recordDelivery, recordProof } from "../domain/delivery.js";
import type { DeliveryStore } from "../domain/delivery.js";
import { recordException } from "../domain/exception.js";
import type { ExceptionStore, StoredException } from "../domain/exception.js";
import { reportShortfall, verifyLoading } from "../domain/loading.js";
import type { LoadingStore, StoredLoading } from "../domain/loading.js";
import { confirmOrder, createOrder, getOrder, submitOrder } from "../domain/order.js";
import type { OrderActor, OrderStatusName, OrderStore, StoredOrder } from "../domain/order.js";
import { confirmReceipt } from "../domain/receipt.js";
import type { ReceiptStore } from "../domain/receipt.js";
import type { AiAuditWriter } from "../ai/audit.js";
import { explainPlanning } from "../ai/planning-explanation.js";
import { loadAiSettings, selectAiProvider } from "../ai/provider.js";
import { planningResultFromStored } from "../ai/stored-planning.js";
import type { PlanningContextLoadResult } from "../domain/planning-context.js";
import { executePlanningRun } from "../domain/planning-run.js";
import { emitDiagnostic, planningDiagnostic, syncDiagnostic } from "../observability/diagnostics.js";
import { applySyncBatch, parseSyncBatchBody, readSyncStatus, type SyncBatchStore } from "../domain/sync-batch.js";
import { confirmTrip, dispatchTrip } from "../domain/trip.js";
import type { StoredTrip, TripStore } from "../domain/trip.js";
import { sendJson } from "../errors.js";
import type { BusinessRoute, RequestSecurityContext } from "../security/api-boundary.js";
import { readJson, sendDomainFailure } from "./http.js";

export type OrderListFilter = {
  outletIds?: readonly string[];
  outletId?: string;
  status?: OrderStatusName;
  orderDate?: string;
};

export type TripScope = StoredTrip & {
  vehicleDriverUserId: string | null;
  outletIds: readonly string[];
  loaderUserIds: string[];
};

export type DeferralListFilter = {
  orderId?: string;
  reason?: DeferralReasonName;
  orderDate?: string;
};

export type CoreDependencies = {
  now: () => Date;
  orders: OrderStore;
  trips: TripStore;
  loading: LoadingStore;
  deliveries: DeliveryStore;
  deferrals: DeferralStore;
  exceptions: ExceptionStore;
  receipts: ReceiptStore;
  sync: SyncBatchStore;
  listOrders(filter: OrderListFilter): Promise<StoredOrder[]>;
  findTripScope(id: string): Promise<TripScope | null>;
  listDriverTrips(driverUserId: string): Promise<StoredTrip[]>;
  listTripsOnDate(operationalDate: string): Promise<StoredTrip[]>;
  listDeferrals(filter: DeferralListFilter): Promise<StoredDeferral[]>;
  listLoading(loaderUserId: string): Promise<StoredLoading[]>;
  deliveryIdsForOrder(orderId: string): Promise<string[]>;
  listExceptions(): Promise<StoredException[]>;
  loadPlanningRunContext(operationalDate: string): Promise<PlanningContextLoadResult>;
  aiEnv?: Record<string, string | undefined>;
  aiAudit?: AiAuditWriter;
};

export function coreRoutes(deps: CoreDependencies): BusinessRoute[] {
  return [
    route("GET", "/api/orders", ["DISPATCHER", "STORE_MANAGER"], (context, response, request) =>
      listOrders(deps, context, response, request),
    ),
    route("POST", "/api/orders", ["STORE_MANAGER"], (context, response, request) =>
      createOrderRoute(deps, context, response, request),
    ),
    route("POST", "/api/orders/:id/submit", ["STORE_MANAGER"], (context, response, request) =>
      submitOrderRoute(deps, context, response, request), /^\/api\/orders\/[^/]+\/submit$/),
    route("POST", "/api/orders/:id/confirm", ["DISPATCHER"], (context, response, request) =>
      confirmOrderRoute(deps, context, response, request), /^\/api\/orders\/[^/]+\/confirm$/),
    route("POST", "/api/orders/:id/receipt", ["STORE_MANAGER"], (context, response, request) =>
      confirmReceiptRoute(deps, context, response, request), /^\/api\/orders\/[^/]+\/receipt$/),
    route("GET", "/api/orders/:id", ["DISPATCHER", "STORE_MANAGER"], (context, response, request) =>
      getOrderRoute(deps, context, response, request), /^\/api\/orders\/[^/]+$/),
    route("POST", "/api/planning/run", ["DISPATCHER"], (context, response, request) =>
      runPlanning(deps, context, response, request),
    ),
    route("POST", "/api/planning/:date/explanation", ["DISPATCHER"], (context, response, request) =>
      explainStoredPlanning(deps, context, response, request), /^\/api\/planning\/[^/]+\/explanation$/),
    route("GET", "/api/planning/:date", ["DISPATCHER"], (_context, response, request) =>
      readPlanning(deps, response, request), /^\/api\/planning\/[^/]+$/),
    route("POST", "/api/trips/:id/confirm", ["DISPATCHER"], (context, response, request) =>
      confirmTripRoute(deps, context, response, request), /^\/api\/trips\/[^/]+\/confirm$/),
    route("POST", "/api/trips/:id/dispatch", ["DISPATCHER"], (context, response, request) =>
      dispatchTripRoute(deps, context, response, request), /^\/api\/trips\/[^/]+\/dispatch$/),
    route("GET", "/api/trips/:id", ["DISPATCHER", "STORE_MANAGER", "LOADER", "DRIVER"], (context, response, request) =>
      getTripRoute(deps, context, response, request), /^\/api\/trips\/[^/]+$/),
    route("GET", "/api/deferrals", ["DISPATCHER"], (_context, response, request) =>
      listDeferralRoute(deps, response, request),
    ),
    route("GET", "/api/loading/tasks", ["LOADER"], (context, response) => listLoadingRoute(deps, context, response)),
    route("POST", "/api/loading/:id/verify", ["LOADER"], (context, response, request) =>
      verifyLoadingRoute(deps, context, response, request), /^\/api\/loading\/[^/]+\/verify$/),
    route("POST", "/api/loading/:id/shortfall", ["LOADER"], (context, response, request) =>
      shortfallRoute(deps, context, response, request), /^\/api\/loading\/[^/]+\/shortfall$/),
    route("GET", "/api/driver/routes", ["DRIVER"], (context, response) => driverRoutes(deps, context, response)),
    route("POST", "/api/deliveries/:id/outcome", ["DRIVER"], (context, response, request) =>
      deliveryOutcomeRoute(deps, context, response, request), /^\/api\/deliveries\/[^/]+\/outcome$/),
    route("POST", "/api/deliveries/:id/pod", ["DRIVER"], (context, response, request) =>
      deliveryProofRoute(deps, context, response, request), /^\/api\/deliveries\/[^/]+\/pod$/),
    route("POST", "/api/sync/batch", ["DRIVER"], (context, response, request) =>
      syncBatchRoute(deps, context, response, request),
    ),
    route("GET", "/api/sync/status", ["DRIVER"], (context, response, request) =>
      syncStatusRoute(deps, context, response, request),
    ),
    route("GET", "/api/exceptions", ["DISPATCHER"], (_context, response, request) =>
      listExceptionRoute(deps, response, request),
    ),
    route("POST", "/api/exceptions", ["DISPATCHER"], (context, response, request) =>
      createExceptionRoute(deps, context, response, request),
    ),
  ];
}

function route(
  method: BusinessRoute["method"],
  path: string,
  allowedRoles: BusinessRoute["allowedRoles"],
  handle: BusinessRoute["handle"],
  pathname?: RegExp,
): BusinessRoute {
  return {
    method,
    path,
    allowedRoles,
    ...(pathname === undefined ? {} : { matchPath: (value: string) => pathname.test(value) }),
    handle,
  };
}

async function listOrders(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const query = parseOrderListQuery(queryRecord(request));
  if (!query.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  if (context.role === "STORE_MANAGER") {
    if (query.value.outletId !== undefined && !context.assignedOutletIds.includes(query.value.outletId)) {
      sendJson(response, 200, []);
      return;
    }
    const orders = await deps.listOrders({ ...query.value, outletIds: context.assignedOutletIds });
    sendJson(response, 200, orders.map(toOrderResponse));
    return;
  }
  const orders = await deps.listOrders(query.value);
  sendJson(response, 200, orders.map(toOrderResponse));
}

async function createOrderRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const body = await readJson(request);
  if (body === "invalid") {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const parsed = parseCreateOrderRequest(body);
  if (!parsed.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const created = await createOrder({ actor: actor(context), command: parsed.value, store: deps.orders });
  if (!created.ok) {
    sendDomainFailure(response, created.code);
    return;
  }
  sendJson(response, 201, toOrderResponse(created.order));
}

async function getOrderRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const orderId = pathId(request, /^\/api\/orders\/([^/]+)$/);
  if (orderId === null) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const found = await getOrder({ actor: actor(context), orderId, store: deps.orders });
  if (!found.ok) {
    sendDomainFailure(response, found.code);
    return;
  }
  sendJson(response, 200, toOrderResponse(found.order));
}

async function submitOrderRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const orderId = pathId(request, /^\/api\/orders\/([^/]+)\/submit$/);
  const body = await readJson(request);
  if (orderId === null || body === "invalid" || !parseSubmitOrderRequest(body).ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const submitted = await submitOrder({ actor: actor(context), orderId, now: deps.now(), store: deps.orders });
  if (!submitted.ok) {
    sendDomainFailure(response, submitted.code);
    return;
  }
  sendJson(response, 200, toOrderResponse(submitted.order));
}

async function confirmOrderRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const orderId = pathId(request, /^\/api\/orders\/([^/]+)\/confirm$/);
  const body = await readJson(request);
  if (orderId === null || body === "invalid" || !parseConfirmOrderRequest(body).ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const confirmed = await confirmOrder({ actor: actor(context), orderId, now: deps.now(), store: deps.orders });
  if (!confirmed.ok) {
    sendDomainFailure(response, confirmed.code);
    return;
  }
  sendJson(response, 200, toOrderResponse(confirmed.order));
}

async function runPlanning(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const body = await readJson(request);
  if (body === "invalid") {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const parsed = parsePlanningRunRequest(body);
  if (!parsed.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const startedAt = new Date().toISOString();
  const planningContext = await deps.loadPlanningRunContext(parsed.value.operationalDate);
  const executed = await executePlanningRun({
    actor: actor(context),
    context: planningContext,
    now: deps.now(),
    trips: deps.trips,
    deferrals: deps.deferrals,
  });
  try {
    const trips = executed.ok ? await deps.listTripsOnDate(parsed.value.operationalDate) : [];
    const deferrals = executed.ok ? await deps.listDeferrals({ orderDate: parsed.value.operationalDate }) : [];
    emitDiagnostic(planningDiagnostic({
      operationalDate: parsed.value.operationalDate,
      startedAt,
      finishedAt: new Date().toISOString(),
      outcome: executed.ok ? "success" : planningOutcome(executed.code),
      eligible: planningContext.ok ? planningContext.input.orders.length : 0,
      allocated: trips.reduce((sum, trip) => sum + trip.stops.length, 0),
      deferred: deferrals.length,
    }));
  } catch {
    // Diagnostics must not change the planning result.
  }
  if (!executed.ok) {
    sendDomainFailure(response, executed.code);
    return;
  }
  sendJson(response, 200, await planningResult(deps, parsed.value.operationalDate));
}

function planningOutcome(code: string): "validation_failure" | "service_failure" | "rejected" {
  if (code === "planning_validation_failure") {
    return "validation_failure";
  }
  if (code === "planning_service_failure") {
    return "service_failure";
  }
  return "rejected";
}

async function readPlanning(deps: CoreDependencies, response: ServerResponse, request: IncomingMessage): Promise<void> {
  const date = pathValue(request, /^\/api\/planning\/([^/]+)$/);
  const parsed = parsePlanningDate(date === null ? undefined : decodeURIComponent(date));
  if (!parsed.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  sendJson(response, 200, await planningResult(deps, parsed.value));
}

async function explainStoredPlanning(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const date = pathValue(request, /^\/api\/planning\/([^/]+)\/explanation$/);
  const parsedDate = parsePlanningDate(date === null ? undefined : decodeURIComponent(date));
  const body = await readJson(request);
  if (!parsedDate.ok || body === "invalid" || !parseEmptyBody(body)) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const operationalDate = parsedDate.value;
  const [trips, deferrals] = await Promise.all([
    deps.listTripsOnDate(operationalDate),
    deps.listDeferrals({ orderDate: operationalDate }),
  ]);
  const deliveryIdByOrderId = new Map<string, string>();
  for (const deferral of deferrals) {
    const order = await deps.orders.findById(deferral.orderId);
    if (order !== null) {
      deliveryIdByOrderId.set(order.id, order.deliveryId);
    }
  }
  const stored = planningResultFromStored({ operationalDate, trips, deferrals, deliveryIdByOrderId });
  if (!stored.ok) {
    sendJson(response, 200, {
      ok: false,
      code: "insufficient_context",
      fallbackText: stored.summary,
      allocationChanged: false,
    });
    return;
  }
  const settings = loadAiSettings(deps.aiEnv ?? {});
  const explained = await explainPlanning({
    result: stored.result,
    capturedAt: deps.now().toISOString(),
    provider: selectAiProvider(settings),
    settings,
    actorUserId: context.userId,
    occurredAt: deps.now(),
    audit: deps.aiAudit ?? { append: () => Promise.reject(new Error("audit unavailable")) },
  });
  sendJson(response, 200, explained);
}

function parseEmptyBody(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0;
}

async function planningResult(deps: CoreDependencies, operationalDate: string) {
  const [trips, deferrals] = await Promise.all([
    deps.listTripsOnDate(operationalDate),
    deps.listDeferrals({ orderDate: operationalDate }),
  ]);
  return toPlanningResult({ operationalDate, trips, deferrals });
}

async function getTripRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const tripId = pathId(request, /^\/api\/trips\/([^/]+)$/);
  if (tripId === null) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const trip = await deps.findTripScope(tripId);
  if (trip === null || !canReadTrip(actor(context), trip)) {
    sendDomainFailure(response, "not_found");
    return;
  }
  sendJson(response, 200, toTripResponse(trip));
}

async function confirmTripRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const tripId = pathId(request, /^\/api\/trips\/([^/]+)\/confirm$/);
  const body = await readJson(request);
  if (tripId === null || body === "invalid" || !parseConfirmTripRequest(body).ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const confirmed = await confirmTrip({ actor: actor(context), tripId, store: deps.trips });
  if (!confirmed.ok) {
    sendDomainFailure(response, confirmed.code);
    return;
  }
  sendJson(response, 200, toTripResponse(confirmed.trip));
}

async function dispatchTripRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const tripId = pathId(request, /^\/api\/trips\/([^/]+)\/dispatch$/);
  const body = await readJson(request);
  if (tripId === null || body === "invalid" || !parseDispatchTripRequest(body).ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const dispatched = await dispatchTrip({
    actor: actor(context),
    tripId,
    now: deps.now(),
    store: deps.trips,
  });
  if (!dispatched.ok) {
    sendDomainFailure(response, dispatched.code);
    return;
  }
  sendJson(response, 200, toTripResponse(dispatched.trip));
}

async function listDeferralRoute(deps: CoreDependencies, response: ServerResponse, request: IncomingMessage): Promise<void> {
  const query = parseDeferralListQuery(queryRecord(request));
  if (!query.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const rows = await deps.listDeferrals(query.value);
  sendJson(response, 200, rows.map(toDeferralResponse));
}

async function listLoadingRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
): Promise<void> {
  const rows = await deps.listLoading(context.userId);
  sendJson(response, 200, rows.map(toLoadingTaskResponse));
}

async function verifyLoadingRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const tripStopId = pathId(request, /^\/api\/loading\/([^/]+)\/verify$/);
  const body = await readJson(request);
  if (tripStopId === null || body === "invalid") {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const parsed = parseVerifyLoadingRequest(body);
  if (!parsed.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const verified = await verifyLoading({
    actor: actor(context),
    command: { tripStopId, loadedUnits: parsed.value.loadedUnits },
    now: deps.now(),
    store: deps.loading,
  });
  if (!verified.ok) {
    sendDomainFailure(response, verified.code);
    return;
  }
  sendJson(response, 201, toLoadingTaskResponse(verified.loading));
}

async function shortfallRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const tripStopId = pathId(request, /^\/api\/loading\/([^/]+)\/shortfall$/);
  const body = await readJson(request);
  if (tripStopId === null || body === "invalid") {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const parsed = parseShortfallRequest(body);
  if (!parsed.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const reported = await reportShortfall({
    actor: actor(context),
    command: {
      tripStopId,
      shortfallUnits: parsed.value.shortfallUnits,
      ...(parsed.value.details === undefined ? {} : { details: parsed.value.details }),
    },
    now: deps.now(),
    store: deps.loading,
  });
  if (!reported.ok) {
    sendDomainFailure(response, reported.code);
    return;
  }
  sendJson(response, 200, toLoadingTaskResponse(reported.loading));
}

async function driverRoutes(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
): Promise<void> {
  const trips = await deps.listDriverTrips(context.userId);
  sendJson(response, 200, trips.map(toTripResponse));
}

async function deliveryOutcomeRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const tripStopId = pathId(request, /^\/api\/deliveries\/([^/]+)\/outcome$/);
  const body = await readJson(request);
  if (tripStopId === null || body === "invalid") {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const parsed = parseDeliveryOutcomeRequest(body);
  if (!parsed.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const recorded = await recordDelivery({
    actor: actor(context),
    command: {
      tripStopId,
      outcome: parsed.value.outcome,
      ...(parsed.value.deliveredUnits === undefined ? {} : { deliveredUnits: parsed.value.deliveredUnits }),
      ...(parsed.value.notes === undefined ? {} : { notes: parsed.value.notes }),
    },
    now: deps.now(),
    store: deps.deliveries,
  });
  if (!recorded.ok) {
    sendDomainFailure(response, recorded.code);
    return;
  }
  sendJson(response, 201, toDeliveryResponse(recorded.delivery));
}

async function deliveryProofRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const tripStopId = pathId(request, /^\/api\/deliveries\/([^/]+)\/pod$/);
  const body = await readJson(request);
  if (tripStopId === null || body === "invalid") {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const parsed = parseProofRequest(body);
  if (!parsed.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const proof = await recordProof({
    actor: actor(context),
    command: { tripStopId, evidenceReference: parsed.value.evidenceReference },
    now: deps.now(),
    store: deps.deliveries,
  });
  if (!proof.ok) {
    sendDomainFailure(response, proof.code);
    return;
  }
  sendJson(response, 201, toProofResponse(proof.proof));
}

async function syncBatchRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const body = await readJson(request);
  if (body === "invalid") {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const batch = parseSyncBatchBody(body);
  if (batch === null) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const results = await applySyncBatch({
    actor: actor(context),
    events: batch.events,
    now: deps.now(),
    store: deps.sync,
  });
  emitDiagnostic(syncDiagnostic(results));
  sendJson(response, 200, { results });
}

async function syncStatusRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const clientEventIds = parseSyncStatusQuery(request);
  if (clientEventIds === null) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const results = await readSyncStatus({
    actor: actor(context),
    clientEventIds,
    store: deps.sync,
    deliveries: deps.deliveries,
  });
  sendJson(response, 200, { results });
}

function parseSyncStatusQuery(request: IncomingMessage): string[] | null {
  const params = new URL(request.url ?? "/", "http://127.0.0.1").searchParams;
  const keys = [...new Set(params.keys())];
  if (keys.length !== 1 || keys[0] !== "clientEventId") {
    return null;
  }
  const clientEventIds = params.getAll("clientEventId");
  if (clientEventIds.length === 0 || clientEventIds.some((id) => id.length === 0 || id.trim() !== id)) {
    return null;
  }
  return clientEventIds;
}

async function confirmReceiptRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const orderId = pathId(request, /^\/api\/orders\/([^/]+)\/receipt$/);
  const body = await readJson(request);
  if (orderId === null || body === "invalid") {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const parsed = parseReceiptRequest(body);
  if (!parsed.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const deliveryIds = await deps.deliveryIdsForOrder(orderId);
  const deliveryRecordId = deliveryIds.length === 1 ? deliveryIds[0] : null;
  if (deliveryRecordId === undefined || deliveryRecordId === null) {
    sendDomainFailure(response, deliveryIds.length === 0 ? "not_found" : "invariant_violation");
    return;
  }
  const confirmed = await confirmReceipt({
    actor: actor(context),
    command: {
      deliveryRecordId,
      result: parsed.value.result,
      ...(parsed.value.issueDetails === undefined ? {} : { issueDetails: parsed.value.issueDetails }),
    },
    now: deps.now(),
    store: deps.receipts,
  });
  if (!confirmed.ok) {
    sendDomainFailure(response, confirmed.code);
    return;
  }
  sendJson(response, 201, toReceiptResponse(confirmed.receipt));
}

async function listExceptionRoute(deps: CoreDependencies, response: ServerResponse, request: IncomingMessage): Promise<void> {
  const query = parseExceptionListQuery(queryRecord(request));
  if (!query.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const rows = await deps.listExceptions();
  sendJson(response, 200, rows.map(toExceptionResponse));
}

async function createExceptionRoute(
  deps: CoreDependencies,
  context: RequestSecurityContext,
  response: ServerResponse,
  request: IncomingMessage,
): Promise<void> {
  const body = await readJson(request);
  if (body === "invalid") {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const parsed = parseCreateExceptionRequest(body);
  if (!parsed.ok) {
    sendDomainFailure(response, "invalid_input");
    return;
  }
  const created = await recordException({
    actor: actor(context),
    command: parsed.value,
    now: deps.now(),
    store: deps.exceptions,
  });
  if (!created.ok) {
    sendDomainFailure(response, created.code);
    return;
  }
  sendJson(response, 201, toExceptionResponse(created.exception));
}

function canReadTrip(actorValue: OrderActor, trip: TripScope): boolean {
  if (actorValue.role === "DISPATCHER") {
    return true;
  }
  if (actorValue.role === "DRIVER") {
    return trip.vehicleDriverUserId === actorValue.userId;
  }
  if (actorValue.role === "LOADER") {
    return trip.loaderUserIds.includes(actorValue.userId);
  }
  if (actorValue.role === "STORE_MANAGER") {
    return trip.outletIds.length > 0 && trip.outletIds.every((outletId) => actorValue.assignedOutletIds.includes(outletId));
  }
  return false;
}

function actor(context: RequestSecurityContext): OrderActor {
  return {
    userId: context.userId,
    role: context.role,
    assignedOutletIds: context.assignedOutletIds,
  };
}

function pathId(request: IncomingMessage, pattern: RegExp): string | null {
  const value = pathValue(request, pattern);
  if (value === null) {
    return null;
  }
  const parsed = parseResourceId(decodeURIComponent(value));
  return parsed.ok ? parsed.value : null;
}

function pathValue(request: IncomingMessage, pattern: RegExp): string | null {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  return pattern.exec(pathname)?.[1] ?? null;
}

function queryRecord(request: IncomingMessage): Record<string, string> {
  const params = new URL(request.url ?? "/", "http://127.0.0.1").searchParams;
  const record: Record<string, string> = {};
  for (const [key, value] of params) {
    record[key] = value;
  }
  return record;
}
