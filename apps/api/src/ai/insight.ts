import { AI_CONTRACT_VERSION, parseAiInput, type InsightMeasurement, type OperationalInsightInput } from "./input.js";
import { recordAiAudit, type AiAuditWriter } from "./audit.js";
import { validateAdvisory } from "./boundary.js";
import type { AiAdvisory } from "./output.js";
import { requestAdvisory, type AiProvider, type AiSettings } from "./provider.js";

export type OperationalInsight =
  | { ok: true; advisory: AiAdvisory; decisionSupport: true; stateChanged: false }
  | { ok: false; code: "insufficient_context" | "unavailable" | "invalid_output" | "audit_failure"; fallbackText: string; stateChanged: false };

export async function explainInsight(input: {
  periodStart: string;
  periodEnd: string;
  metrics: InsightMeasurement[];
  capturedAt: string;
  provider: AiProvider;
  settings: Pick<AiSettings, "timeoutMs" | "maxResponseChars">;
  actorUserId: string;
  occurredAt: Date;
  audit: AiAuditWriter;
}): Promise<OperationalInsight> {
  const parsed = parseAiInput({
    contractVersion: AI_CONTRACT_VERSION,
    capturedAt: input.capturedAt,
    use: "operational_insight",
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    metrics: input.metrics,
  });
  if (!parsed.ok || !("metrics" in parsed.value) || parsed.value.metrics.length === 0) {
    return { ok: false, code: "insufficient_context", fallbackText: "No approved measurements were supplied.", stateChanged: false };
  }
  const advisory = await requestAdvisory(parsed.value, input.provider, input.settings);
  const checked = advisory.ok ? validateAdvisory(parsed.value, advisory.advisory, input.provider.id) : null;
  const rejected = !advisory.ok || checked === null || !checked.ok;
  const recorded = await recordAiAudit(input.audit, {
    actorUserId: input.actorUserId,
    occurredAt: input.occurredAt,
    use: "operational_insight",
    providerId: input.provider.id,
    contractVersion: "1",
    validation: rejected ? "rejected" : "accepted",
    summary: rejected || checked === null || !checked.ok ? "rejected operational insight" : checked.advisory.text.slice(0, 240),
    humanDecision: "not_recorded",
  });
  if (!recorded) {
    return { ok: false, code: "audit_failure", fallbackText: insightFallback(parsed.value), stateChanged: false };
  }
  if (rejected || !checked?.ok) {
    return {
      ok: false,
      code: advisory.ok ? "invalid_output" : "unavailable",
      fallbackText: insightFallback(parsed.value),
      stateChanged: false,
    };
  }
  return { ok: true, advisory: checked.advisory, decisionSupport: true, stateChanged: false };
}

function insightFallback(input: OperationalInsightInput): string {
  const parts = input.metrics.map((item) => `${item.metric}=${item.value}`);
  return `Decision support for ${input.periodStart} to ${input.periodEnd}: ${parts.join(", ")}.`;
}
