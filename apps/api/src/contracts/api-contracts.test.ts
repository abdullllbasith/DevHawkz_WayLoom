import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  logoutResponse,
  parseConfirmOrderRequest,
  parseConfirmTripRequest,
  parseCreateExceptionRequest,
  parseCreateOrderRequest,
  parseDeferralListQuery,
  parseDeliveryOutcomeRequest,
  parseExceptionListQuery,
  parseLoginRequest,
  parseLogoutRequest,
  parseOrderListQuery,
  parsePlanningRunRequest,
  parseProofRequest,
  parseReceiptRequest,
  parseShortfallRequest,
  parseSubmitOrderRequest,
  parseVerifyLoadingRequest,
  toAuthenticatedUser,
  toDeferralResponse,
  toDeliveryResponse,
  toExceptionResponse,
  toOrderResponse,
  toPlanningResult,
  toProofResponse,
  toReceiptResponse,
  toTripResponse,
  type CreateOrderRequest,
} from "./api-contracts.js";
import type { StoredOrder } from "../domain/order.js";

const outletId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

test("order, planning, loading, delivery, receipt, and deferral requests reject unknown authority", () => {
  const created = parseCreateOrderRequest(validOrder());
  assert.equal(created.ok, true);
  assert.deepEqual(parseCreateOrderRequest({ ...validOrder(), orderUnits: 0 }), { ok: false, code: "invalid_input" });
  assert.deepEqual(parseCreateOrderRequest({ ...validOrder(), orderWeightKg: "-1" }), { ok: false, code: "invalid_input" });
  assert.deepEqual(parseCreateOrderRequest({ ...validOrder(), tempRequirement: "frozen" }), { ok: false, code: "invalid_input" });
  for (const extra of [
    { status: "DELIVERED" },
    { vehicleId: outletId },
    { tripId: outletId },
    { role: "DISPATCHER" },
    { actorUserId: outletId },
    { routeId: "R1" },
    { unexpected: true },
  ]) {
    assert.deepEqual(parseCreateOrderRequest({ ...validOrder(), ...extra }), { ok: false, code: "invalid_input" });
  }
  assert.deepEqual(parseSubmitOrderRequest({}), { ok: true, value: {} });
  assert.deepEqual(parseSubmitOrderRequest({ status: "SUBMITTED" }), { ok: false, code: "invalid_input" });
  assert.deepEqual(parseConfirmOrderRequest({}), { ok: true, value: {} });
  assert.deepEqual(parseConfirmOrderRequest({ status: "CONFIRMED" }), { ok: false, code: "invalid_input" });
  assert.deepEqual(parseOrderListQuery({ status: "Submitted", search: "fresh" }), { ok: false, code: "invalid_input" });

  assert.equal(parsePlanningRunRequest({ operationalDate: "2026-06-02" }).ok, true);
  for (const extra of [{ feasible: true }, { weightCapKg: "1000" }, { fuelQuotaL: "40" }, { windowOpen: "08:00" }]) {
    assert.deepEqual(parsePlanningRunRequest({ operationalDate: "2026-06-02", ...extra }), { ok: false, code: "invalid_input" });
  }

  assert.equal(parseVerifyLoadingRequest({ loadedUnits: 8 }).ok, true);
  assert.deepEqual(parseVerifyLoadingRequest({ loadedUnits: 8, loaderUserId: outletId, status: "LOADED" }), {
    ok: false,
    code: "invalid_input",
  });
  assert.deepEqual(parseShortfallRequest({ shortfallUnits: 2, expectedUnits: 10 }), { ok: false, code: "invalid_input" });

  assert.equal(parseDeliveryOutcomeRequest({ outcome: "left at gate" }).ok, true);
  assert.deepEqual(parseDeliveryOutcomeRequest({ outcome: "left at gate", driverUserId: outletId, status: "DELIVERED" }), {
    ok: false,
    code: "invalid_input",
  });
  assert.deepEqual(parseProofRequest({ evidenceReference: "ref-1", photo: "file", signature: "image", provider: "x" }), {
    ok: false,
    code: "invalid_input",
  });

  assert.equal(parseReceiptRequest({ result: "accepted", issueDetails: "one case short" }).ok, true);
  assert.deepEqual(
    parseReceiptRequest({ result: "accepted", storeManagerUserId: outletId, outletId, status: "RECEIPT_CONFIRMED", severity: "high" }),
    { ok: false, code: "invalid_input" },
  );

  assert.deepEqual(parseDeferralListQuery({ reason: "OTHER", planningResult: "feasible" }), { ok: false, code: "invalid_input" });
  assert.deepEqual(parseCreateExceptionRequest({ category: "loading problem", severity: "high", status: "OPEN", orderId: outletId }), {
    ok: false,
    code: "invalid_input",
  });
  assert.deepEqual(parseExceptionListQuery({}), { ok: true, value: {} });
  assert.deepEqual(parseConfirmTripRequest({ status: "CONFIRMED" }), { ok: false, code: "invalid_input" });
});

test("login keeps the existing fields and responses omit secrets", () => {
  assert.equal(parseLoginRequest({ loginIdentifier: "seed.store-manager", password: "wayloom-dev-only" }).ok, true);
  assert.deepEqual(parseLoginRequest({ loginIdentifier: "seed.store-manager", password: "wayloom-dev-only", role: "DISPATCHER" }), {
    ok: false,
    code: "invalid_input",
  });
  assert.deepEqual(parseLogoutRequest({}), { ok: true, value: {} });
  assert.deepEqual(logoutResponse(), { status: "ok" });
  const user = toAuthenticatedUser({
    id: outletId,
    loginIdentifier: "seed.store-manager",
    displayName: "Store Manager",
    role: "STORE_MANAGER",
  });
  assert.equal(JSON.stringify(user).includes("passwordHash"), false);
  const order = toOrderResponse({
    ...storedOrder(),
    passwordHash: "hash",
    sessionToken: "session",
    cookie: "wayloom_session",
    csrfToken: "csrf",
  } as StoredOrder);
  const encoded = JSON.stringify({
    order,
    user,
    logout: logoutResponse(),
    trip: toTripResponse({
      id: outletId,
      routeId: null,
      operationalDate: "2026-06-02",
      vehicleId: outletId,
      depot: "Peliyagoda",
      tripNumber: 1,
      status: "PLANNED",
      stops: [],
      fuelUsedL: "10",
    } as never),
    planning: toPlanningResult({ operationalDate: "2026-06-02", trips: [], deferrals: [] }),
    deferral: toDeferralResponse({
      id: outletId,
      orderId: outletId,
      reason: "NO_CAPACITY",
      reportedAt: new Date("2026-06-02T08:00:00.000Z"),
    }),
    delivery: toDeliveryResponse({
      id: outletId,
      tripStopId: outletId,
      driverUserId: outletId,
      deliveredAt: new Date("2026-06-02T08:00:00.000Z"),
      outcome: "left at gate",
      deliveredUnits: null,
      notes: null,
    }),
    proof: toProofResponse({
      id: outletId,
      deliveryRecordId: outletId,
      evidenceReference: "ref-1",
      capturedAt: new Date("2026-06-02T08:00:00.000Z"),
      capturedByUserId: outletId,
    }),
    receipt: toReceiptResponse({
      id: outletId,
      deliveryRecordId: outletId,
      storeManagerUserId: outletId,
      confirmedAt: new Date("2026-06-02T08:00:00.000Z"),
      result: "accepted",
      issueDetails: null,
    }),
    exception: toExceptionResponse({
      id: outletId,
      category: "loading problem",
      details: null,
      occurredAt: new Date("2026-06-02T08:00:00.000Z"),
      reportedByUserId: outletId,
    }),
  });
  assert.equal(encoded.includes("passwordHash"), false);
  assert.equal(encoded.includes("sessionToken"), false);
  assert.equal(encoded.includes("wayloom_session"), false);
  assert.equal(encoded.includes("csrfToken"), false);
  assert.equal(encoded.includes("hash"), false);
  assert.equal(encoded.includes("fuelUsedL"), false);
});

test("the contract module does not bind a request to Prisma", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/contracts/api-contracts.ts"), "utf8");
  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("@prisma"), false);
  assert.equal(source.includes("localStorage"), false);
});

function validOrder(): CreateOrderRequest {
  return {
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId,
    tempRequirement: "chilled",
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
  };
}

function storedOrder(): StoredOrder {
  return {
    id: outletId,
    deliveryId: "ORD-100",
    orderDate: "2026-06-02",
    outletId,
    outletCode: "OUT001",
    brand: "Fresh",
    district: "Colombo",
    depot: "Peliyagoda",
    createdByUserId: outletId,
    status: "DRAFT",
    tempRequirement: "chilled",
    orderUnits: 10,
    orderWeightKg: "12.5",
    orderVolumeM3: "1.25",
    submittedAt: null,
  };
}
