import type { OfflineEventType } from "./offline-boundary";
import type { OfflineStore, PendingSyncEvent } from "./offline-store";

export async function recordOfflineAction(input: {
  store: OfflineStore;
  clientEventId: string;
  eventType: OfflineEventType;
  targetId: string;
  clientCreatedAt: string;
  payload: Record<string, unknown>;
}): Promise<PendingSyncEvent> {
  const existing = (await input.store.listEvents()).find((event) => event.clientEventId === input.clientEventId);
  const event: PendingSyncEvent = existing ?? {
    clientEventId: input.clientEventId,
    eventType: input.eventType,
    targetId: input.targetId,
    clientCreatedAt: input.clientCreatedAt,
    state: "Pending Sync",
    attemptCount: 0,
    payload: input.payload,
  };
  await input.store.putEvent(event);
  return event;
}
