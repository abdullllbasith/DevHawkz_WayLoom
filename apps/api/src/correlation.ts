import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const correlationStore = new AsyncLocalStorage<string>();
const safeId = /^[A-Za-z0-9_-]{8,64}$/;
const unsafeWord = /password|token|secret|cookie|authorization/i;

export function resolveCorrelationId(header: string | undefined): string {
  if (header !== undefined && safeId.test(header) && !unsafeWord.test(header)) {
    return header;
  }
  return randomUUID();
}

export function currentCorrelationId(): string | undefined {
  return correlationStore.getStore();
}

export function withCorrelation<T>(correlationId: string, work: () => T): T {
  return correlationStore.run(correlationId, work);
}
