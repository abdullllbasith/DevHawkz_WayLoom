import type { Logger } from "../log.js";

export const securityAuditActions = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "AUTHORIZATION_DENIED",
  "OBJECT_AUTHORIZATION_DENIED",
  "CSRF_REJECTED",
] as const;

export type SecurityAuditAction = (typeof securityAuditActions)[number];

export type SecurityAuditRecord = {
  action: SecurityAuditAction;
  occurredAt: Date;
  actorUserId: string | null;
  details: string | null;
};

export type SecurityAuditWriter = {
  record(event: SecurityAuditRecord): Promise<void>;
};

const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const csrfRoutePattern = /^(GET|POST|PUT|PATCH|DELETE) \/api\/[a-z0-9/-]+$/;

export function assertSecurityAuditRecord(event: SecurityAuditRecord): void {
  const serialized = JSON.stringify({
    action: event.action,
    actorUserId: event.actorUserId,
    details: event.details,
  });
  if (/password|cookie|token|secret|postgres|wayloom_session/i.test(serialized)) {
    throw new Error("Security audit record contains prohibited material.");
  }
  if (event.action === "LOGIN_FAILURE") {
    if (event.actorUserId !== null || event.details !== null) {
      throw new Error("Security audit record is not valid.");
    }
    return;
  }
  if (event.actorUserId === null || !userIdPattern.test(event.actorUserId)) {
    throw new Error("Security audit record is not valid.");
  }
  if (event.action === "LOGIN_SUCCESS" || event.action === "LOGOUT") {
    if (event.details !== null) {
      throw new Error("Security audit record is not valid.");
    }
    return;
  }
  if (event.action === "AUTHORIZATION_DENIED" && event.details === "role") {
    return;
  }
  if (event.action === "OBJECT_AUTHORIZATION_DENIED" && event.details === "object") {
    return;
  }
  if (event.action === "CSRF_REJECTED" && event.details !== null && csrfRoutePattern.test(event.details)) {
    return;
  }
  throw new Error("Security audit record is not valid.");
}

export async function writeSecurityAudit(input: {
  writer: SecurityAuditWriter | undefined;
  log: Logger;
  event: SecurityAuditRecord;
}): Promise<boolean> {
  if (input.writer === undefined) {
    return true;
  }
  try {
    assertSecurityAuditRecord(input.event);
    await input.writer.record(input.event);
    return true;
  } catch {
    input.log.error("Security audit event was not recorded.");
    return false;
  }
}
