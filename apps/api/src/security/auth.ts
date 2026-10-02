import { verifyPassword } from "./password.js";
import {
  clearSessionCookie,
  createAuthenticatedSession,
  invalidateSession,
  resolveAuthenticatedSession,
  type SessionStore,
} from "./session.js";

export type AuthUserRecord = {
  id: string;
  loginIdentifier: string;
  displayName: string;
  role: string;
  active: boolean;
  passwordHash: string;
};

export type PublicUser = {
  id: string;
  loginIdentifier: string;
  displayName: string;
  role: string;
};

export type UserDirectory = {
  findByLoginIdentifier(loginIdentifier: string): Promise<AuthUserRecord | null>;
  findById(id: string): Promise<AuthUserRecord | null>;
};

export type LoginResult =
  | { ok: true; user: PublicUser; cookie: string }
  | { ok: false };

export async function login(input: {
  loginIdentifier: string;
  password: string;
  users: UserDirectory;
  sessions: SessionStore;
  now: Date;
  nodeEnv: string;
}): Promise<LoginResult> {
  const user = await input.users.findByLoginIdentifier(input.loginIdentifier);
  if (user === null) {
    return { ok: false };
  }
  const passwordMatches = await verifyPassword(user.passwordHash, input.password);
  if (!user.active || !passwordMatches) {
    return { ok: false };
  }
  const created = await createAuthenticatedSession({
    userId: user.id,
    now: input.now,
    store: input.sessions,
    nodeEnv: input.nodeEnv,
  });
  return { ok: true, user: publicUser(user), cookie: created.cookie };
}

export async function currentUser(input: {
  cookieHeader: string | undefined;
  users: UserDirectory;
  sessions: SessionStore;
  now: Date;
}): Promise<PublicUser | null> {
  const session = await resolveAuthenticatedSession({
    cookieHeader: input.cookieHeader,
    now: input.now,
    store: input.sessions,
  });
  if (session === null) {
    return null;
  }
  const user = await input.users.findById(session.userId);
  if (user === null) {
    return null;
  }
  return publicUser(user);
}

export async function logout(input: {
  cookieHeader: string | undefined;
  sessions: SessionStore;
  now: Date;
  nodeEnv: string;
}): Promise<{ cookie: string }> {
  const session = await resolveAuthenticatedSession({
    cookieHeader: input.cookieHeader,
    now: input.now,
    store: input.sessions,
  });
  if (session !== null) {
    await invalidateSession({
      sessionId: session.sessionId,
      now: input.now,
      store: input.sessions,
    });
  }
  return { cookie: clearSessionCookie(input.nodeEnv) };
}

function publicUser(user: AuthUserRecord): PublicUser {
  return {
    id: user.id,
    loginIdentifier: user.loginIdentifier,
    displayName: user.displayName,
    role: user.role,
  };
}
