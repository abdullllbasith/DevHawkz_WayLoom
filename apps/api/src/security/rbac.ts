import type { ServerResponse } from "node:http";
import { sendError } from "../errors.js";
import type { PublicUser, UserDirectory } from "./auth.js";
import { resolveAuthenticatedSession, type SessionStore } from "./session.js";

export const operationalRoles = ["DISPATCHER", "LOADER", "DRIVER", "STORE_MANAGER"] as const;

export type OperationalRoleName = (typeof operationalRoles)[number];

export type RoleAuthorization =
  | { allowed: true; user: PublicUser }
  | { allowed: false; status: 401 }
  | { allowed: false; status: 403; userId: string };

export async function authorizeRole(input: {
  cookieHeader: string | undefined;
  users: UserDirectory;
  sessions: SessionStore;
  now: Date;
  allowedRoles: readonly OperationalRoleName[];
}): Promise<RoleAuthorization> {
  const session = await resolveAuthenticatedSession({
    cookieHeader: input.cookieHeader,
    now: input.now,
    store: input.sessions,
  });
  if (session === null) {
    return { allowed: false, status: 401 };
  }
  const record = await input.users.findById(session.userId);
  if (record === null) {
    return { allowed: false, status: 401 };
  }
  const user: PublicUser = {
    id: record.id,
    loginIdentifier: record.loginIdentifier,
    displayName: record.displayName,
    role: record.role,
  };
  if (!isOperationalRole(record.role) || !input.allowedRoles.some((role) => role === record.role)) {
    return { allowed: false, status: 403, userId: record.id };
  }
  return { allowed: true, user };
}

export async function requireRole(
  response: ServerResponse,
  input: {
    cookieHeader: string | undefined;
    users: UserDirectory;
    sessions: SessionStore;
    now: Date;
    allowedRoles: readonly OperationalRoleName[];
  },
): Promise<PublicUser | null> {
  const decision = await authorizeRole(input);
  if (decision.allowed) {
    return decision.user;
  }
  if (decision.status === 401) {
    sendError(response, 401, "authentication_required", "Authentication required.");
    return null;
  }
  sendError(response, 403, "forbidden", "Forbidden.");
  return null;
}

function isOperationalRole(role: string): role is OperationalRoleName {
  return operationalRoles.some((approved) => approved === role);
}
