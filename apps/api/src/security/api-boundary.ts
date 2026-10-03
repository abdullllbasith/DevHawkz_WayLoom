import type { IncomingMessage, ServerResponse } from "node:http";
import { sendError } from "../errors.js";
import type { Logger } from "../log.js";
import { writeSecurityAudit, type SecurityAuditWriter } from "./audit.js";
import type { UserDirectory } from "./auth.js";
import { csrfTokenMatches, isStateChangingMethod } from "./csrf.js";
import type { ObjectDecision } from "./object-authorization.js";
import { authorizeRole, type OperationalRoleName } from "./rbac.js";
import { readSessionToken, resolveAuthenticatedSession, type SessionStore } from "./session.js";

export const publicRoutes = [
  { method: "GET", path: "/health" },
  { method: "POST", path: "/api/auth/login" },
] as const;

export const sessionRoutes = [
  { method: "GET", path: "/api/auth/me" },
  { method: "GET", path: "/api/auth/csrf" },
  { method: "POST", path: "/api/auth/logout" },
] as const;

export const securityPipeline = ["authenticate", "csrf", "authorizeRole", "authorizeObject", "business"] as const;

export type RequestSecurityContext = {
  userId: string;
  role: OperationalRoleName;
  assignedOutletIds: readonly string[];
};

export type OutletAssignmentLookup = (userId: string) => Promise<readonly string[]>;

export type BusinessRoute = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  allowedRoles: readonly OperationalRoleName[];
  matchPath?: (pathname: string) => boolean;
  authorizeObject?: (context: RequestSecurityContext) => ObjectDecision | Promise<ObjectDecision>;
  handle: (
    context: RequestSecurityContext,
    response: ServerResponse,
    request: IncomingMessage,
  ) => Promise<void> | void;
};

export function isPublicRoute(method: string, path: string): boolean {
  return publicRoutes.some((route) => route.method === method && route.path === path);
}

export function isSessionRoute(method: string, path: string): boolean {
  return sessionRoutes.some((route) => route.method === method && route.path === path);
}

export function defineBusinessRoute(route: BusinessRoute): BusinessRoute {
  if (isPublicRoute(route.method, route.path) || isSessionRoute(route.method, route.path)) {
    throw new Error("A business route cannot replace a public or session route.");
  }
  if (route.allowedRoles.length === 0) {
    throw new Error("A business route must declare at least one role.");
  }
  return route;
}

export async function enforceBusinessRoute(input: {
  response: ServerResponse;
  cookieHeader: string | undefined;
  csrfHeader: string | undefined;
  users: UserDirectory;
  sessions: SessionStore;
  now: Date;
  assignedOutletIds: OutletAssignmentLookup;
  route: BusinessRoute;
  request: IncomingMessage;
  log: Logger;
  audit?: SecurityAuditWriter;
}): Promise<void> {
  const sessionToken = readSessionToken(input.cookieHeader);
  const session = await resolveAuthenticatedSession({
    cookieHeader: input.cookieHeader,
    now: input.now,
    store: input.sessions,
  });
  if (session === null || sessionToken === null) {
    sendError(input.response, 401, "authentication_required", "Authentication required.");
    return;
  }
  if (isStateChangingMethod(input.route.method) && !csrfTokenMatches(sessionToken, input.csrfHeader)) {
    await writeSecurityAudit({
      writer: input.audit,
      log: input.log,
      event: {
        action: "CSRF_REJECTED",
        occurredAt: input.now,
        actorUserId: session.userId,
        details: `${input.route.method} ${input.route.path}`,
      },
    });
    sendError(input.response, 403, "csrf_invalid", "CSRF validation failed.");
    return;
  }
  const decision = await authorizeRole({
    cookieHeader: input.cookieHeader,
    users: input.users,
    sessions: input.sessions,
    now: input.now,
    allowedRoles: input.route.allowedRoles,
  });
  if (!decision.allowed) {
    if (decision.status === 401) {
      sendError(input.response, 401, "authentication_required", "Authentication required.");
      return;
    }
    await writeSecurityAudit({
      writer: input.audit,
      log: input.log,
      event: {
        action: "AUTHORIZATION_DENIED",
        occurredAt: input.now,
        actorUserId: decision.userId,
        details: "role",
      },
    });
    sendError(input.response, 403, "forbidden", "Forbidden.");
    return;
  }
  if (!isOperationalRole(decision.user.role)) {
    sendError(input.response, 401, "authentication_required", "Authentication required.");
    return;
  }
  const context: RequestSecurityContext = {
    userId: decision.user.id,
    role: decision.user.role,
    assignedOutletIds: await input.assignedOutletIds(decision.user.id),
  };
  if (input.route.authorizeObject) {
    const objectDecision = await input.route.authorizeObject(context);
    if (!objectDecision.allowed) {
      await writeSecurityAudit({
        writer: input.audit,
        log: input.log,
        event: {
          action: "OBJECT_AUTHORIZATION_DENIED",
          occurredAt: input.now,
          actorUserId: context.userId,
          details: "object",
        },
      });
      sendError(input.response, 404, "not_found", "Not found.");
      return;
    }
  }
  await input.route.handle(context, input.response, input.request);
}

function isOperationalRole(role: string): role is OperationalRoleName {
  return role === "DISPATCHER" || role === "LOADER" || role === "DRIVER" || role === "STORE_MANAGER";
}
