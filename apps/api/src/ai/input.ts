import { deferralReasons, hardConstraints, type DeferralReason, type HardConstraintId } from "@wayloom/planning";

export const AI_CONTRACT_VERSION = "1" as const;

export const insightMetrics = [
  "submitted_orders",
  "deferred_orders",
  "planned_trips",
  "exceptions",
  "delivered_orders",
  "receipts",
] as const;

export type InsightMetric = (typeof insightMetrics)[number];

export type AiUse = "planning_explanation" | "exception_explanation" | "operational_insight";

export type PlanningServedFact = {
  orderId: string;
  vehicleId: string;
  tripNumber: 1 | 2;
};

export type PlanningDeferredFact = {
  orderId: string;
  deliveryId: string;
  constraint: HardConstraintId;
  deferralReason: DeferralReason | null;
};

export type PlanningExplanationInput = {
  contractVersion: typeof AI_CONTRACT_VERSION;
  capturedAt: string;
  operationalDate: string;
  served: PlanningServedFact[];
  deferred: PlanningDeferredFact[];
};

export type ExceptionExplanationInput = {
  contractVersion: typeof AI_CONTRACT_VERSION;
  capturedAt: string;
  exceptionId: string;
  category: string;
  details: string | null;
  occurredAt: string;
};

export type InsightMeasurement = {
  metric: InsightMetric;
  value: number;
};

export type OperationalInsightInput = {
  contractVersion: typeof AI_CONTRACT_VERSION;
  capturedAt: string;
  periodStart: string;
  periodEnd: string;
  metrics: InsightMeasurement[];
};

export type AiInput = PlanningExplanationInput | ExceptionExplanationInput | OperationalInsightInput;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const secretPattern = /password|token|secret|cookie|authorization|api[_-]?key/i;

const constraintIds = new Set(hardConstraints.map((item) => item.id));
const reasonIds = new Set<string>(deferralReasons);

export function parseAiInput(value: unknown): { ok: true; value: AiInput } | { ok: false } {
  if (containsSecret(value) || !isRecord(value)) {
    return { ok: false };
  }
  if (value.contractVersion !== AI_CONTRACT_VERSION || !isoTimestamp(value.capturedAt)) {
    return { ok: false };
  }
  if (value.use === "planning_explanation") {
    return parsePlanning(value);
  }
  if (value.use === "exception_explanation") {
    return parseException(value);
  }
  if (value.use === "operational_insight") {
    return parseInsight(value);
  }
  return { ok: false };
}

export function aiInputUse(input: AiInput): AiUse {
  if ("served" in input) {
    return "planning_explanation";
  }
  if ("exceptionId" in input) {
    return "exception_explanation";
  }
  return "operational_insight";
}

function parsePlanning(value: Record<string, unknown>): { ok: true; value: PlanningExplanationInput } | { ok: false } {
  if (!sameKeys(value, ["contractVersion", "capturedAt", "use", "operationalDate", "served", "deferred"])) {
    return { ok: false };
  }
  const operationalDate = value.operationalDate;
  if (!dateOnly(operationalDate) || !Array.isArray(value.served) || !Array.isArray(value.deferred)) {
    return { ok: false };
  }
  const capturedAt = value.capturedAt;
  if (!isoTimestamp(capturedAt)) {
    return { ok: false };
  }
  const served: PlanningServedFact[] = [];
  for (const item of value.served) {
    if (!isRecord(item) || !sameKeys(item, ["orderId", "vehicleId", "tripNumber"])) {
      return { ok: false };
    }
    if (!uuid(item.orderId) || !sourceId(item.vehicleId) || (item.tripNumber !== 1 && item.tripNumber !== 2)) {
      return { ok: false };
    }
    served.push({ orderId: item.orderId, vehicleId: item.vehicleId, tripNumber: item.tripNumber });
  }
  const deferred: PlanningDeferredFact[] = [];
  for (const item of value.deferred) {
    if (!isRecord(item) || !sameKeys(item, ["orderId", "deliveryId", "constraint", "deferralReason"])) {
      return { ok: false };
    }
    if (!uuid(item.orderId) || !sourceId(item.deliveryId) || !constraint(item.constraint) || !reason(item.deferralReason)) {
      return { ok: false };
    }
    deferred.push({
      orderId: item.orderId,
      deliveryId: item.deliveryId,
      constraint: item.constraint,
      deferralReason: item.deferralReason,
    });
  }
  return {
    ok: true,
    value: {
      contractVersion: AI_CONTRACT_VERSION,
      capturedAt,
      operationalDate,
      served,
      deferred,
    },
  };
}

function parseException(value: Record<string, unknown>): { ok: true; value: ExceptionExplanationInput } | { ok: false } {
  if (!sameKeys(value, ["contractVersion", "capturedAt", "use", "exceptionId", "category", "details", "occurredAt"])) {
    return { ok: false };
  }
  const exceptionId = value.exceptionId;
  const category = value.category;
  const details = value.details;
  const occurredAt = value.occurredAt;
  const capturedAt = value.capturedAt;
  if (!uuid(exceptionId) || !boundedText(category, 80) || !optionalText(details, 240) || !isoTimestamp(occurredAt) || !isoTimestamp(capturedAt)) {
    return { ok: false };
  }
  return {
    ok: true,
    value: {
      contractVersion: AI_CONTRACT_VERSION,
      capturedAt,
      exceptionId,
      category,
      details,
      occurredAt,
    },
  };
}

function parseInsight(value: Record<string, unknown>): { ok: true; value: OperationalInsightInput } | { ok: false } {
  if (!sameKeys(value, ["contractVersion", "capturedAt", "use", "periodStart", "periodEnd", "metrics"])) {
    return { ok: false };
  }
  const periodStart = value.periodStart;
  const periodEnd = value.periodEnd;
  const capturedAt = value.capturedAt;
  if (!dateOnly(periodStart) || !dateOnly(periodEnd) || periodEnd < periodStart || !Array.isArray(value.metrics) || !isoTimestamp(capturedAt)) {
    return { ok: false };
  }
  const metrics: InsightMeasurement[] = [];
  for (const item of value.metrics) {
    if (!isRecord(item) || !sameKeys(item, ["metric", "value"])) {
      return { ok: false };
    }
    if (!insight(item.metric) || !count(item.value)) {
      return { ok: false };
    }
    metrics.push({ metric: item.metric, value: item.value });
  }
  return {
    ok: true,
    value: {
      contractVersion: AI_CONTRACT_VERSION,
      capturedAt,
      periodStart,
      periodEnd,
      metrics,
    },
  };
}

function containsSecret(value: unknown): boolean {
  return secretPattern.test(JSON.stringify(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

function sourceId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64 && value.trim() === value;
}

function dateOnly(value: unknown): value is string {
  return typeof value === "string" && datePattern.test(value);
}

function isoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && value.includes("T");
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max && value.trim() === value;
}

function optionalText(value: unknown, max: number): value is string | null {
  return value === null || (typeof value === "string" && value.length <= max);
}

function constraint(value: unknown): value is HardConstraintId {
  return typeof value === "string" && constraintIds.has(value as HardConstraintId);
}

function reason(value: unknown): value is DeferralReason | null {
  return value === null || (typeof value === "string" && reasonIds.has(value));
}

function insight(value: unknown): value is InsightMetric {
  return typeof value === "string" && insightMetrics.some((metric) => metric === value);
}

function count(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_000_000;
}
