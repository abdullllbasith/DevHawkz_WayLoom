import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createApp } from "../app.js";
import { clientAddress, parseLoginRateLimit, createLoginRateLimiter } from "./login-rate-limit.js";
import type { Logger } from "../log.js";
import type { AuthUserRecord, UserDirectory } from "./auth.js";
import { hashPassword } from "./password.js";
import type { SessionRecord, SessionStore } from "./session.js";

const password = "correct-password";
const passwordHash = await hashPassword(password);
const activeUser: AuthUserRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  loginIdentifier: "seed.store-manager",
  displayName: "Store Manager",
  role: "STORE_MANAGER",
  active: true,
  passwordHash,
};

test("failed logins are throttled without blocking another identifier", async () => {
  let now = new Date("2026-06-01T08:00:00.000Z");
  const sessions = memoryStore();
  const server = await listen(
    createApp({
      nodeEnv: "test",
      log: silentLog(),
      users: directory([activeUser]),
      sessions,
      now: () => now,
      loginRateLimit: createLoginRateLimiter({ maxFailures: 2, windowSeconds: 10 }),
    }),
  );
  try {
    const first = await postLogin(server, activeUser.loginIdentifier, "wrong-password");
    const success = await postLogin(server, activeUser.loginIdentifier, password);
    const second = await postLogin(server, activeUser.loginIdentifier, "wrong-password");
    const throttled = await postLogin(server, activeUser.loginIdentifier, password, { "x-forwarded-for": "203.0.113.8" });
    const other = await postLogin(server, "missing.user", password, { "x-forwarded-for": "198.51.100.4" });
    const health = await fetch(url(server, "/health"));
    assert.equal(first.status, 401);
    assert.equal(success.status, 200);
    assert.equal(second.status, 401);
    assert.equal(throttled.status, 429);
    assert.equal(throttled.headers.get("retry-after"), "10");
    assert.deepEqual(await throttled.json(), { error: { code: "RATE_LIMITED", message: "Too many attempts.", details: {} } });
    assert.equal(other.status, 401);
    assert.deepEqual(await other.json(), { error: { code: "AUTHENTICATION_FAILED", message: "Authentication failed.", details: {} } });
    assert.equal(health.status, 200);
    assert.equal(sessions.rows.length, 1);
    now = new Date(now.getTime() + 10_000);
    const again = await postLogin(server, activeUser.loginIdentifier, password);
    assert.equal(again.status, 200);
  } finally {
    await close(server);
  }
});

test("login rate-limit configuration and addresses stay explicit", () => {
  assert.deepEqual(parseLoginRateLimit({}, "development"), { maxFailures: 20, windowSeconds: 900 });
  assert.deepEqual(parseLoginRateLimit({ LOGIN_RATE_LIMIT_MAX: "3", LOGIN_RATE_LIMIT_WINDOW_SECONDS: "30" }, "production"), {
    maxFailures: 3,
    windowSeconds: 30,
  });
  assert.throws(() => parseLoginRateLimit({}, "production"));
  assert.throws(() => parseLoginRateLimit({ LOGIN_RATE_LIMIT_MAX: "0", LOGIN_RATE_LIMIT_WINDOW_SECONDS: "30" }, "test"));
  const limiter = createLoginRateLimiter({ maxFailures: 1, windowSeconds: 10 });
  const now = new Date("2026-06-01T08:00:00.000Z");
  limiter.recordFailure({ loginIdentifier: "seed.store-manager", remoteAddress: "127.0.0.1", now });
  assert.deepEqual(limiter.check({ loginIdentifier: "seed.store-manager", remoteAddress: "127.0.0.1", now }), {
    allowed: false,
    retryAfterSeconds: 10,
  });
  assert.deepEqual(limiter.check({ loginIdentifier: "seed.store-manager", remoteAddress: "192.0.2.10", now }), {
    allowed: true,
  });
  assert.equal(limiter.check({ loginIdentifier: "seed.store-manager", remoteAddress: null, now }).allowed, false);
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../src/security/login-rate-limit.ts"), "utf8");
  assert.match(source, /socket\?\.remoteAddress/);
  assert.match(source, /x-forwarded-for/);
  assert.equal(source.includes("password"), false);
  assert.equal(source.includes("console."), false);
  assert.equal(
    clientAddress({ socket: null, headers: { "x-forwarded-for": "203.0.113.9, 198.51.100.1" } } as unknown as IncomingMessage),
    "203.0.113.9",
  );
  assert.equal(
    clientAddress({
      socket: { remoteAddress: "127.0.0.1" },
      headers: { "x-forwarded-for": "203.0.113.9" },
    } as unknown as IncomingMessage),
    "127.0.0.1",
  );
});

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

async function postLogin(
  server: Server,
  loginIdentifier: string,
  submittedPassword: string,
  headers?: Record<string, string>,
): Promise<Response> {
  return fetch(url(server, "/api/auth/login"), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ loginIdentifier, password: submittedPassword }),
  });
}
