import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app.js";
import { sendJson } from "../errors.js";
import type { Logger } from "../log.js";
import type { AuthUserRecord, UserDirectory } from "./auth.js";
import {
  defineBusinessRoute,
  isPublicRoute,
  isSessionRoute,
  publicRoutes,
  securityPipeline,
  sessionRoutes,
  type BusinessRoute,
  type RequestSecurityContext,
} from "./api-boundary.js";
import { authorizeStoreManagerOutlet } from "./object-authorization.js";
import { createAuthenticatedSession, type SessionRecord, type SessionStore } from "./session.js";

const now = new Date("2026-06-01T08:00:00.000Z");
const outletA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const outletB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const dispatcher = user("11111111-1111-4111-8111-111111111111", "seed.dispatcher", "DISPATCHER");
const loader = user("22222222-2222-4222-8222-222222222222", "seed.loader", "LOADER");
const storeManager = user("44444444-4444-4444-8444-444444444444", "seed.store-manager", "STORE_MANAGER");

test("public and session routes stay explicit", () => {
  assert.deepEqual(publicRoutes.map((route) => `${route.method} ${route.path}`), [
    "GET /health",
    "POST /api/auth/login",
  ]);
  assert.deepEqual(sessionRoutes.map((route) => `${route.method} ${route.path}`), [
    "GET /api/auth/me",
    "POST /api/auth/logout",
  ]);
  assert.equal(isPublicRoute("GET", "/health"), true);
  assert.equal(isSessionRoute("POST", "/api/auth/logout"), true);
  assert.equal(isPublicRoute("POST", "/api/auth/logout"), false);
  assert.deepEqual(securityPipeline, ["authenticate", "authorizeRole", "authorizeObject", "business"]);
  assert.throws(() =>
    defineBusinessRoute({
      method: "GET",
      path: "/health",
      allowedRoles: ["DISPATCHER"],
      handle() {},
    }),
  );
});

test("a business route authenticates, checks role and object, then runs", async () => {
  const sessions = memoryStore();
  const steps: string[] = [];
  let handled = false;
  let targetOutlet = outletB;
  const route: BusinessRoute = defineBusinessRoute({
    method: "POST",
    path: "/api/orders/scope",
    allowedRoles: ["STORE_MANAGER"],
    authorizeObject(context: RequestSecurityContext) {
      steps.push("object");
      return authorizeStoreManagerOutlet({
        role: context.role,
        assignedOutletIds: context.assignedOutletIds,
        outletId: targetOutlet,
        action: "mutate",
      });
    },
    handle(context, response) {
      steps.push("business");
      handled = context.userId === storeManager.id && context.role === "STORE_MANAGER";
      sendJson(response, 200, { ok: true });
    },
  });
  const server = await listen(
    createApp({
      nodeEnv: "test",
      log: silentLog(),
      users: directory([dispatcher, loader, storeManager]),
      sessions,
      now: () => now,
      assignedOutletIds: async (userId) => (userId === storeManager.id ? [outletA] : []),
      businessRoutes: [route],
    }),
  );
  try {
    const health = await fetch(url(server, "/health"));
    assert.equal(health.status, 200);
    const login = await fetch(url(server, "/api/auth/login"), { method: "POST" });
    assert.equal(login.status, 400);
    const me = await fetch(url(server, "/api/auth/me"));
    assert.equal(me.status, 401);
    const missing = await fetch(url(server, "/api/orders/scope"), {
      method: "POST",
      headers: { "x-role": "STORE_MANAGER", "x-user-id": storeManager.id },
      body: JSON.stringify({ role: "STORE_MANAGER", outletId: outletB }),
    });
    assert.equal(missing.status, 401);
    assert.equal(handled, false);
    const loaderCookie = await cookieFor(loader, sessions);
    const wrongRole = await fetch(url(server, "/api/orders/scope?outletId=" + outletA), {
      method: "POST",
      headers: { cookie: loaderCookie, "x-role": "STORE_MANAGER" },
    });
    assert.equal(wrongRole.status, 403);
    assert.equal(handled, false);
    const managerCookie = await cookieFor(storeManager, sessions);
    const outside = await fetch(url(server, "/api/orders/scope?outletId=" + outletA), {
      method: "POST",
      headers: { cookie: managerCookie, "x-outlet-id": outletA },
    });
    assert.equal(outside.status, 404);
    assert.equal(handled, false);
    targetOutlet = outletA;
    steps.length = 0;
    const allowed = await fetch(url(server, "/api/orders/scope?outletId=" + outletB), {
      method: "POST",
      headers: { cookie: managerCookie, "x-role": "DISPATCHER" },
    });
    assert.equal(allowed.status, 200);
    assert.equal(handled, true);
    assert.deepEqual(steps, ["object", "business"]);
    const logout = await fetch(url(server, "/api/auth/logout"), {
      method: "POST",
      headers: { cookie: loaderCookie },
    });
    assert.equal(logout.status, 200);
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

async function cookieFor(record: AuthUserRecord, sessions: SessionStore): Promise<string> {
  const created = await createAuthenticatedSession({
    userId: record.id,
    now,
    store: sessions,
    nodeEnv: "test",
  });
  return created.cookie.split(";")[0] ?? "";
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
