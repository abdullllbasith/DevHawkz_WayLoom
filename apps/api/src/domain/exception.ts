import { authorizeDispatcherOperational } from "../security/object-authorization.js";
import { persistenceCode } from "./domain-transaction.js";
import type { OrderActor } from "./order.js";

export type ExceptionDomainCode =
  | "invalid_input"
  | "authorization_failure"
  | "concurrency_conflict"
  | "persistence_failure";

export type ExceptionResult =
  | { ok: true; exception: StoredException }
  | { ok: false; code: ExceptionDomainCode };

export type StoredException = {
  id: string;
  category: string;
  details: string | null;
  occurredAt: Date;
  reportedByUserId: string | null;
};

export type ExceptionStore = {
  create(input: {
    category: string;
    details: string | null;
    occurredAt: Date;
    reportedByUserId: string;
  }): Promise<StoredException>;
};

const prohibitedCommandFields = [
  "role",
  "actorUserId",
  "reportedByUserId",
  "occurredAt",
  "status",
  "severity",
  "orderId",
  "tripId",
  "tripStopId",
  "loadingRecordId",
  "deliveryRecordId",
  "receiptId",
  "deferralId",
  "entityType",
  "entityId",
] as const;

export async function recordException(input: {
  actor: OrderActor;
  command: Record<string, unknown>;
  now: Date;
  store: ExceptionStore;
}): Promise<ExceptionResult> {
  if (hasProhibitedField(input.command)) {
    return failure("invalid_input");
  }
  if (!dispatcher(input.actor)) {
    return failure("authorization_failure");
  }
  const category = requiredText(input.command.category);
  const details = optionalText(input.command.details);
  if (category === null || details === null) {
    return failure("invalid_input");
  }
  try {
    const exception = await input.store.create({
      category,
      details: details ?? null,
      occurredAt: input.now,
      reportedByUserId: input.actor.userId,
    });
    return { ok: true, exception };
  } catch (error) {
    return failure(persistenceCode(error));
  }
}

function dispatcher(actor: OrderActor): boolean {
  return authorizeDispatcherOperational({
    role: actor.role,
    target: "exception",
    action: "mutate",
  }).allowed;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  return value;
}

function hasProhibitedField(command: Record<string, unknown>): boolean {
  return prohibitedCommandFields.some((field) => Object.prototype.hasOwnProperty.call(command, field));
}

function failure(code: ExceptionDomainCode): ExceptionResult {
  return { ok: false, code };
}
