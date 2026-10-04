import { AI_CONTRACT_VERSION, type AiUse } from "./input.js";

export const AI_AUDIT_ACTION = "AI_ASSISTANCE";

export type AiHumanDecision = "accepted" | "rejected" | "ignored" | "not_recorded";

export type AiAuditRecord = {
  actorUserId: string;
  occurredAt: Date;
  use: AiUse;
  providerId: string;
  contractVersion: typeof AI_CONTRACT_VERSION;
  validation: "accepted" | "rejected";
  summary: string;
  humanDecision: AiHumanDecision;
};

export type AiAuditWriter = {
  append(record: AiAuditRecord): Promise<void>;
};

const secretPattern = /password|token|secret|cookie|authorization|api[_-]?key/i;

export function aiAuditDetails(record: AiAuditRecord): { action: typeof AI_AUDIT_ACTION; occurredAt: Date; actorUserId: string; details: string } {
  assertSafeAudit(record);
  return {
    action: AI_AUDIT_ACTION,
    occurredAt: record.occurredAt,
    actorUserId: record.actorUserId,
    details: JSON.stringify({
      use: record.use,
      providerId: record.providerId,
      contractVersion: record.contractVersion,
      validation: record.validation,
      summary: record.summary,
      humanDecision: record.humanDecision,
    }),
  };
}

export async function recordAiAudit(writer: AiAuditWriter, record: AiAuditRecord): Promise<boolean> {
  try {
    assertSafeAudit(record);
    await writer.append(record);
    return true;
  } catch {
    return false;
  }
}

export function memoryAudit(): { writer: AiAuditWriter; records: AiAuditRecord[] } {
  const records: AiAuditRecord[] = [];
  return {
    records,
    writer: {
      append(record) {
        records.push(record);
        return Promise.resolve();
      },
    },
  };
}

function assertSafeAudit(record: AiAuditRecord): void {
  if (secretPattern.test(JSON.stringify(record)) || record.summary.length > 240) {
    throw new Error("AI audit record is not safe.");
  }
}
