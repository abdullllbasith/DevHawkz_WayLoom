export type ActionName =
  | "create-order"
  | "submit-order"
  | "receipt"
  | "planning"
  | "dispatch"
  | "verify"
  | "shortfall"
  | "outcome"
  | "proof";

const labels: Record<string, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  CONFIRMED: "Confirmed",
  PLANNED: "Planned",
  PLANNED_ALLOCATED: "Allocated",
  LOADED: "Loaded",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  RECEIPT_CONFIRMED: "Receipt confirmed",
  DEFERRED: "Deferred",
};

export function lifecycleLabel(status: string): string {
  return labels[status] ?? "Recorded";
}

export function lifecycleBadgeClass(status: string): string {
  if (status === "CONFIRMED" || status === "DELIVERED" || status === "RECEIPT_CONFIRMED" || status === "LOADED") return "badge-status-done";
  if (status === "DEFERRED") return "badge-status-warn";
  if (status === "DISPATCHED" || status === "PLANNED" || status === "PLANNED_ALLOCATED") return "badge-status-active";
  return "badge-status-pending";
}

export function readErrorCode(value: unknown): string {
  if (typeof value !== "object" || value === null || !("error" in value)) return "";
  const error = value.error;
  if (typeof error !== "object" || error === null || !("code" in error) || typeof error.code !== "string") return "";
  return error.code;
}

export function humanActionError(status: number, body: unknown, action: ActionName): string {
  const code = readErrorCode(body);
  if (status === 401 || status === 403 || code === "FORBIDDEN" || code === "authorization_failure") {
    return deniedCopy(action);
  }
  if (status === 404 || code === "not_found") return missingCopy(action);
  if (
    status === 409 ||
    code === "lifecycle_conflict" ||
    code === "invariant_violation" ||
    code === "invalid_transition" ||
    code === "conflict" ||
    code === "concurrency_conflict" ||
    code === "prerequisite_missing"
  ) {
    return conflictCopy(action);
  }
  if (status === 0 || status >= 500) return "The server could not be reached. Nothing was changed.";
  if (status === 400 || code === "invalid_input") return invalidCopy(action);
  return unchangedCopy(action);
}

export function receiptGuidance(status: string): { kind: "ready" } | { kind: "done" | "waiting"; message: string } {
  if (status === "DELIVERED") return { kind: "ready" };
  if (status === "RECEIPT_CONFIRMED") return { kind: "done", message: "Receipt already recorded." };
  return { kind: "waiting", message: `Receipt opens after delivery. Current status: ${lifecycleLabel(status)}.` };
}

export const offlineSavedMessage = "Saved on this device. The server has not confirmed it.";

export const loaderVerifiedMessage = "Recorded. The Dispatcher can dispatch this trip once every stop on it is loaded.";

function deniedCopy(action: ActionName): string {
  switch (action) {
    case "create-order":
    case "submit-order":
      return "This account cannot create an order for that outlet.";
    case "receipt":
      return "This account cannot confirm this receipt.";
    case "planning":
      return "This account cannot run planning.";
    case "dispatch":
      return "This account cannot dispatch this trip.";
    case "verify":
      return "This Loader cannot verify that stop.";
    case "shortfall":
      return "This Loader cannot record a shortfall on that record.";
    case "outcome":
      return "This account cannot record an outcome for that stop.";
    case "proof":
      return "This account cannot store proof for that stop.";
    default:
      return "This account cannot complete that step.";
  }
}

function missingCopy(action: ActionName): string {
  switch (action) {
    case "dispatch":
      return "This trip was not found.";
    case "outcome":
    case "proof":
      return "This stop was not found.";
    case "receipt":
    case "create-order":
    case "submit-order":
      return "This order was not found.";
    default:
      return "That record was not found.";
  }
}

function conflictCopy(action: ActionName): string {
  switch (action) {
    case "dispatch":
      return "This trip cannot be dispatched yet. Nothing was changed.";
    case "outcome":
      return "This stop already has a delivery outcome.";
    case "proof":
      return "Proof was not stored. The stop is unchanged.";
    case "receipt":
      return "This receipt was not accepted. The order is unchanged.";
    case "verify":
      return "This stop was not verified. It is unchanged.";
    case "shortfall":
      return "The shortfall was not recorded. The loading record is unchanged.";
    case "create-order":
    case "submit-order":
      return "This order was not accepted. Nothing new was saved.";
    default:
      return "This step was not accepted. Nothing was changed.";
  }
}

function invalidCopy(action: ActionName): string {
  if (action === "create-order" || action === "submit-order") {
    return "The order was not created. Check the delivery id, date, units, weight, and volume.";
  }
  if (action === "planning") return "Planning did not run. Nothing was changed.";
  return "The server did not accept those values. Nothing was changed.";
}

function unchangedCopy(action: ActionName): string {
  switch (action) {
    case "planning":
      return "Planning did not run. Nothing was changed.";
    case "dispatch":
      return "The trip was not dispatched. Nothing was changed.";
    case "create-order":
    case "submit-order":
      return "The order was not created. Nothing was saved.";
    case "receipt":
      return "The receipt was not recorded. The order is unchanged.";
    case "verify":
      return "The server did not record the verification. The stop is unchanged.";
    case "shortfall":
      return "The server did not record the shortfall. The loading record is unchanged.";
    case "outcome":
      return "The server did not record the outcome. The stop is unchanged.";
    case "proof":
      return "The server did not store the proof. Opening this screen is not delivery proof.";
    default:
      return "The server did not complete that step. Nothing was changed.";
  }
}
