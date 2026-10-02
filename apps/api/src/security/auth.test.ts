import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createApp } from "../app.js";
import type { Logger } from "../log.js";
import { hashPassword } from "./password.js";
import type { AuthUserRecord, UserDirectory } from "./auth.js";
import { SESSION_LIFETIME_MS, type SessionRecord, type SessionStore } from "./session.js";

const password = "correct-password";
const passwordHash = await hashPassword(password);
const createdAt = new Date("2026-06-01T08:00:00.000Z");

const activeUser: AuthUserRecord = {
  id: "44444444-4444-4444-8444-444444444444",
  loginIdentifier: "seed.store-manager",
  displayName: "Store Manager",
  role: "STORE_MANAGER",
  active: true,
  passwordHash,
};

test("an active user receives a session cookie and can read the current user", async () => {
  const users = directory([activeUser]);
  const sessions = memoryStore();
  const logs: string[] = [];
  const now = createdAt;
  const app = createApp({
    nodeEnv: "development",
    log: captureLog(logs),
    users,
    sessions,
    now: () => now,
  });
  const server = await listen(app);
  try {
    const loginResponse = await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        loginIdentifier: activeUser.loginIdentifier,
        password,
      }),
    });
    const loginBody = await loginResponse.text();
    const setCookie = loginResponse.headers.getSetCookie()[0] ?? "";
    assert.equal(loginResponse.status, 200);
    assert.deepEqual(JSON.parse(loginBody), {
      user: {
        id: activeUser.id,
        loginIdentifier: activeUser.loginIdentifier,
        displayName: activeUser.displayName,
        role: activeUser.role,
      },
    });
    assert.equal(loginBody.includes(password), false);
    assert.equal(loginBody.includes(passwordHash), false);
    assert.equal(loginBody.includes("sessionToken"), false);
    assert.match(setCookie, /^wayloom_session=[^;]+/);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /SameSite=Strict/);
    assert.match(setCookie, /Max-Age=43200/);
    assert.equal(setCookie.includes("Secure"), false);
    const token = setCookie.split(";")[0]?.split("=")[1] ?? "";
    assert.equal(loginBody.includes(token), false);
    assert.equal(logs.some((line) => line.includes(password) || line.includes(token)), false);
    assert.equal(sessions.rows[0]?.sessionTokenHash === token, false);
    const me = await fetch(url(server, "/api/auth/me"), {
      headers: { cookie: `wayloom_session=${token}` },
    });
    assert.equal(me.status, 200);
    assert.deepEqual(await me.json(), JSON.parse(loginBody));
  } finally {
    await close(server);
  }
});

test("unknown, inactive, and wrong-password logins fail the same way", async () => {
  const inactive: AuthUserRecord = { ...activeUser, id: "55555555-5555-4555-8555-555555555555", loginIdentifier: "inactive.user", active: false };
  const sessions = memoryStore();
  const app = createApp({
    nodeEnv: "production",
    log: captureLog([]),
    users: directory([activeUser, inactive]),
    sessions,
    now: () => createdAt,
  });
  const server = await listen(app);
  try {
    const unknown = await postLogin(server, "missing.user", password);
    const wrong = await postLogin(server, activeUser.loginIdentifier, "wrong-password");
    const disabled = await postLogin(server, inactive.loginIdentifier, password);
    assert.equal(unknown.status, 401);
    assert.equal(wrong.status, 401);
    assert.equal(disabled.status, 401);
    assert.equal(unknown.body, wrong.body);
    assert.equal(disabled.body, wrong.body);
    assert.deepEqual(JSON.parse(unknown.body), {
      error: { code: "authentication_failed", message: "Authentication failed." },
    });
    assert.equal(unknown.setCookie, "");
    assert.equal(sessions.rows.length, 0);
    const secure = await postLogin(server, activeUser.loginIdentifier, password);
    assert.match(secure.setCookie, /Secure/);
    const invalid = await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginIdentifier: activeUser.loginIdentifier, token: "jwt" }),
    });
    assert.equal(invalid.status, 400);
    assert.deepEqual(await invalid.json(), {
      error: { code: "invalid_request", message: "Invalid request." },
    });
  } finally {
    await close(server);
  }
});

test("current user rejects missing, invalid, and expired sessions", async () => {
  let now = createdAt;
  const sessions = memoryStore();
  const app = createApp({
    nodeEnv: "test",
    log: captureLog([]),
    users: directory([activeUser]),
    sessions,
    now: () => now,
  });
  const server = await listen(app);
  try {
    const missing = await fetch(url(server, "/api/auth/me"));
    const invalid = await fetch(url(server, "/api/auth/me"), {
      headers: { cookie: "wayloom_session=not-a-session" },
    });
    const loginResponse = await postLogin(server, activeUser.loginIdentifier, password);
    const token = loginResponse.setCookie.split(";")[0]?.split("=")[1] ?? "";
    now = new Date(createdAt.getTime() + SESSION_LIFETIME_MS);
    const expired = await fetch(url(server, "/api/auth/me"), {
      headers: { cookie: `wayloom_session=${token}` },
    });
    assert.equal(missing.status, 401);
    assert.equal(invalid.status, 401);
    assert.equal(expired.status, 401);
    assert.equal(await missing.text(), await invalid.text());
    const expiredBody = await expired.text();
    const missingBody = JSON.stringify({
      error: { code: "authentication_required", message: "Authentication required." },
    });
    assert.equal(expiredBody, missingBody);
    assert.equal(sessions.rows[0]?.revokedAt, null);
  } finally {
    await close(server);
  }
});

test("logout revokes the session, clears the cookie, and can be repeated", async () => {
  const sessions = memoryStore();
  const app = createApp({
    nodeEnv: "development",
    log: captureLog([]),
    users: directory([activeUser]),
    sessions,
    now: () => createdAt,
  });
  const server = await listen(app);
  try {
    const loginResponse = await postLogin(server, activeUser.loginIdentifier, password);
    const token = loginResponse.setCookie.split(";")[0]?.split("=")[1] ?? "";
    const cookie = `wayloom_session=${token}`;
    const first = await fetch(url(server, "/api/auth/logout"), {
      method: "POST",
      headers: { cookie },
    });
    const cleared = first.headers.getSetCookie()[0] ?? "";
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { status: "ok" });
    assert.match(cleared, /^wayloom_session=;/);
    assert.match(cleared, /HttpOnly/);
    assert.match(cleared, /SameSite=Strict/);
    assert.match(cleared, /Max-Age=0/);
    assert.ok(sessions.rows[0]?.revokedAt);
    const me = await fetch(url(server, "/api/auth/me"), { headers: { cookie } });
    assert.equal(me.status, 401);
    const second = await fetch(url(server, "/api/auth/logout"), {
      method: "POST",
      headers: { cookie },
    });
    assert.equal(second.status, 200);
    const anonymous = await fetch(url(server, "/api/auth/logout"), { method: "POST" });
    assert.equal(anonymous.status, 200);
  } finally {
    await close(server);
  }
});

test("authentication does not use browser storage", () => {
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../src/security/auth.ts"), "utf8");
  assert.equal(source.includes("localStorage"), false);
  assert.equal(source.includes("IndexedDB"), false);
  assert.equal(source.includes("sessionStorage"), false);
});

function directory(users: AuthUserRecord[]): UserDirectory {
  return {
    async findByLoginIdentifier(loginIdentifier) {
      return users.find((user) => user.loginIdentifier === loginIdentifier) ?? null;
    },
    async findById(id) {
      return users.find((user) => user.id === id) ?? null;
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

function captureLog(lines: string[]): Logger {
  return {
    error(message) {
      lines.push(message);
    },
    info(message) {
      lines.push(message);
    },
  };
}

async function listen(app: ReturnType<typeof createApp>): Promise<Server> {
  const server = createServer(app);
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
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}

async function postLogin(
  server: Server,
  loginIdentifier: string,
  submittedPassword: string,
): Promise<{ status: number; body: string; setCookie: string }> {
  const response = await fetch(url(server, "/api/auth/login"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ loginIdentifier, password: submittedPassword }),
  });
  return {
    status: response.status,
    body: await response.text(),
    setCookie: response.headers.getSetCookie()[0] ?? "",
  };
}
