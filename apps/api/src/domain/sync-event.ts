export const syncEventTypes = ["delivery outcome", "proof of delivery"] as const;

export type SyncEventTypeName = (typeof syncEventTypes)[number];

export type SyncEventDraft = {
  clientEventId: string;
  eventType: SyncEventTypeName;
  targetId: string;
  clientCreatedAt: Date;
  attemptCount: number;
};

const forbiddenPayloadKeys = ["password", "passwordHash", "sessionToken", "csrfToken", "cookie", "actorUserId", "role"];

export function parseSyncEvent(value: Record<string, unknown>): SyncEventDraft | null {
  const clientEventId = text(value.clientEventId);
  const targetId = text(value.targetId);
  const eventType = value.eventType;
  const clientCreatedAt = value.clientCreatedAt instanceof Date && !Number.isNaN(value.clientCreatedAt.getTime()) ? value.clientCreatedAt : null;
  const attemptCount = value.attemptCount;
  if (clientEventId === null || targetId === null || clientCreatedAt === null) return null;
  if (eventType !== "delivery outcome" && eventType !== "proof of delivery") return null;
  if (typeof attemptCount !== "number" || !Number.isInteger(attemptCount) || attemptCount < 0) return null;
  if (!payloadAllowed(value.payload)) return null;
  return { clientEventId, eventType, targetId, clientCreatedAt, attemptCount };
}

export function sameSyncEvent(existingClientEventId: string, next: SyncEventDraft): boolean {
  return existingClientEventId === next.clientEventId;
}

function payloadAllowed(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.keys(value).every((key) => !forbiddenPayloadKeys.includes(key));
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}
