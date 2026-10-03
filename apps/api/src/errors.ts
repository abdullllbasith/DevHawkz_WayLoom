import type { ServerResponse } from "node:http";
import type { NodeEnvironment } from "./config.js";
import type { Logger } from "./log.js";

export type ErrorBody = {
  error: {
    code: string;
    message: string;
    details: Record<string, unknown>;
  };
};

const validationDetails = { fields: {} } as Record<string, unknown>;

const catalog: Record<string, { code: string; message: string; details: Record<string, unknown> }> = {
  authentication_required: entry("AUTHENTICATION_REQUIRED", "Authentication required."),
  authentication_failed: entry("AUTHENTICATION_FAILED", "Authentication failed."),
  forbidden: entry("FORBIDDEN", "Forbidden."),
  authorization_failure: entry("FORBIDDEN", "Forbidden."),
  csrf_invalid: entry("CSRF_INVALID", "CSRF validation failed."),
  rate_limited: entry("RATE_LIMITED", "Too many attempts."),
  invalid_request: entry("VALIDATION_FAILED", "Request validation failed.", validationDetails),
  invalid_input: entry("VALIDATION_FAILED", "Request validation failed.", validationDetails),
  not_found: entry("RESOURCE_NOT_FOUND", "Not found."),
  object_scope_failure: entry("RESOURCE_NOT_FOUND", "Not found."),
  method_not_allowed: entry("METHOD_NOT_ALLOWED", "Method not allowed."),
  invalid_transition: entry("INVALID_STATE_TRANSITION", "The record is not in the required state."),
  lifecycle_conflict: entry("INVALID_STATE_TRANSITION", "The record is not in the required state."),
  prerequisite_missing: entry("INVALID_STATE_TRANSITION", "The record is not in the required state."),
  invariant_violation: entry("DOMAIN_RULE_VIOLATION", "The request conflicts with a domain rule."),
  conflict: entry("CONFLICT", "The request conflicts with the current record."),
  concurrency_conflict: entry("CONCURRENT_MODIFICATION", "The record changed before the request completed."),
  persistence_failure: entry("INTERNAL_SERVER_ERROR", "An unexpected error occurred."),
  internal_error: entry("INTERNAL_SERVER_ERROR", "An unexpected error occurred."),
};

export function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers?: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
}

export function sendError(
  response: ServerResponse,
  statusCode: number,
  code: string,
  _message: string,
  headers?: Record<string, string>,
): void {
  const known = catalog[code] ?? catalog.internal_error;
  const body: ErrorBody = {
    error: {
      code: known?.code ?? "INTERNAL_SERVER_ERROR",
      message: known?.message ?? "An unexpected error occurred.",
      details: known?.details ?? {},
    },
  };
  sendJson(response, statusCode, body, headers);
}

export function logUnexpectedError(
  log: Logger,
  nodeEnv: NodeEnvironment,
  error: unknown,
): void {
  if (nodeEnv === "development" && error instanceof Error) {
    log.error(error.stack ?? error.message);
    return;
  }
  log.error("Unexpected API error.");
}

function entry(
  code: string,
  message: string,
  details: Record<string, unknown> = {},
): { code: string; message: string; details: Record<string, unknown> } {
  return { code, message, details };
}
