import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createApp } from "../app.js";
import { sendJson } from "../errors.js";
import type { Logger } from "../log.js";
import { defineBusinessRoute } from "./api-boundary.js";
import type { AuthUserRecord, UserDirectory } from "./auth.js";
import { createCsrfToken } from "./csrf.js";
import { createAuthenticatedSession, type SessionRecord, type SessionStore } from "./session.js";

const now = new Date("2026-06-01T08:00:00.000Z");
const manager = user("44444444-4444-4444-8444-444444444444", "seed.store-manager", "STORE_MANAGER");
const loader = user("22222222-2222-4222-8222-222222222222", "seed.loader", "LOADER");

test("state-changing requests require a session-bound CSRF header", async () => {
  const sessions = memoryStore();
  let mutated = false;
  const server = await listen(
    createApp({
      nodeEnv: "test",
      log: silentLog(),
      users: directory([manager, loader]),
      sessions,
      now: () => now,
      businessRoutes: [
        defineBusinessRoute({
          method: "GET",
          path: "/api/orders/read",
          allowedRoles: ["STORE_MANAGER"],
          handle(_context, response) {
            sendJson(response, 200, { ok: true });
          },
        }),
        defineBusinessRoute({
          method: "POST",
          path: "/api/orders/change",
          allowedRoles: ["STORE_MANAGER"],
          handle(_context, response) {
            mutated = true;
            sendJson(response, 200, { ok: true });
          },
        }),
      ],
    }),
  );
  try {
    const managerSession = await createAuthenticatedSession({
      userId: manager.id,
      now,
      store: sessions,
      nodeEnv: "test",
    });
    const loaderSession = await createAuthenticatedSession({
      userId: loader.id,
      now,
      store: sessions,
      nodeEnv: "test",
    });
    const managerCookie = managerSession.cookie.split(";")[0] ?? "";
    const managerToken = managerCookie.split("=")[1] ?? "";
    const csrf = createCsrfToken(managerToken);
    const loaderToken = (loaderSession.cookie.split(";")[0] ?? "").split("=")[1] ?? "";
    const read = await fetch(url(server, "/api/orders/read"), { headers: { cookie: managerCookie } });
    assert.equal(read.status, 200);
    const missing = await fetch(url(server, "/api/orders/change"), {
      method: "POST",
      headers: { cookie: managerCookie, "x-role": "STORE_MANAGER" },
    });
    assert.equal(missing.status, 403);
    assert.deepEqual(await missing.json(), { error: { code: "CSRF_INVALID", message: "CSRF validation failed.", details: {} } });
    assert.equal(mutated, false);
    const malformed = await fetch(url(server, "/api/orders/change?csrfToken=" + csrf), {
      method: "POST",
      headers: { cookie: managerCookie, "x-wayloom-csrf": "not a token" },
    });
    assert.equal(malformed.status, 403);
    assert.equal(mutated, false);
    const otherSession = await fetch(url(server, "/api/orders/change"), {
      method: "POST",
      headers: { cookie: managerCookie, "x-wayloom-csrf": createCsrfToken(loaderToken) },
    });
    assert.equal(otherSession.status, 403);
    assert.equal(mutated, false);
    const rawSession = await fetch(url(server, "/api/orders/change"), {
      method: "POST",
      headers: { cookie: managerCookie, "x-wayloom-csrf": managerToken },
    });
    assert.equal(rawSession.status, 403);
    const allowed = await fetch(url(server, "/api/orders/change"), {
      method: "POST",
      headers: { cookie: managerCookie, "x-wayloom-csrf": csrf, "x-role": "LOADER" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(mutated, true);
    const current = await fetch(url(server, "/api/auth/csrf"), { headers: { cookie: managerCookie } });
    assert.deepEqual(await current.json(), { csrfToken: csrf });
    const blockedLogout = await fetch(url(server, "/api/auth/logout"), {
      method: "POST",
      headers: { cookie: managerCookie },
    });
    assert.equal(blockedLogout.status, 403);
    assert.equal(sessions.rows[0]?.revokedAt, null);
    const logout = await fetch(url(server, "/api/auth/logout"), {
      method: "POST",
      headers: { cookie: managerCookie, "x-wayloom-csrf": csrf },
    });
    assert.equal(logout.status, 200);
    assert.ok(sessions.rows[0]?.revokedAt);
  } finally {
    await close(server);
  }
});

test("CSRF handling does not store or log secrets", () => {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const sources = [
    readFileSync(resolve(repoRoot, "apps/api/src/security/csrf.ts"), "utf8"),
    readFileSync(resolve(repoRoot, "apps/web/lib/api-client.ts"), "utf8"),
  ];
  for (const source of sources) {
    assert.equal(source.includes("localStorage"), false);
    assert.equal(source.includes("IndexedDB"), false);
    assert.equal(source.includes("console."), false);
  }
  assert.equal(sources[1]?.includes("x-wayloom-csrf"), true);
});

function user(id: string, loginIdentifier: string, role: AuthUserRecord["role"]): AuthUserRecord {
  return { id, loginIdentifier, displayName: loginIdentifier, role, active: true, passwordHash: "not-used" };
}

function directory(records: AuthUserRecord[]): UserDirectory {
  return {
    async findByLoginIdentifier(loginIdentifier) {
      return records.find((item) => item.loginIdentifier === loginIdentifier) ?? null;
    },
    async findById(id) {
      return records.find((item) => item.id === id) ?? null;
    },
  };
}

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
      if (row) row.revokedAt = revokedAt;
    },
    async touchLastSeen(sessionId, lastSeenAt) {
      const row = rows.find((item) => item.id === sessionId);
      if (row) row.lastSeenAt = lastSeenAt;
    },
  };
}

function silentLog(): Logger {
  return { error() {}, info() {} };
}

async function listen(handler: ReturnType<typeof createApp>): Promise<Server> {
  const server = createServer(handler);
  await new Promise<void>((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  return server;
}

function url(server: Server, path: string): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(address.port)}${path}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => {
      if (error) rejectClose(error);
      else resolveClose();
    });
  });
}
