export const WAYLOOM_CSRF_HEADER = "x-wayloom-csrf";

export type ApprovedPlanMetadata = {
  planId: string;
  approvedBy: string;
  approvedAt: string;
};

export const unavailableApproval: ApprovedPlanMetadata = {
  planId: "—",
  approvedBy: "—",
  approvedAt: "—",
};

export type ConfirmationApiResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

export function preserveConstraintReason(reasonCode: string): string {
  const allowed = ["FUEL_QUOTA", "NO_CAPACITY", "NO_REEFER", "VAN_ACCESS", "WINDOW_CONFLICT", "DEPOT_MISMATCH", "TIME_BUDGET"];
  return allowed.includes(reasonCode) ? reasonCode : "UNSPECIFIED";
}

export function confirmationCards(input: { confirmedTrips: number; scheduledStops: number; deferred: number }) {
  return [
    { id: "vehicles", count: String(input.confirmedTrips), label: "Confirmed trips", pillText: "From trip status" },
    { id: "orders", count: String(input.scheduledStops), label: "Scheduled orders", pillText: `${input.deferred} deferred` },
    { id: "on-time", count: "—", label: "Estimated on-time", pillText: "Not in the planning result" },
    { id: "fuel", count: "—", label: "Estimated fuel", pillText: "Not in the planning result" },
  ];
}

export async function confirmPlanOnServer(input: {
  tripIds?: readonly string[];
  csrfToken?: string;
  fetchFn?: typeof fetch;
}): Promise<ConfirmationApiResult> {
  const clientFetch = input.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined);
  if (!clientFetch) return { ok: true };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (input.csrfToken) headers[WAYLOOM_CSRF_HEADER] = input.csrfToken;
  for (const tripId of input.tripIds ?? []) {
    try {
      const response = await clientFetch(`/api/trips/${encodeURIComponent(tripId)}/confirm`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
        const code = errorData.error?.code ?? "confirmation_failed";
        if (code === "lifecycle_conflict") continue;
        if (code === "authorization_failure" || response.status === 401 || response.status === 403) {
          return { ok: false, code: "authorization_failure", message: "Dispatcher authorization required to commit plan allocation." };
        }
        return { ok: false, code, message: errorData.error?.message ?? "Failed to commit trip allocation on server." };
      }
    } catch {
      return { ok: false, code: "connection_error", message: "Unable to reach server to confirm allocation." };
    }
  }
  return { ok: true };
}
