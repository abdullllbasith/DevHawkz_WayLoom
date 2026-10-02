import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildSessionCookie,
  createAuthenticatedSession,
  createSessionToken,
  hashSessionToken,
  invalidateSession,
  readSessionToken,
  resolveAuthenticatedSession,
  SESSION_COOKIE_MAX_AGE_SECONDS,
  SESSION_COOKIE_NAME,
  SESSION_LIFETIME_MS,
  type SessionRecord,
  type SessionStore,
} from "./session.js";

const userId = "44444444-4444-4444-8444-444444444444";
const createdAt = new Date("2026-06-01T08:00:00.000Z");

test("a session is stored by hash and the cookie is HttpOnly", async () => {
  const store = memoryStore();
  const created = await createAuthenticatedSession({
    userId,
    now: createdAt,
    store,
    nodeEnv: "development",
    createId: () => "55555555-5555-4555-8555-555555555555",
  });
  const token = readSessionToken(created.cookie);
  assert.ok(token);
  assert.equal(token.includes("."), false);
  assert.notEqual(store.rows[0]?.sessionTokenHash, token);
  assert.equal(store.rows[0]?.sessionTokenHash, hashSessionToken(token));
  assert.equal(store.rows[0]?.expiresAt.getTime() - createdAt.getTime(), SESSION_LIFETIME_MS);
  assert.equal(created.session.userId, userId);
  assert.equal("passwordHash" in created.session, false);
  assert.match(created.cookie, /HttpOnly/);
  assert.match(created.cookie, /SameSite=Strict/);
  assert.match(created.cookie, new RegExp(`Max-Age=${String(SESSION_COOKIE_MAX_AGE_SECONDS)}`));
  assert.equal(created.cookie.includes("Secure"), false);
  assert.equal(buildSessionCookie("token", "production").includes("Secure"), true);
  const resolved = await resolveAuthenticatedSession({
    cookieHeader: created.cookie,
    now: new Date(createdAt.getTime() + 1000),
    store,
  });
  assert.deepEqual(resolved, created.session);
  assert.equal(store.rows[0]?.expiresAt.getTime(), createdAt.getTime() + SESSION_LIFETIME_MS);
});

test("missing, invalid, expired, and revoked sessions are rejected", async () => {
  const store = memoryStore();
  const created = await createAuthenticatedSession({
    userId,
    now: createdAt,
    store,
    nodeEnv: "test",
  });
  const token = readSessionToken(created.cookie);
  assert.equal(await resolveAuthenticatedSession({ cookieHeader: undefined, now: createdAt, store }), null);
  assert.equal(
    await resolveAuthenticatedSession({
      cookieHeader: `${SESSION_COOKIE_NAME}=not-a-session`,
      now: createdAt,
      store,
    }),
    null,
  );
  assert.equal(
    await resolveAuthenticatedSession({
      cookieHeader: created.cookie,
      now: new Date(createdAt.getTime() + SESSION_LIFETIME_MS),
      store,
    }),
    null,
  );
  const stillThere = await resolveAuthenticatedSession({
    cookieHeader: undefined,
    now: createdAt,
    store,
  });
  assert.equal(stillThere, null);
  assert.equal(store.rows[0]?.revokedAt, null);
  const again = await resolveAuthenticatedSession({
    cookieHeader: created.cookie,
    now: new Date(createdAt.getTime() + 1000),
    store,
  });
  assert.equal(again?.sessionId, created.session.sessionId);
  await invalidateSession({ sessionId: created.session.sessionId, now: createdAt, store });
  assert.ok(store.rows[0]?.revokedAt);
  assert.equal(
    await resolveAuthenticatedSession({
      cookieHeader: created.cookie,
      now: new Date(createdAt.getTime() + 1000),
      store,
    }),
    null,
  );
  assert.notEqual(token, store.rows[0]?.sessionTokenHash);
});

test("session secrets are not written to browser storage or logs", () => {
  const source = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), "../../src/security/session.ts"),
    "utf8",
  );
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("sessionStorage"), false);
  assert.equal(source.includes("indexedDB"), false);
  assert.equal(source.includes("IndexedDB"), false);
  assert.equal(source.includes("console."), false);
  const calls: string[] = [];
  const original = console.log;
  console.log = (message?: unknown) => {
    calls.push(String(message));
  };
  try {
    const first = createSessionToken();
    const second = createSessionToken();
    assert.notEqual(first, second);
    assert.equal(first.length > 20, true);
    assert.equal(hashSessionToken(first).includes(first), false);
  } finally {
    console.log = original;
  }
  assert.deepEqual(calls, []);
});

function memoryStore(): SessionStore & { rows: SessionRecord[] } {
  const rows: SessionRecord[] = [];
  return {
    rows,
    async create(record) {
      rows.push({ ...record });
    },
    async findByTokenHash(sessionTokenHash) {
      return rows.find((row) => row.sessionTokenHash === sessionTokenHash) ?? null;
    },
    async revoke(sessionId, revokedAt) {
      const row = rows.find((item) => item.id === sessionId);
      if (row) {
        row.revokedAt = revokedAt;
      }
    },
    async touchLastSeen(sessionId, lastSeenAt) {
      const row = rows.find((item) => item.id === sessionId);
      if (row) {
        row.lastSeenAt = lastSeenAt;
      }
    },
  };
}
