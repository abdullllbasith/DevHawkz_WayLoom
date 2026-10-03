import type { OfflineEventType, OfflineLocalState } from "./offline-boundary";

export type SyncDisposition = "applied" | "already-applied" | "retryable" | "non-retryable" | "unauthorized" | "conflict";

const retryLimit = 5;

export function sameClientEvent(left: string, right: string): boolean {
  return left.trim().length > 0 && left === right;
}

export function classifySyncResult(input: {
  eventType: OfflineEventType;
  clientEventId: string;
  recordedClientEventId: string | null;
  httpStatus: number;
  domainCode?: string;
  attemptCount: number;
}): SyncDisposition {
  if (input.clientEventId.trim().length === 0) return "non-retryable";
  if (input.recordedClientEventId !== null && sameClientEvent(input.recordedClientEventId, input.clientEventId)) {
    return "already-applied";
  }
  if (input.httpStatus === 401 || input.httpStatus === 403 || input.domainCode === "authorization_failure" || input.domainCode === "object_scope_failure") {
    return "unauthorized";
  }
  if (input.domainCode === "lifecycle_conflict" || input.domainCode === "concurrency_conflict") {
    return "conflict";
  }
  if (input.httpStatus === 0 || input.httpStatus === 502 || input.httpStatus === 503 || input.httpStatus === 504) {
    return input.attemptCount >= retryLimit ? "non-retryable" : "retryable";
  }
  if (input.httpStatus >= 400) return "non-retryable";
  return "applied";
}

export function nextLocalState(disposition: SyncDisposition, current: OfflineLocalState): OfflineLocalState {
  if (disposition === "applied" || disposition === "already-applied") return "Synced";
  if (disposition === "retryable") return "Pending Sync";
  if (current === "Syncing" && disposition === "unauthorized") return "Failed / Needs Attention";
  if (disposition === "conflict" || disposition === "non-retryable" || disposition === "unauthorized") return "Failed / Needs Attention";
  return current;
}
