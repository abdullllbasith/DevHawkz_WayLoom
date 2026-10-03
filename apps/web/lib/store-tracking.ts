const progressLabels: Record<string, string> = {
  SUBMITTED: "submitted",
  PLANNED_ALLOCATED: "planned or allocated",
  DELIVERED: "delivered",
  RECEIPT_CONFIRMED: "receipt confirmed",
  DEFERRED: "deferred",
};

export function orderProgressLabel(status: string): string {
  return progressLabels[status] ?? status;
}

export const unavailableTracking = {
  vehicle: "—",
  route: "—",
  eta: "—",
} as const;
