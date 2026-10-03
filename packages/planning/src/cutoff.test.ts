import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parsePlanningInput, type PlanningInput } from "./contract.js";
import { classifyCutoff, cutoffEligibleOrders, type CutoffResult } from "./cutoff.js";
import { planningScenarios } from "./fixtures.js";

const deliveryDay = "2026-06-02";

test("15:59:59 is eligible, and 16:00:00 and 16:00:01 wait", () => {
  const before = classifyCutoff(request(deliveryDay, "2026-06-01T10:29:59.000Z"));
  const exact = classifyCutoff(request(deliveryDay, "2026-06-01T10:30:00.000Z"));
  const after = classifyCutoff(request(deliveryDay, "2026-06-01T10:30:01.000Z"));
  assert.equal(before.ok && before.planningRun, "next");
  assert.equal(before.ok && before.cutoffAt, "2026-06-01T10:30:00.000Z");
  assert.equal(before.ok && before.cutoffDay, "2026-06-01");
  assert.equal(before.ok && before.submittedAt, "2026-06-01T10:29:59.000Z");
  assert.equal(exact.ok && exact.planningRun, "following");
  assert.equal(after.ok && after.planningRun, "following");
  const earlier = classifyCutoff(request(deliveryDay, "2026-06-01T08:00:00.000Z"));
  assert.equal(earlier.ok && earlier.planningRun, "next");
  assert.equal(earlier.ok && earlier.submittedAt, "2026-06-01T08:00:00.000Z");
});

test("the cutoff follows the delivery date, and invalid input is not a late order", () => {
  const sameInstant = "2026-06-01T10:29:59.000Z";
  assert.equal(classifyCutoff(request("2026-06-02", sameInstant)).ok && classifyCutoff(request("2026-06-02", sameInstant)).planningRun, "next");
  assert.equal(classifyCutoff(request("2026-06-01", sameInstant)).ok && classifyCutoff(request("2026-06-01", sameInstant)).planningRun, "following");
  assert.equal(failureCode(classifyCutoff(request(deliveryDay, "2026-06-01T16:00:00"))), "invalid_submitted_at");
  assert.equal(failureCode(classifyCutoff(request(deliveryDay, ""))), "invalid_submitted_at");
  assert.equal(failureCode(classifyCutoff(request("2026-06-31", "2026-06-01T10:30:00.000Z"))), "invalid_operational_date");
  assert.equal(failureCode(classifyCutoff({ ...request(deliveryDay, "2026-06-01T10:30:00.000Z"), timeZone: "UTC" })), "invalid_timezone");
  assert.equal(failureCode(classifyCutoff({ ...request(deliveryDay, "2026-06-01T10:30:00.000Z"), timeZone: "Asia/Kolkata" })), "invalid_timezone");
  const late = classifyCutoff(request(deliveryDay, "2026-06-01T16:00:00.000Z"));
  assert.equal(late.ok && late.planningRun, "following");
  assert.equal(JSON.stringify(late).includes("NO_CAPACITY"), false);
  assert.equal(JSON.stringify(late).includes("deferral"), false);
});

test("an ineligible order stays out of the current run and the input is unchanged", () => {
  const early = input("planning_cutoff_before");
  const late = input("planning_cutoff_after");
  const earlyOrders = cutoffEligibleOrders(early);
  const lateOrders = cutoffEligibleOrders(late);
  assert.equal(earlyOrders.ok && earlyOrders.eligibleOrderIds.length, 1);
  assert.equal(earlyOrders.ok && earlyOrders.followingOrderIds.length, 0);
  assert.equal(lateOrders.ok && lateOrders.eligibleOrderIds.length, 0);
  assert.equal(lateOrders.ok && lateOrders.followingOrderIds[0], late.orders[0]?.id);
  const body = request(deliveryDay, "2026-06-01T10:29:59.000Z");
  const before = JSON.stringify(body);
  const first = classifyCutoff(body);
  const second = classifyCutoff(body);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(body), before);
  assert.equal(body.submittedAt, first.ok ? first.submittedAt : "");
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/cutoff.ts"), "utf8");
  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("Date.now"), false);
  assert.equal(source.includes("getTimezoneOffset"), false);
  assert.equal(source.includes("deferral"), false);
});

function request(operationalDate: string, submittedAt: string): { operationalDate: string; timeZone: string; submittedAt: string } {
  return { operationalDate, timeZone: "Asia/Colombo", submittedAt };
}

function failureCode(result: CutoffResult): string | null {
  return result.ok ? null : result.code;
}

function input(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  const parsed = parsePlanningInput(found.input);
  if (!parsed.ok) throw new Error(name);
  return parsed.value;
}
