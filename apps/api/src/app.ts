import type { IncomingMessage, ServerResponse } from "node:http";
import type { NodeEnvironment } from "./config.js";
import { logUnexpectedError, sendError, sendJson } from "./errors.js";
import type { Logger } from "./log.js";
import {
  defineBusinessRoute,
  enforceBusinessRoute,
  type BusinessRoute,
  type OutletAssignmentLookup,
} from "./security/api-boundary.js";
import { currentUser, login, logout, type UserDirectory } from "./security/auth.js";
import { createCsrfToken, csrfTokenMatches } from "./security/csrf.js";
import { readSessionToken, resolveAuthenticatedSession, type SessionStore } from "./security/session.js";

export type AppOptions = {
  nodeEnv: NodeEnvironment;
  log: Logger;
  users: UserDirectory;
  sessions: SessionStore;
  now?: () => Date;
  assignedOutletIds?: OutletAssignmentLookup;
  businessRoutes?: readonly BusinessRoute[];
};

export function createApp(options: AppOptions) {
  const now = options.now ?? (() => new Date());
  const assignedOutletIds = options.assignedOutletIds ?? (async () => []);
  const businessRoutes = (options.businessRoutes ?? []).map((route) => defineBusinessRoute(route));

  return async function handleRequest(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      const method = request.method ?? "GET";
      const businessRoute = businessRoutes.find((route) => route.method === method && route.path === pathname);
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
        const result = await login({
          loginIdentifier: credentials.loginIdentifier,
          password: credentials.password,
          users: options.users,
          sessions: options.sessions,
          now: now(),
          nodeEnv: options.nodeEnv,
        });
        if (!result.ok) {
          sendError(response, 401, "authentication_failed", "Authentication failed.");
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
          sendError(response, 403, "csrf_invalid", "CSRF validation failed.");
          return;
        }
        const result = await logout({
          cookieHeader,
          sessions: options.sessions,
          now: now(),
          nodeEnv: options.nodeEnv,
        });
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
  };
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
