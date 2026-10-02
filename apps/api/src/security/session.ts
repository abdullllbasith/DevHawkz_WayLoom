import { createHash, randomBytes, randomUUID } from "node:crypto";

export const SESSION_COOKIE_NAME = "wayloom_session";
export const SESSION_LIFETIME_MS = 12 * 60 * 60 * 1000;
export const SESSION_COOKIE_MAX_AGE_SECONDS = 43200;

export type SessionRecord = {
  id: string;
  userId: string;
  sessionTokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  lastSeenAt: Date;
};

export type AuthenticatedSession = {
  userId: string;
  sessionId: string;
};

export type SessionStore = {
  create(record: SessionRecord): Promise<void>;
  findByTokenHash(sessionTokenHash: string): Promise<SessionRecord | null>;
  revoke(sessionId: string, revokedAt: Date): Promise<void>;
  touchLastSeen(sessionId: string, lastSeenAt: Date): Promise<void>;
};

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiry(createdAt: Date): Date {
  return new Date(createdAt.getTime() + SESSION_LIFETIME_MS);
}

export function buildSessionCookie(token: string, nodeEnv: string): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/",
    `Max-Age=${String(SESSION_COOKIE_MAX_AGE_SECONDS)}`,
  ];
  if (nodeEnv === "production") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined || cookieHeader.length === 0) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (name !== SESSION_COOKIE_NAME) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

export async function createAuthenticatedSession(input: {
  userId: string;
  now: Date;
  store: SessionStore;
  nodeEnv: string;
  createId?: () => string;
}): Promise<{ session: AuthenticatedSession; cookie: string }> {
  const token = createSessionToken();
  const record: SessionRecord = {
    id: input.createId ? input.createId() : randomUUID(),
    userId: input.userId,
    sessionTokenHash: hashSessionToken(token),
    expiresAt: sessionExpiry(input.now),
    createdAt: input.now,
    revokedAt: null,
    lastSeenAt: input.now,
  };
  await input.store.create(record);
  return {
    session: { userId: record.userId, sessionId: record.id },
    cookie: buildSessionCookie(token, input.nodeEnv),
  };
}

export async function resolveAuthenticatedSession(input: {
  cookieHeader: string | undefined;
  now: Date;
  store: SessionStore;
}): Promise<AuthenticatedSession | null> {
  const token = readSessionToken(input.cookieHeader);
  if (token === null) {
    return null;
  }
  const record = await input.store.findByTokenHash(hashSessionToken(token));
  if (record === null || record.revokedAt !== null || input.now.getTime() >= record.expiresAt.getTime()) {
    return null;
  }
  if (record.userId.length === 0) {
    return null;
  }
  await input.store.touchLastSeen(record.id, input.now);
  return { userId: record.userId, sessionId: record.id };
}

export async function invalidateSession(input: {
  sessionId: string;
  now: Date;
  store: SessionStore;
}): Promise<void> {
  await input.store.revoke(input.sessionId, input.now);
}
