export function canConfirmReceipt(status: string): boolean {
  return status === "DELIVERED";
}

export function receiptBody(result: string, issueDetails: string): { result: string; issueDetails?: string } | null {
  if (result.length === 0) return null;
  const body: { result: string; issueDetails?: string } = { result };
  if (issueDetails.length > 0) body.issueDetails = issueDetails;
  return body;
}
