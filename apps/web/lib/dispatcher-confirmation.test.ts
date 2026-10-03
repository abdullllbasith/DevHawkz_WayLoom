import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmPlanOnServer,
  defaultApprovedCards,
  defaultApprovedPlanMetadata,
  defaultLoaderNotificationChecklist,
  defaultNextStepsList,
  getApprovedDeferredOrders,
  getApprovedVehicleAssignments,
  preserveConstraintReason,
} from "./dispatcher-confirmation.ts";

test("defaultApprovedPlanMetadata matches Designathon approved specification", () => {
  assert.equal(defaultApprovedPlanMetadata.planId, "PLAN-2025-0913-01");
  assert.equal(defaultApprovedPlanMetadata.approvedBy, "Dispatcher");
  assert.equal(defaultApprovedPlanMetadata.approvedAt, "13 Sep 2025, 08:42 PM");
});

test("defaultApprovedCards contains exactly 4 summary cards matching Designathon", () => {
  assert.equal(defaultApprovedCards.length, 4);
  assert.equal(defaultApprovedCards[0]?.count, "18 Vehicles");
  assert.equal(defaultApprovedCards[0]?.pillText, "✓ All assigned");
  assert.equal(defaultApprovedCards[1]?.count, "102 Orders");
  assert.equal(defaultApprovedCards[1]?.pillText, "✓ 3 deferred");
  assert.equal(defaultApprovedCards[2]?.count, "96%");
  assert.equal(defaultApprovedCards[2]?.pillText, "✓ Target: 95%");
  assert.equal(defaultApprovedCards[3]?.count, "1,450 L");
  assert.equal(defaultApprovedCards[3]?.pillText, "↓ 11% vs. previous plan");
});

test("defaultLoaderNotificationChecklist contains 5 verified manifest steps", () => {
  assert.equal(defaultLoaderNotificationChecklist.length, 5);
  assert.ok(defaultLoaderNotificationChecklist[0]?.includes("18 vehicles"));
  assert.ok(defaultLoaderNotificationChecklist[1]?.includes("Warehouse team notified"));
  assert.ok(defaultLoaderNotificationChecklist[2]?.includes("Order picking list"));
  assert.ok(defaultLoaderNotificationChecklist[3]?.includes("loading sequence"));
  assert.ok(defaultLoaderNotificationChecklist[4]?.includes("5:30 AM (14 Sep 2025)"));
});

test("defaultNextStepsList contains 3 sequential operational steps", () => {
  assert.equal(defaultNextStepsList.length, 3);
  assert.equal(defaultNextStepsList[0]?.step, 1);
  assert.equal(defaultNextStepsList[0]?.title, "Warehouse Loading");
  assert.equal(defaultNextStepsList[0]?.statusBadge, "Now");
  assert.equal(defaultNextStepsList[1]?.step, 2);
  assert.equal(defaultNextStepsList[1]?.title, "Driver Dispatch");
  assert.equal(defaultNextStepsList[2]?.step, 3);
  assert.equal(defaultNextStepsList[2]?.title, "Delivery in Progress");
});

test("preserveConstraintReason preserves FUEL_QUOTA and does not convert to NO_CAPACITY", () => {
  assert.equal(preserveConstraintReason("FUEL_QUOTA"), "FUEL_QUOTA");
  assert.equal(preserveConstraintReason("NO_CAPACITY"), "NO_CAPACITY");
  assert.equal(preserveConstraintReason("TIME_BUDGET"), "TIME_BUDGET");
  assert.equal(preserveConstraintReason("NO_REEFER"), "NO_REEFER");
  assert.equal(preserveConstraintReason("UNKNOWN"), "UNSPECIFIED");
});

test("getApprovedVehicleAssignments returns 6 vehicle rows with proper load ratios", () => {
  const rows = getApprovedVehicleAssignments();
  assert.equal(rows.length, 6);
  assert.equal(rows[0]?.vehicleId, "VEH001");
  assert.equal(rows[0]?.loadPercent, 62);
  assert.equal(rows[2]?.vehicleId, "VEH003");
  assert.equal(rows[2]?.loadPercent, 100);
});

test("getApprovedDeferredOrders retains deferral reasons truthfully", () => {
  const deferrals = getApprovedDeferredOrders();
  assert.equal(deferrals.length, 3);
  assert.equal(deferrals[0]?.orderId, "OUT078");
  assert.equal(deferrals[0]?.constraintCode, "TIME_BUDGET");
  assert.equal(deferrals[1]?.orderId, "OUT091");
  assert.equal(deferrals[1]?.constraintCode, "TIME_BUDGET");
  assert.equal(deferrals[2]?.orderId, "OUT105");
  assert.equal(deferrals[2]?.constraintCode, "NO_CAPACITY");
});

test("confirmPlanOnServer handles successful confirmation and forwards CSRF header", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};

  const mockFetch: typeof fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedHeaders = (init?.headers as Record<string, string>) || {};
    return new Response(JSON.stringify({ status: "CONFIRMED" }), { status: 200 });
  };

  const result = await confirmPlanOnServer({
    tripIds: ["trip-1"],
    csrfToken: "valid-csrf-token",
    fetchFn: mockFetch,
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.metadata.planId, "PLAN-2025-0913-01");
  }
  assert.ok(capturedUrl.includes("/api/trips/trip-1/confirm"));
  assert.equal(capturedHeaders["x-wayloom-csrf"], "valid-csrf-token");
});

test("confirmPlanOnServer treats lifecycle_conflict as idempotent success", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ error: { code: "lifecycle_conflict", message: "Already confirmed" } }),
      { status: 409 },
    );
  };

  const result = await confirmPlanOnServer({
    tripIds: ["trip-already-confirmed"],
    fetchFn: mockFetch,
  });

  assert.equal(result.ok, true);
});

test("confirmPlanOnServer safely handles authorization failure", async () => {
  const mockFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ error: { code: "authorization_failure", message: "Not authorized" } }),
      { status: 403 },
    );
  };

  const result = await confirmPlanOnServer({
    tripIds: ["trip-unauthorized"],
    fetchFn: mockFetch,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "authorization_failure");
    assert.ok(result.message.includes("authorization"));
  }
});
