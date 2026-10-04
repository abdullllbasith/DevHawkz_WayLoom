import type { IncomingMessage, ServerResponse } from "node:http";
import type { NodeEnvironment } from "./config.js";
import { resolveCorrelationId, withCorrelation } from "./correlation.js";
import { logUnexpectedError, sendError, sendJson } from "./errors.js";
import type { Logger } from "./log.js";
import {
  defineBusinessRoute,
  enforceBusinessRoute,
  type BusinessRoute,
  type OutletAssignmentLookup,
} from "./security/api-boundary.js";
import { writeSecurityAudit, type SecurityAuditWriter } from "./security/audit.js";
import { currentUser, login, logout, type UserDirectory } from "./security/auth.js";
import { createCsrfToken, csrfTokenMatches } from "./security/csrf.js";
import {
  applySecurityHeaders,
  corsResponseHeaders,
  securityHeaders,
  type HttpSecurityConfig,
} from "./security/http-security.js";
import { clientAddress, createLoginRateLimiter, type LoginRateLimiter } from "./security/login-rate-limit.js";
import { invalidateSession, readSessionToken, resolveAuthenticatedSession, type SessionStore } from "./security/session.js";
import { readinessReport, type DependencyState } from "./readiness.js";

export type AppOptions = {
  nodeEnv: NodeEnvironment;
  log: Logger;
  users: UserDirectory;
  sessions: SessionStore;
  now?: () => Date;
  assignedOutletIds?: OutletAssignmentLookup;
  businessRoutes?: readonly BusinessRoute[];
  loginRateLimit?: LoginRateLimiter;
  httpSecurity?: HttpSecurityConfig;
  audit?: SecurityAuditWriter;
  readiness?: () => Promise<DependencyState>;
};

export function createApp(options: AppOptions) {
  const now = options.now ?? (() => new Date());
  const assignedOutletIds = options.assignedOutletIds ?? (async () => []);
  const businessRoutes = (options.businessRoutes ?? []).map((route) => defineBusinessRoute(route));
  const loginRateLimit = options.loginRateLimit ?? createLoginRateLimiter({ maxFailures: 20, windowSeconds: 900 });

  return async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const correlationId = resolveCorrelationId(headerValue(request.headers["x-request-id"]));
    response.setHeader("x-request-id", correlationId);
    return withCorrelation(correlationId, async () => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const method = request.method ?? "GET";
      const httpSecurity = options.httpSecurity ?? { browserOrigin: null, httpsEnabled: false };
      applySecurityHeaders(
        response,
        securityHeaders({
          nodeEnv: options.nodeEnv,
          httpsEnabled: httpSecurity.httpsEnabled,
          pathname,
        }),
      );
      const corsHeaders = corsResponseHeaders(request, httpSecurity.browserOrigin);
      if (corsHeaders !== null) {
        for (const [name, value] of Object.entries(corsHeaders)) {
          response.setHeader(name, value);
        }
      }
      if (method === "OPTIONS") {
        if (corsHeaders !== null) {
          response.writeHead(204);
          response.end();
          return;
        }
      }
      const businessRoute = findBusinessRoute(businessRoutes, method, pathname);
      if (businessRoute) {
        await enforceBusinessRoute({
          response,
          cookieHeader: headerValue(request.headers.cookie),
          csrfHeader: headerValue(request.headers["x-wayloom-csrf"]),
          users: options.users,
          sessions: options.sessions,
          now: now(),
          assignedOutletIds,
          route: businessRoute,
          request,
          log: options.log,
          audit: options.audit,
        });
        return;
      }
      if (pathname === "/health") {
        if (request.method !== "GET") {
          sendError(response, 405, "method_not_allowed", "Method not allowed.");
          return;
        }
        sendJson(response, 200, { status: "ok" });
        return;
      }
      if (pathname === "/ready") {
        if (request.method !== "GET") {
          sendError(response, 405, "method_not_allowed", "Method not allowed.");
          return;
        }
        const database = options.readiness === undefined ? "unavailable" : await options.readiness();
        const report = readinessReport(database);
        sendJson(response, report.status === "ready" ? 200 : 503, report);
        return;
      }
      if (pathname === "/api/auth/login") {
        if (request.method !== "POST") {
          sendError(response, 405, "method_not_allowed", "Method not allowed.");
          return;
        }
        const credentials = parseCredentials(await readBody(request));
        if (credentials === null) {
          sendError(response, 400, "invalid_request", "Invalid request.");
          return;
        }
        const remoteAddress = clientAddress(request);
        const decision = loginRateLimit.check({
          loginIdentifier: credentials.loginIdentifier,
          remoteAddress,
          now: now(),
        });
        if (!decision.allowed) {
          sendError(response, 429, "rate_limited", "Too many attempts.", {
            "retry-after": String(decision.retryAfterSeconds),
          });
          return;
        }
        const result = await login({
          loginIdentifier: credentials.loginIdentifier,
          password: credentials.password,
          users: options.users,
          sessions: options.sessions,
          now: now(),
          nodeEnv: options.nodeEnv,
        });
        if (!result.ok) {
          await writeSecurityAudit({
            writer: options.audit,
            log: options.log,
            event: {
              action: "LOGIN_FAILURE",
              occurredAt: now(),
              actorUserId: null,
              details: null,
            },
          });
          if (remoteAddress !== null) {
            loginRateLimit.recordFailure({
              loginIdentifier: credentials.loginIdentifier,
              remoteAddress,
              now: now(),
            });
          }
          sendError(response, 401, "authentication_failed", "Authentication failed.");
          return;
        }
        const recorded = await writeSecurityAudit({
          writer: options.audit,
          log: options.log,
          event: {
            action: "LOGIN_SUCCESS",
            occurredAt: now(),
            actorUserId: result.user.id,
            details: null,
          },
        });
        if (!recorded) {
          await invalidateSession({
            sessionId: result.sessionId,
            now: now(),
            store: options.sessions,
          });
          sendError(response, 500, "internal_error", "Internal server error.");
          return;
        }
        const sessionToken = readSessionToken(result.cookie);
        sendJson(
          response,
          200,
          { user: result.user, csrfToken: sessionToken === null ? undefined : createCsrfToken(sessionToken) },
          { "set-cookie": result.cookie },
        );
        return;
      }
      if (pathname === "/api/auth/csrf") {
        if (request.method !== "GET") {
          sendError(response, 405, "method_not_allowed", "Method not allowed.");
          return;
        }
        const cookieHeader = headerValue(request.headers.cookie);
        const sessionToken = readSessionToken(cookieHeader);
        const session = await resolveAuthenticatedSession({
          cookieHeader,
          now: now(),
          store: options.sessions,
        });
        if (session === null || sessionToken === null) {
          sendError(response, 401, "authentication_required", "Authentication required.");
          return;
        }
        sendJson(response, 200, { csrfToken: createCsrfToken(sessionToken) });
        return;
      }
      if (pathname === "/api/auth/me") {
        if (request.method !== "GET") {
          sendError(response, 405, "method_not_allowed", "Method not allowed.");
          return;
        }
        const user = await currentUser({
          cookieHeader: headerValue(request.headers.cookie),
          users: options.users,
          sessions: options.sessions,
          now: now(),
        });
        if (user === null) {
          sendError(response, 401, "authentication_required", "Authentication required.");
          return;
        }
        sendJson(response, 200, { user });
        return;
      }
      if (pathname === "/api/auth/logout") {
        if (request.method !== "POST") {
          sendError(response, 405, "method_not_allowed", "Method not allowed.");
          return;
        }
        const cookieHeader = headerValue(request.headers.cookie);
        const sessionToken = readSessionToken(cookieHeader);
        const session = await resolveAuthenticatedSession({
          cookieHeader,
          now: now(),
          store: options.sessions,
        });
        if (session !== null && sessionToken !== null && !csrfTokenMatches(sessionToken, headerValue(request.headers["x-wayloom-csrf"]))) {
          await writeSecurityAudit({
            writer: options.audit,
            log: options.log,
            event: {
              action: "CSRF_REJECTED",
              occurredAt: now(),
              actorUserId: session.userId,
              details: "POST /api/auth/logout",
            },
          });
          sendError(response, 403, "csrf_invalid", "CSRF validation failed.");
          return;
        }
        const result = await logout({
          cookieHeader,
          sessions: options.sessions,
          now: now(),
          nodeEnv: options.nodeEnv,
        });
        if (session !== null) {
          const recorded = await writeSecurityAudit({
            writer: options.audit,
            log: options.log,
            event: {
              action: "LOGOUT",
              occurredAt: now(),
              actorUserId: session.userId,
              details: null,
            },
          });
          if (!recorded) {
            sendError(response, 500, "internal_error", "Internal server error.", { "set-cookie": result.cookie });
            return;
          }
        }
        sendJson(response, 200, { status: "ok" }, { "set-cookie": result.cookie });
        return;
      }
      sendError(response, 404, "not_found", "Not found.");
    } catch (error) {
      logUnexpectedError(options.log, options.nodeEnv, error);
      if (!response.headersSent) {
        sendError(response, 500, "internal_error", "Internal server error.");
      }
    }
    });
  };
}

function findBusinessRoute(
  routes: readonly BusinessRoute[],
  method: string,
  pathname: string,
): BusinessRoute | undefined {
  return (
    routes.find((route) => route.method === method && route.matchPath === undefined && route.path === pathname) ??
    routes.find((route) => route.method === method && route.matchPath?.(pathname) === true)
  );
}

function parseCredentials(body: string | null): { loginIdentifier: string; password: string } | null {
  if (body === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length !== 2 || !keys.includes("loginIdentifier") || !keys.includes("password")) {
    return null;
  }
  const { loginIdentifier, password } = record;
  if (typeof loginIdentifier !== "string" || typeof password !== "string") {
    return null;
  }
  if (loginIdentifier.length === 0 || loginIdentifier.trim() !== loginIdentifier || password.length === 0) {
    return null;
  }
  return { loginIdentifier, password };
}

async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2048) {
      return null;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
