import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app.js";
import type { Logger } from "../log.js";
import type { AuthUserRecord, UserDirectory } from "./auth.js";
import { createAuthenticatedSession, type SessionRecord, type SessionStore } from "./session.js";
import { parseBrowserOrigin, parseHttpsEnabled } from "./http-security.js";

const now = new Date("2026-06-01T08:00:00.000Z");
const manager = user("44444444-4444-4444-8444-444444444444", "seed.store-manager", "STORE_MANAGER");
const frontend = "http://127.0.0.1:3000";

test("browser origin configuration stays environment-specific", () => {
  assert.equal(parseBrowserOrigin(undefined, "development"), frontend);
  assert.equal(parseBrowserOrigin(undefined, "test"), frontend);
  assert.equal(parseBrowserOrigin(undefined, "production"), null);
  assert.equal(parseBrowserOrigin(" http://127.0.0.1:3100 ", "test"), "http://127.0.0.1:3100");
  assert.equal(parseBrowserOrigin("https://app.example", "production"), "https://app.example");
  assert.equal(parseHttpsEnabled(undefined, "development"), false);
  assert.equal(parseHttpsEnabled("true", "production"), true);
  assert.throws(() => parseBrowserOrigin("*", "production"), /explicit origin/);
  assert.throws(() => parseBrowserOrigin("null", "development"), /explicit origin/);
  assert.throws(() => parseBrowserOrigin("https://127.0.0.1:3000", "production"), /https origin/);
  assert.throws(() => parseBrowserOrigin("https://app.example", "development"), /127\.0\.0\.1/);
  assert.throws(() => parseHttpsEnabled("true", "development"), /production/);
});

test("CORS allows only the configured origin and preserves CSRF", async () => {
  const sessions = memoryStore();
  const created = await createAuthenticatedSession({
    userId: manager.id,
    now,
    store: sessions,
    nodeEnv: "test",
  });
  const server = await listen(
    createApp({
      nodeEnv: "test",
      log: silentLog(),
      users: directory([manager]),
      sessions,
      now: () => now,
      httpSecurity: { browserOrigin: frontend, httpsEnabled: false },
    }),
  );
  try {
    const preflight = await fetch(url(server, "/api/auth/logout"), {
      method: "OPTIONS",
      headers: {
        origin: frontend,
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type, x-wayloom-csrf",
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(await preflight.text(), "");
    assert.equal(preflight.headers.get("access-control-allow-origin"), frontend);
    assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
    assert.equal(preflight.headers.get("access-control-allow-methods"), "GET, POST");
    assert.equal(preflight.headers.get("access-control-allow-headers"), "content-type, x-wayloom-csrf");
    assert.equal(preflight.headers.get("access-control-allow-origin") === "*", false);

    const denied = await fetch(url(server, "/health"), { headers: { origin: "https://evil.example" } });
    assert.equal(denied.status, 200);
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
    assert.equal(await denied.text(), '{"status":"ok"}');

    const health = await fetch(url(server, "/health"), { headers: { origin: frontend } });
    assert.equal(health.headers.get("access-control-allow-origin"), frontend);
    assert.equal(health.headers.get("x-content-type-options"), "nosniff");
    assert.equal(health.headers.get("referrer-policy"), "same-origin");
    assert.equal(health.headers.get("x-frame-options"), "DENY");
    assert.equal(health.headers.get("strict-transport-security"), null);
    assert.equal(health.headers.get("cache-control"), null);
    assert.match(health.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
    assert.doesNotMatch(health.headers.get("content-security-policy") ?? "", /unsafe-eval|\*/);

    const put = await fetch(url(server, "/health"), {
      method: "OPTIONS",
      headers: { origin: frontend, "access-control-request-method": "PUT" },
    });
    assert.equal(put.headers.get("access-control-allow-origin"), null);

    const logout = await fetch(url(server, "/api/auth/logout"), {
      method: "POST",
      headers: { origin: frontend, cookie: created.cookie.split(";")[0] ?? "" },
    });
    assert.equal(logout.status, 403);
    assert.equal(logout.headers.get("access-control-allow-origin"), frontend);
    assert.equal(logout.headers.get("cache-control"), "no-store");
    const body = await logout.json();
    assert.deepEqual(body, { error: { code: "CSRF_INVALID", message: "CSRF validation failed.", details: {} } });
    assert.equal(JSON.stringify(body).includes("stack"), false);
  } finally {
    await close(server);
  }
});

test("production does not echo an origin or enable HSTS without HTTPS", async () => {
  const server = await listen(
    createApp({
      nodeEnv: "production",
      log: silentLog(),
      users: directory([]),
      sessions: memoryStore(),
      httpSecurity: { browserOrigin: null, httpsEnabled: false },
    }),
  );
  try {
    const response = await fetch(url(server, "/health"), {
      headers: { origin: "https://app.example" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("strict-transport-security"), null);
    assert.equal(response.headers.get("x-powered-by"), null);
  } finally {
    await close(server);
  }
});

test("production HSTS is sent only when HTTPS is enabled", async () => {
  const server = await listen(
    createApp({
      nodeEnv: "production",
      log: silentLog(),
      users: directory([]),
      sessions: memoryStore(),
      httpSecurity: { browserOrigin: "https://app.example", httpsEnabled: true },
    }),
  );
  try {
    const allowed = await fetch(url(server, "/api/auth/me"), { headers: { origin: "https://app.example" } });
    assert.equal(allowed.status, 401);
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://app.example");
    assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
    assert.equal(allowed.headers.get("strict-transport-security"), "max-age=31536000");
    assert.equal(allowed.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(allowed.headers.get("strict-transport-security") ?? "", /includeSubDomains|preload/);

    const echoed = await fetch(url(server, "/api/auth/me"), { headers: { origin: "https://other.example" } });
    assert.equal(echoed.headers.get("access-control-allow-origin"), null);
  } finally {
    await close(server);
  }
});

function user(id: string, loginIdentifier: string, role: AuthUserRecord["role"]): AuthUserRecord {
  return { id, loginIdentifier, displayName: loginIdentifier, role, passwordHash: "unused", active: true };
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
