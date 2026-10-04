export function isEligibleLoadingStop(input: {
  tripStatus: "PLANNED" | "CONFIRMED";
  orderStatus: string;
  hasLoadingRecord: boolean;
}): boolean {
  return input.tripStatus === "CONFIRMED" && input.orderStatus === "PLANNED_ALLOCATED" && !input.hasLoadingRecord;
}
