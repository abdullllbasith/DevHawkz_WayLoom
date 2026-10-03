export function proofBody(evidenceReference: string): { evidenceReference: string } | null {
  const reference = evidenceReference.trim();
  if (reference.length === 0) return null;
  return { evidenceReference: reference };
}
