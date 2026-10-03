import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { sendDomainFailure } from "./http.js";
import { createApp } from "../app.js";
import type { Logger } from "../log.js";
import { defineBusinessRoute } from "../security/api-boundary.js";
import type { AuthUserRecord, UserDirectory } from "../security/auth.js";
import { createCsrfToken } from "../security/csrf.js";
import { createAuthenticatedSession, type SessionRecord, type SessionStore } from "../security/session.js";

const now = new Date("2026-06-02T14:00:00.000Z");
const dispatcher = user("11111111-1111-4111-8111-111111111111", "seed.dispatcher", "DISPATCHER");
const loader = user("22222222-2222-4222-8222-222222222222", "seed.loader", "LOADER");

test("core failures share one safe error contract", async () => {
  const sessions = memorySessions();
  const server = await listen(
    createApp({
      nodeEnv: "production",
      log: silentLog(),
      users: directory([dispatcher, loader]),
      sessions,
      now: () => now,
      businessRoutes: [
        defineBusinessRoute({
          method: "POST",
          path: "/api/errors/validation",
          allowedRoles: ["DISPATCHER"],
          handle(_context, response) {
            sendDomainFailure(response, "invalid_input");
          },
        }),
        defineBusinessRoute({
          method: "POST",
          path: "/api/errors/transition",
          allowedRoles: ["DISPATCHER"],
          handle(_context, response) {
            sendDomainFailure(response, "invalid_transition");
          },
        }),
        defineBusinessRoute({
          method: "POST",
          path: "/api/errors/rule",
          allowedRoles: ["DISPATCHER"],
          handle(_context, response) {
            sendDomainFailure(response, "invariant_violation");
          },
        }),
        defineBusinessRoute({
          method: "POST",
          path: "/api/errors/concurrency",
          allowedRoles: ["DISPATCHER"],
          handle(_context, response) {
            sendDomainFailure(response, "concurrency_conflict");
          },
        }),
        defineBusinessRoute({
          method: "GET",
          path: "/api/errors/missing",
          allowedRoles: ["DISPATCHER"],
          handle(_context, response) {
            sendDomainFailure(response, "not_found");
          },
        }),
        defineBusinessRoute({
          method: "GET",
          path: "/api/errors/boom",
          allowedRoles: ["DISPATCHER"],
          handle() {
            throw new Error("SELECT password FROM users WHERE session = secret");
          },
        }),
      ],
    }),
  );
  const cookie = await cookieFor(dispatcher, sessions);
  const loaderCookie = await cookieFor(loader, sessions);
  try {
    const anonymous = await fetch(url(server, "/api/auth/me"));
    assert.equal(anonymous.status, 401);
    assert.deepEqual(await anonymous.json(), {
      error: { code: "AUTHENTICATION_REQUIRED", message: "Authentication required.", details: {} },
    });
    const login = await fetch(url(server, "/api/auth/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ loginIdentifier: "missing.user", password: "wrong-password" }),
    });
    assert.equal(login.status, 401);
    const loginBody = JSON.stringify(await login.json());
    assert.equal(loginBody.includes("AUTHENTICATION_FAILED"), true);
    assert.equal(loginBody.includes("missing.user"), false);
    assert.equal(loginBody.includes("wrong-password"), false);

    const wrongRole = await send(server, "/api/errors/validation", loaderCookie, {});
    assert.equal(wrongRole.status, 403);
    assert.equal(((await wrongRole.json()) as { error: { code: string } }).error.code, "FORBIDDEN");

    const validation = await send(server, "/api/errors/validation", cookie, { status: "DELIVERED" });
    assert.equal(validation.status, 400);
    assert.deepEqual(await validation.json(), {
      error: { code: "VALIDATION_FAILED", message: "Request validation failed.", details: { fields: {} } },
    });
    const transition = await send(server, "/api/errors/transition", cookie, {});
    assert.equal(transition.status, 409);
    assert.equal(((await transition.json()) as { error: { code: string } }).error.code, "INVALID_STATE_TRANSITION");
    const rule = await send(server, "/api/errors/rule", cookie, {});
    assert.equal(rule.status, 409);
    assert.equal(((await rule.json()) as { error: { code: string } }).error.code, "DOMAIN_RULE_VIOLATION");
    const raced = await send(server, "/api/errors/concurrency", cookie, {});
    assert.equal(raced.status, 409);
    assert.deepEqual(await raced.json(), {
      error: {
        code: "CONCURRENT_MODIFICATION",
        message: "The record changed before the request completed.",
        details: {},
      },
    });
    const missing = await fetch(url(server, "/api/errors/missing"), { headers: { cookie } });
    assert.equal(missing.status, 404);
    const missingBody = JSON.stringify(await missing.json());
    assert.equal(missingBody.includes("RESOURCE_NOT_FOUND"), true);
    assert.equal(missingBody.includes("outlet"), false);

    const boom = await fetch(url(server, "/api/errors/boom"), { headers: { cookie } });
    assert.equal(boom.status, 500);
    const boomBody = JSON.stringify(await boom.json());
    assert.equal(boomBody.includes("INTERNAL_SERVER_ERROR"), true);
    assert.equal(boomBody.includes("An unexpected error occurred."), true);
    assert.equal(boomBody.includes("SELECT"), false);
    assert.equal(boomBody.includes("password"), false);
    assert.equal(boomBody.includes("secret"), false);
    assert.equal(boomBody.includes("stack"), false);
  } finally {
    await close(server);
  }
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

function memorySessions(): SessionStore {
  const rows: SessionRecord[] = [];
  return {
    async create(record) { rows.push({ ...record }); },
    async findByTokenHash(sessionTokenHash) { return rows.find((row) => row.sessionTokenHash === sessionTokenHash) ?? null; },
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

async function cookieFor(record: AuthUserRecord, sessions: SessionStore): Promise<string> {
  const created = await createAuthenticatedSession({ userId: record.id, now, store: sessions, nodeEnv: "test" });
  return created.cookie.split(";")[0] ?? "";
}

async function send(server: Server, path: string, cookie: string, body: unknown): Promise<Response> {
  return fetch(url(server, path), {
    method: "POST",
    headers: {
      cookie,
      "content-type": "application/json",
      "x-wayloom-csrf": createCsrfToken(cookie.split("=")[1] ?? ""),
    },
    body: JSON.stringify(body),
  });
}

function silentLog(): Logger {
  return { error() {}, info() {} };
}

async function listen(handler: ReturnType<typeof createApp>): Promise<Server> {
  const server = createServer(handler);
  await new Promise<void>((resolveListen) => { server.listen(0, "127.0.0.1", () => resolveListen()); });
  return server;
}

function url(server: Server, path: string): string {
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(address.port)}${path}`;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => { if (error) rejectClose(error); else resolveClose(); });
  });
}
