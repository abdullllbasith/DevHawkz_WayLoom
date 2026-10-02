import assert from "node:assert/strict";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../app.js";
import { sendJson } from "../errors.js";
import type { Logger } from "../log.js";
import type { AuthUserRecord, UserDirectory } from "./auth.js";
import { requireRole, type OperationalRoleName } from "./rbac.js";
import {
  createAuthenticatedSession,
  type SessionRecord,
  type SessionStore,
} from "./session.js";

const now = new Date("2026-06-01T08:00:00.000Z");

const users: AuthUserRecord[] = [
  user("11111111-1111-4111-8111-111111111111", "seed.dispatcher", "DISPATCHER"),
  user("22222222-2222-4222-8222-222222222222", "seed.loader", "LOADER"),
  user("33333333-3333-4333-8333-333333333333", "seed.driver", "DRIVER"),
  user("44444444-4444-4444-8444-444444444444", "seed.store-manager", "STORE_MANAGER"),
];

const probes: Record<string, readonly OperationalRoleName[]> = {
  "/probe/dispatcher": ["DISPATCHER"],
  "/probe/loader": ["LOADER"],
  "/probe/driver": ["DRIVER"],
  "/probe/store-manager": ["STORE_MANAGER"],
};

test("each approved role can access only its protected operation", async () => {
  const sessions = memoryStore();
  const directory = userDirectory(users);
  const server = await listen((request, response) => probe(request, response, directory, sessions));
  try {
    const cookies = {
      DISPATCHER: await cookieFor(users[0]!, sessions),
      LOADER: await cookieFor(users[1]!, sessions),
      DRIVER: await cookieFor(users[2]!, sessions),
      STORE_MANAGER: await cookieFor(users[3]!, sessions),
    };
    for (const role of ["DISPATCHER", "LOADER", "DRIVER", "STORE_MANAGER"] as const) {
      const response = await fetch(url(server, `/probe/${probePath(role)}?role=DISPATCHER`), {
        headers: { cookie: cookies[role], "x-role": "DISPATCHER" },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { role, ran: true });
    }
    const denied = await fetch(url(server, "/probe/dispatcher?role=DISPATCHER"), {
      headers: { cookie: cookies.LOADER, "x-role": "DISPATCHER" },
    });
    const deniedBody = await denied.text();
    assert.equal(denied.status, 403);
    assert.deepEqual(JSON.parse(deniedBody), { error: { code: "forbidden", message: "Forbidden." } });
    assert.equal(deniedBody.includes("DISPATCHER"), false);
    assert.equal(users[1]?.role, "LOADER");
    const missing = await fetch(url(server, "/probe/driver"));
    assert.equal(missing.status, 401);
    assert.deepEqual(await missing.json(), {
      error: { code: "authentication_required", message: "Authentication required." },
    });
  } finally {
    await close(server);
  }
});

test("authorization runs before the protected operation and logout stays open", async () => {
  const sessions = memoryStore();
  const directory = userDirectory(users);
  let ran = false;
  const server = await listen(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname !== "/probe/dispatcher") {
      response.statusCode = 404;
      response.end();
      return;
    }
    const actor = await requireRole(response, {
      cookieHeader: request.headers.cookie,
      users: directory,
      sessions,
      now,
      allowedRoles: ["DISPATCHER"],
    });
    if (actor === null) {
      return;
    }
    ran = true;
    sendJson(response, 200, { role: actor.role });
  });
  const appServer = await listen(
    createApp({
      nodeEnv: "test",
      log: silentLog(),
      users: directory,
      sessions,
      now: () => now,
    }),
  );
  try {
    const loaderCookie = await cookieFor(users[1]!, sessions);
    ran = false;
    const denied = await fetch(url(server, "/probe/dispatcher?role=DISPATCHER"), {
      headers: { cookie: loaderCookie },
    });
    assert.equal(denied.status, 403);
    assert.equal(ran, false);
    assert.equal(users[1]?.role, "LOADER");
    const logout = await fetch(url(appServer, "/api/auth/logout"), {
      method: "POST",
      headers: { cookie: loaderCookie },
    });
    assert.equal(logout.status, 200);
    assert.deepEqual(await logout.json(), { status: "ok" });
  } finally {
    await close(server);
    await close(appServer);
  }
});

function probe(
  request: IncomingMessage,
  response: ServerResponse,
  directory: UserDirectory,
  sessions: SessionStore,
): Promise<void> {
  const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const allowedRoles = probes[pathname];
  if (allowedRoles === undefined) {
    response.statusCode = 404;
    response.end();
    return Promise.resolve();
  }
  return requireRole(response, {
    cookieHeader: request.headers.cookie,
    users: directory,
    sessions,
    now,
    allowedRoles,
  }).then((actor) => {
    if (actor === null) {
      return;
    }
    sendJson(response, 200, { role: actor.role, ran: true });
  });
}

function probePath(role: OperationalRoleName): string {
  if (role === "STORE_MANAGER") {
    return "store-manager";
  }
  return role.toLowerCase();
}

function user(id: string, loginIdentifier: string, role: OperationalRoleName): AuthUserRecord {
  return {
    id,
    loginIdentifier,
    displayName: loginIdentifier,
    role,
    active: true,
    passwordHash: "not-used",
  };
}

function userDirectory(records: AuthUserRecord[]): UserDirectory {
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
  return {
    error() {},
    info() {},
  };
}

async function listen(
  handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>,
): Promise<Server> {
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
      if (error) {
        rejectClose(error);
        return;
      }
      resolveClose();
    });
  });
}
