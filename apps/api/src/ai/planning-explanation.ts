import type { PlanningResult } from "@wayloom/planning";

import { AI_CONTRACT_VERSION, parseAiInput, type PlanningExplanationInput } from "./input.js";
import { requestAdvisory, type AiProvider, type AiSettings } from "./provider.js";
import { recordAiAudit, type AiAuditWriter } from "./audit.js";
import { validateAdvisory } from "./boundary.js";
import type { AiAdvisory } from "./output.js";

export type PlanningExplanation =
  | { ok: true; advisory: AiAdvisory; allocationChanged: false }
  | { ok: false; code: "insufficient_context" | "unavailable" | "invalid_output" | "audit_failure"; fallbackText: string; allocationChanged: false };

export function planningExplanationInput(result: PlanningResult, capturedAt: string): { ok: true; value: PlanningExplanationInput } | { ok: false } {
  const parsed = parseAiInput({
    contractVersion: AI_CONTRACT_VERSION,
    capturedAt,
    use: "planning_explanation",
    operationalDate: result.operationalDate,
    served: result.trips.flatMap((trip) => trip.orderIds.map((orderId) => ({
      orderId,
      vehicleId: trip.vehicleId,
      tripNumber: trip.tripNumber,
    }))),
    deferred: result.unallocated.map((item) => ({
      orderId: item.orderId,
      deliveryId: item.deliveryId,
      constraint: item.constraint,
      deferralReason: item.deferralReason,
    })),
  });
  if (!parsed.ok || !("served" in parsed.value)) {
    return { ok: false };
  }
  return { ok: true, value: parsed.value };
}

export async function explainPlanning(input: {
  result: PlanningResult;
  capturedAt: string;
  provider: AiProvider;
  settings: Pick<AiSettings, "timeoutMs" | "maxResponseChars">;
  actorUserId: string;
  occurredAt: Date;
  audit: AiAuditWriter;
}): Promise<PlanningExplanation> {
  const parsed = planningExplanationInput(input.result, input.capturedAt);
  if (!parsed.ok || (parsed.value.served.length === 0 && parsed.value.deferred.length === 0)) {
    return { ok: false, code: "insufficient_context", fallbackText: "No planning facts were supplied.", allocationChanged: false };
  }
  const advisory = await requestAdvisory(parsed.value, input.provider, input.settings);
  if (!advisory.ok) {
    return { ok: false, code: advisory.code === "invalid_output" ? "invalid_output" : "unavailable", fallbackText: planningFallback(parsed.value), allocationChanged: false };
  }
  const checked = validateAdvisory(parsed.value, advisory.advisory, input.provider.id);
  const accepted = checked.ok;
  const recorded = await recordAiAudit(input.audit, {
    actorUserId: input.actorUserId,
    occurredAt: input.occurredAt,
    use: "planning_explanation",
    providerId: input.provider.id,
    contractVersion: "1",
    validation: accepted ? "accepted" : "rejected",
    summary: checked.ok ? checked.advisory.text.slice(0, 240) : "rejected planning explanation",
    humanDecision: "not_recorded",
  });
  if (!recorded) {
    return { ok: false, code: "audit_failure", fallbackText: planningFallback(parsed.value), allocationChanged: false };
  }
  if (!checked.ok) {
    return { ok: false, code: "invalid_output", fallbackText: planningFallback(parsed.value), allocationChanged: false };
  }
  return { ok: true, advisory: checked.advisory, allocationChanged: false };
}

function planningFallback(input: PlanningExplanationInput): string {
  const assignments = [...new Set(input.served.map((item) => `${item.vehicleId} trip ${item.tripNumber}`))];
  const served = input.served.length === 0 ? "no served orders" : `${input.served.length} served orders by ${assignments.join(", ")}`;
  if (input.deferred.length === 0) {
    return `Planning ${input.operationalDate}: ${served}. No deferred reason was supplied.`;
  }
  const reasons = input.deferred.map((item) => `${item.deliveryId} ${item.constraint} ${item.deferralReason ?? "no deferral reason"}`);
  return `Planning ${input.operationalDate}: ${served}. ${reasons.join("; ")}.`;
}
