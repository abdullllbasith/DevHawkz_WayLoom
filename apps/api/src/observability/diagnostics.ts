import { formatLogLine } from "../log.js";
import { currentCorrelationId } from "../correlation.js";
import type { SyncEventResult } from "../domain/sync-batch.js";

export type PlanningDiagnostic = {
  event: "planning.run";
  operationalDate: string;
  startedAt: string;
  finishedAt: string;
  outcome: "success" | "validation_failure" | "service_failure" | "rejected";
  eligible: number;
  allocated: number;
  deferred: number;
  correlationId?: string;
};

export function planningDiagnostic(input: Omit<PlanningDiagnostic, "event" | "correlationId">): PlanningDiagnostic {
  const correlationId = currentCorrelationId();
  return {
    event: "planning.run",
    ...input,
    ...(correlationId === undefined ? {} : { correlationId }),
  };
}

export function syncDiagnostic(results: readonly SyncEventResult[]): {
  event: "sync.batch";
  accepted: number;
  duplicate: number;
  retryable: number;
  rejected: number;
  clientEventIds: string[];
  correlationId?: string;
} {
  const correlationId = currentCorrelationId();
  return {
    event: "sync.batch",
    accepted: results.filter((item) => item.result === "applied").length,
    duplicate: results.filter((item) => item.result === "already applied").length,
    retryable: results.filter((item) => item.result === "temporary server failure").length,
    rejected: results.filter((item) => item.result !== "applied" && item.result !== "already applied" && item.result !== "temporary server failure").length,
    clientEventIds: results.flatMap((item) => item.clientEventId === null ? [] : [item.clientEventId]),
    ...(correlationId === undefined ? {} : { correlationId }),
  };
}

export function emitDiagnostic(diagnostic: { event: string }): void {
  try {
    const correlationId = currentCorrelationId();
    console.info(formatLogLine({
      timestamp: new Date().toISOString(),
      service: "api",
      severity: "info",
      event: diagnostic.event,
      message: JSON.stringify(diagnostic),
      ...(correlationId === undefined ? {} : { correlationId }),
    }));
  } catch {
    return;
  }
}
