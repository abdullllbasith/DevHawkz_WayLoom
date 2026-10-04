import { AI_CONTRACT_VERSION, type AiInput } from "./input.js";
import { parseAiOutput, type AiAdvisory } from "./output.js";

export type AiValidation = {
  accepted: boolean;
  code: "accepted" | "invalid_output";
  contractVersion: typeof AI_CONTRACT_VERSION;
  providerId: string;
};

export function validateAdvisory(context: AiInput, value: unknown, providerId: string): { ok: true; advisory: AiAdvisory; validation: AiValidation } | { ok: false; validation: AiValidation } {
  const parsed = parseAiOutput(value);
  const validation = (accepted: boolean): AiValidation => ({
    accepted,
    code: accepted ? "accepted" : "invalid_output",
    contractVersion: AI_CONTRACT_VERSION,
    providerId,
  });
  if (!parsed.ok || !grounded(context, parsed.value)) {
    return { ok: false, validation: validation(false) };
  }
  return { ok: true, advisory: parsed.value, validation: validation(true) };
}

function grounded(context: AiInput, advisory: AiAdvisory): boolean {
  if ("served" in context) {
    if (advisory.use !== "planning_explanation") {
      return false;
    }
    const orderIds = new Set([...context.served, ...context.deferred].map((item) => item.orderId));
    const facts = new Set<string>(context.deferred.flatMap((item) => item.deferralReason === null ? [item.constraint] : [item.constraint, item.deferralReason]));
    return advisory.factRefs.every((id) => orderIds.has(id)) && advisory.sourceFacts.every((fact) => facts.has(fact));
  }
  if ("exceptionId" in context) {
    if (advisory.use !== "exception_explanation") {
      return false;
    }
    return advisory.factRefs.every((id) => id === context.exceptionId) && advisory.sourceFacts.every((fact) => fact === context.category);
  }
  if (advisory.use !== "operational_insight") {
    return false;
  }
  const allowed = new Set<string>(context.metrics.map((item) => item.metric));
  return advisory.sourceFacts.every((fact) => allowed.has(fact))
    && context.metrics.every((item) => advisory.text.includes(`${item.metric} is ${item.value}`) || advisory.text.includes(`${item.metric}=${item.value}`))
    && advisory.text.includes(context.periodStart)
    && advisory.text.includes(context.periodEnd);
}
