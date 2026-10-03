/**
 * Next-day cutoff at 16:00:00 Asia/Colombo (UTC+05:30).
 * The closing day is the calendar day before the delivery day.
 * Equality waits for the following run. This does not defer, allocate, or store an order.
 */
import { CUTOFF_TIME_ZONE, type PlanningInput } from "./contract.js";

const COLOMBO_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const secretKeys = new Set(["password", "passwordhash", "session", "sessionid", "cookie", "csrf", "csrftoken", "authorization", "token", "secret"]);

export type CutoffRequest = {
  operationalDate: string;
  timeZone: string;
  submittedAt: string;
};

export type CutoffFailureCode = "invalid_submitted_at" | "invalid_operational_date" | "invalid_timezone" | "invalid_value";

export type CutoffResult =
  | {
      ok: true;
      submittedAt: string;
      operationalDate: string;
      cutoffDay: string;
      cutoffAt: string;
      planningRun: "next" | "following";
    }
  | {
      ok: false;
      submittedAt: string | null;
      planningRun: null;
      code: CutoffFailureCode;
      path: string;
    };

export function classifyCutoff(request: CutoffRequest): CutoffResult {
  if (containsSecret(request)) return failure(null, "invalid_value", "secret");
  if (request.timeZone !== CUTOFF_TIME_ZONE) return failure(null, "invalid_timezone", "timeZone");
  const cutoff = cutoffInstant(request.operationalDate);
  if (cutoff === null) return failure(null, "invalid_operational_date", "operationalDate");
  const submittedMs = instantMs(request.submittedAt);
  if (submittedMs === null) return failure(null, "invalid_submitted_at", "submittedAt");
  const cutoffMs = Date.parse(cutoff.cutoffAt);
  return {
    ok: true,
    submittedAt: request.submittedAt,
    operationalDate: request.operationalDate,
    cutoffDay: cutoff.cutoffDay,
    cutoffAt: cutoff.cutoffAt,
    planningRun: submittedMs < cutoffMs ? "next" : "following",
  };
}

export function cutoffEligibleOrders(input: PlanningInput): { ok: true; eligibleOrderIds: string[]; followingOrderIds: string[] } | { ok: false; code: CutoffFailureCode; path: string } {
  const eligibleOrderIds: string[] = [];
  const followingOrderIds: string[] = [];
  for (const order of input.orders) {
    const classified = classifyCutoff({
      operationalDate: input.operationalDate,
      timeZone: input.cutoff.timeZone,
      submittedAt: order.submittedAt,
    });
    if (!classified.ok) return { ok: false, code: classified.code, path: classified.path };
    if (classified.planningRun === "next") eligibleOrderIds.push(order.id);
    else followingOrderIds.push(order.id);
  }
  return { ok: true, eligibleOrderIds, followingOrderIds };
}

function cutoffInstant(operationalDate: string): { cutoffDay: string; cutoffAt: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(operationalDate)) return null;
  const [year, month, day] = operationalDate.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined) return null;
  const delivery = new Date(Date.UTC(year, month - 1, day));
  if (delivery.getUTCFullYear() !== year || delivery.getUTCMonth() !== month - 1 || delivery.getUTCDate() !== day) return null;
  const closing = new Date(delivery.getTime() - 24 * 60 * 60 * 1000);
  const cutoffDay = closing.toISOString().slice(0, 10);
  const cutoffAt = new Date(Date.UTC(closing.getUTCFullYear(), closing.getUTCMonth(), closing.getUTCDate(), 16, 0, 0) - COLOMBO_OFFSET_MS).toISOString();
  return { cutoffDay, cutoffAt };
}

function instantMs(value: string): number | null {
  if (!instantPattern.test(value)) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function failure(submittedAt: string | null, code: CutoffFailureCode, path: string): CutoffResult {
  return { ok: false, submittedAt, planningRun: null, code, path };
}

function containsSecret(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsSecret(item));
  if (typeof value !== "object" || value === null) return false;
  return Object.keys(value).some((key) => secretKeys.has(key.toLowerCase()) || containsSecret((value as Record<string, unknown>)[key]));
}
