import type { ServerResponse } from "node:http";
import { sendError } from "../errors.js";
import type { UserDirectory } from "./auth.js";
import type { ObjectDecision } from "./object-authorization.js";
import { authorizeRole, type OperationalRoleName } from "./rbac.js";
import type { SessionStore } from "./session.js";

export const publicRoutes = [
  { method: "GET", path: "/health" },
  { method: "POST", path: "/api/auth/login" },
] as const;

export const sessionRoutes = [
  { method: "GET", path: "/api/auth/me" },
  { method: "POST", path: "/api/auth/logout" },
] as const;

export const securityPipeline = ["authenticate", "authorizeRole", "authorizeObject", "business"] as const;

export type RequestSecurityContext = {
  userId: string;
  role: OperationalRoleName;
  assignedOutletIds: readonly string[];
};

export type OutletAssignmentLookup = (userId: string) => Promise<readonly string[]>;

export type BusinessRoute = {
  method: "GET" | "POST";
  path: string;
  allowedRoles: readonly OperationalRoleName[];
  authorizeObject?: (context: RequestSecurityContext) => ObjectDecision | Promise<ObjectDecision>;
  handle: (context: RequestSecurityContext, response: ServerResponse) => Promise<void> | void;
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
  users: UserDirectory;
  sessions: SessionStore;
  now: Date;
  assignedOutletIds: OutletAssignmentLookup;
  route: BusinessRoute;
}): Promise<void> {
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
      sendError(input.response, 404, "not_found", "Not found.");
      return;
    }
  }
  await input.route.handle(context, input.response);
}

function isOperationalRole(role: string): role is OperationalRoleName {
  return role === "DISPATCHER" || role === "LOADER" || role === "DRIVER" || role === "STORE_MANAGER";
}
