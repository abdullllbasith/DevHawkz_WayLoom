import assert from "node:assert/strict";
import test from "node:test";

import { confirmationCards, confirmPlanOnServer, preserveConstraintReason, unavailableApproval } from "./dispatcher-confirmation.ts";

test("approval metadata is not invented", () => {
  assert.equal(unavailableApproval.planId, "—");
  assert.equal(unavailableApproval.approvedAt, "—");
});

test("confirmation cards use trip and deferral counts", () => {
  const cards = confirmationCards({ confirmedTrips: 2, scheduledStops: 5, deferred: 1 });
  assert.equal(cards[0]?.count, "2");
  assert.equal(cards[1]?.count, "5");
  assert.equal(cards[2]?.count, "—");
  assert.equal(cards[3]?.count, "—");
});

test("preserveConstraintReason keeps FUEL_QUOTA", () => {
  assert.equal(preserveConstraintReason("FUEL_QUOTA"), "FUEL_QUOTA");
  assert.equal(preserveConstraintReason("UNKNOWN"), "UNSPECIFIED");
});

test("confirmPlanOnServer posts each trip and treats lifecycle_conflict as already confirmed", async () => {
  const calls: string[] = [];
  const result = await confirmPlanOnServer({
    tripIds: ["trip-1", "trip-2"],
    csrfToken: "token",
    fetchFn: async (input) => {
      calls.push(String(input));
      const conflict = String(input).includes("trip-2");
      return new Response(JSON.stringify(conflict ? { error: { code: "lifecycle_conflict" } } : { status: "CONFIRMED" }), { status: conflict ? 409 : 200 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.length, 2);
});

test("confirmPlanOnServer reports authorization failure", async () => {
  const result = await confirmPlanOnServer({
    tripIds: ["trip-1"],
    fetchFn: async () => new Response(JSON.stringify({ error: { code: "authorization_failure" } }), { status: 403 }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "authorization_failure");
});
