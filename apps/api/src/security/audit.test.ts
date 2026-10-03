import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createApp } from "../app.js";
import type { Logger } from "../log.js";
import { defineBusinessRoute } from "./api-boundary.js";
import type { SecurityAuditRecord, SecurityAuditWriter } from "./audit.js";
import type { AuthUserRecord, UserDirectory } from "./auth.js";
import { createCsrfToken } from "./csrf.js";
import { createLoginRateLimiter } from "./login-rate-limit.js";
import { hashPassword } from "./password.js";
import { authorizeStoreManagerOutlet } from "./object-authorization.js";
import { readSessionToken, type SessionRecord, type SessionStore } from "./session.js";

const now = new Date("2026-06-01T08:00:00.000Z");
const managerId = "44444444-4444-4444-8444-444444444444";
const loaderId = "22222222-2222-4222-8222-222222222222";
const password = "audit-test-password";
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";

test("security decisions create one safe audit event", async () => {
  const passwordHash = await hashPassword(password);
  const audit = memoryAudit();
  const sessions = memoryStore();
  const server = await listen(app(audit, sessions, [manager(passwordHash), loader(passwordHash)]));
  try {
    const unknown = await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-user-id": managerId },
      body: JSON.stringify({ loginIdentifier: "missing.user", password }),
    });
    assert.equal(unknown.status, 401);
    assert.equal(JSON.stringify(unknownBody(await unknown.json())).includes("audit"), false);

    const loggedIn = await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-user-id": loaderId },
      body: JSON.stringify({ loginIdentifier: "seed.store-manager", password, actorUserId: loaderId }),
    });
    assert.equal(loggedIn.status, 400);

    const accepted = await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json", "x-actor-user-id": loaderId },
      body: JSON.stringify({ loginIdentifier: "seed.store-manager", password }),
    });
    assert.equal(accepted.status, 200);
    const cookie = setCookie(accepted);
    const token = readSessionToken(cookie);
    assert.ok(token);
    const csrf = createCsrfToken(token);

    const role = await fetch(url(server, "/api/orders/read"), { headers: { cookie } });
    assert.equal(role.status, 403);
    const roleBody = await role.json();
    assert.deepEqual(roleBody, { error: { code: "FORBIDDEN", message: "Forbidden.", details: {} } });

    const object = await fetch(url(server, "/api/orders/change"), {
      method: "POST",
      headers: { cookie, "x-wayloom-csrf": csrf },
    });
    assert.equal(object.status, 404);

    const csrfRejected = await fetch(url(server, "/api/orders/change"), {
      method: "POST",
      headers: { cookie, "x-wayloom-csrf": "csrf-marker-do-not-store" },
    });
    assert.equal(csrfRejected.status, 403);

    const health = await fetch(url(server, "/health"));
    assert.equal(health.status, 200);

    const logout = await fetch(url(server, "/api/auth/logout"), {
      method: "POST",
      headers: { cookie, "x-wayloom-csrf": csrf },
    });
    assert.equal(logout.status, 200);

    assert.deepEqual(audit.records.map((record) => record.action), [
      "LOGIN_FAILURE",
      "LOGIN_SUCCESS",
      "AUTHORIZATION_DENIED",
      "OBJECT_AUTHORIZATION_DENIED",
      "CSRF_REJECTED",
      "LOGOUT",
    ]);
    assert.equal(audit.records[0]?.actorUserId, null);
    assert.equal(audit.records[1]?.actorUserId, managerId);
    assert.equal(audit.records[2]?.details, "role");
    assert.equal(audit.records[3]?.details, "object");
    assert.equal(audit.records[4]?.details, "POST /api/orders/change");
    assert.equal(audit.records[5]?.actorUserId, managerId);
    const stored = JSON.stringify(audit.records);
    assert.equal(stored.includes(password), false);
    assert.equal(stored.includes(passwordHash), false);
    assert.equal(stored.includes(token), false);
    assert.equal(stored.includes("wayloom_session"), false);
    assert.equal(stored.includes("csrf-marker-do-not-store"), false);
    assert.equal(stored.includes(csrf), false);
    assert.equal(stored.includes("missing.user"), false);
    assert.deepEqual(Object.keys(audit.records[0] ?? {}).sort(), ["action", "actorUserId", "details", "occurredAt"]);
  } finally {
    await close(server);
  }
});

test("audit failure keeps the security decision", async () => {
  const passwordHash = await hashPassword(password);
  const sessions = memoryStore();
  const audit = failingAudit();
  const server = await listen(app(audit, sessions, [manager(passwordHash)]));
  try {
    const rejected = await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginIdentifier: "seed.store-manager", password: "wrong-password" }),
    });
    assert.equal(rejected.status, 401);

    const accepted = await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginIdentifier: "seed.store-manager", password }),
    });
    assert.equal(accepted.status, 500);
    assert.equal(accepted.headers.get("set-cookie"), null);
    assert.equal(sessions.rows[0]?.revokedAt?.toISOString(), now.toISOString());
  } finally {
    await close(server);
  }
});

test("rate limiting does not persist limiter keys", async () => {
  const passwordHash = await hashPassword(password);
  const audit = memoryAudit();
  const server = await listen(
    app(audit, memoryStore(), [manager(passwordHash)], createLoginRateLimiter({ maxFailures: 1, windowSeconds: 60 })),
  );
  try {
    await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginIdentifier: "seed.store-manager", password: "wrong-password" }),
    });
    const limited = await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginIdentifier: "seed.store-manager", password }),
    });
    assert.equal(limited.status, 429);
    assert.deepEqual(audit.records.map((record) => record.action), ["LOGIN_FAILURE"]);
    assert.equal(JSON.stringify(audit.records).includes("seed.store-manager"), false);
  } finally {
    await close(server);
  }
});

test("the audit store only appends events", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
  const source = readFileSync(resolve(root, "apps/api/src/security/audit-store.ts"), "utf8");
  assert.equal(source.includes(".delete"), false);
  assert.equal(source.includes(".update"), false);
  assert.equal(source.includes("password"), false);
});

function app(
  audit: SecurityAuditWriter,
  sessions: SessionStore,
  records: AuthUserRecord[],
  loginRateLimit = createLoginRateLimiter({ maxFailures: 20, windowSeconds: 900 }),
) {
  return createApp({
    nodeEnv: "test",
    log: silentLog(),
    users: directory(records),
    sessions,
    now: () => now,
    audit,
    loginRateLimit,
    businessRoutes: [
      defineBusinessRoute({
        method: "GET",
        path: "/api/orders/read",
        allowedRoles: ["DISPATCHER"],
        handle() {},
      }),
      defineBusinessRoute({
        method: "POST",
        path: "/api/orders/change",
        allowedRoles: ["STORE_MANAGER"],
        authorizeObject() {
          return authorizeStoreManagerOutlet({
            role: "STORE_MANAGER",
            assignedOutletIds: [],
            outletId: outletA,
            action: "mutate",
          });
        },
        handle() {},
      }),
    ],
  });
}

function manager(passwordHash: string): AuthUserRecord {
  return user(managerId, "seed.store-manager", "STORE_MANAGER", passwordHash);
}

function loader(passwordHash: string): AuthUserRecord {
  return user(loaderId, "seed.loader", "LOADER", passwordHash);
}

function user(id: string, loginIdentifier: string, role: string, passwordHash: string): AuthUserRecord {
  return { id, loginIdentifier, displayName: loginIdentifier, role, passwordHash, active: true };
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

function memoryAudit(): SecurityAuditWriter & { records: SecurityAuditRecord[] } {
  const records: SecurityAuditRecord[] = [];
  return {
    records,
    async record(event) {
      records.push({ ...event });
    },
  };
}

function failingAudit(): SecurityAuditWriter {
  return {
    async record() {
      throw new Error("audit storage unavailable");
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

function unknownBody(body: unknown): string {
  return JSON.stringify(body);
}

function setCookie(response: Response): string {
  return response.headers.get("set-cookie") ?? "";
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
