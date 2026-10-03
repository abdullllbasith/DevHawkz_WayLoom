export type DeliveryDraft = {
  outcome: string;
  deliveredUnits: string;
  notes: string;
};

export function deliveryOutcomeBody(draft: DeliveryDraft): { outcome: string; deliveredUnits?: number; notes?: string } | null {
  const outcome = draft.outcome.trim();
  if (outcome.length === 0) return null;
  const body: { outcome: string; deliveredUnits?: number; notes?: string } = { outcome };
  if (draft.deliveredUnits.trim().length > 0) {
    const units = Number(draft.deliveredUnits);
    if (!Number.isInteger(units) || units < 0) return null;
    body.deliveredUnits = units;
  }
  const notes = draft.notes.trim();
  if (notes.length > 0) body.notes = notes;
  return body;
}
