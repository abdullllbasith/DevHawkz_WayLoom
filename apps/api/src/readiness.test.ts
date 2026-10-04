import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "./app.js";
import type { Logger } from "./log.js";
import { probeDatabase, readinessReport } from "./readiness.js";
import type { UserDirectory } from "./security/auth.js";
import type { SessionStore } from "./security/session.js";

test("readiness follows the database and does not include a secret", async () => {
  assert.deepEqual(readinessReport("ok"), { status: "ready", database: "ok" });
  assert.deepEqual(readinessReport("unavailable"), { status: "not_ready", database: "unavailable" });
  assert.equal(await probeDatabase(async () => 1), "ok");
  assert.equal(await probeDatabase(async () => Promise.reject(new Error("postgresql://wayloom_app:real-secret@db/wayloom"))), "unavailable");

  const server = await listen(app(async () => "ok"));
  try {
    const health = await fetch(url(server, "/health"));
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });
    const ready = await fetch(url(server, "/ready"));
    const body = await ready.text();
    assert.equal(ready.status, 200);
    assert.equal(ready.headers.get("cache-control"), "no-store");
    assert.equal(body.includes("real-secret"), false);
    assert.equal(body.includes("postgres"), false);
    assert.deepEqual(JSON.parse(body), { status: "ready", database: "ok" });
    const post = await fetch(url(server, "/ready"), { method: "POST" });
    assert.equal(post.status, 405);
  } finally {
    await close(server);
  }
});

test("a database failure is not reported as ready", async () => {
  const server = await listen(app(async () => "unavailable"));
  try {
    const ready = await fetch(url(server, "/ready"));
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: "not_ready", database: "unavailable" });
    const health = await fetch(url(server, "/health"));
    assert.equal(health.status, 200);
  } finally {
    await close(server);
  }
});

test("readiness without a database probe stays not ready", async () => {
  const server = await listen(
    createApp({
      nodeEnv: "test",
      log: silentLog(),
      users: emptyUsers(),
      sessions: emptySessions(),
    }),
  );
  try {
    const ready = await fetch(url(server, "/ready"));
    assert.equal(ready.status, 503);
    assert.deepEqual(await ready.json(), { status: "not_ready", database: "unavailable" });
  } finally {
    await close(server);
  }
});

function app(readiness: () => Promise<"ok" | "unavailable">) {
  return createApp({
    nodeEnv: "test",
    log: silentLog(),
    users: emptyUsers(),
    sessions: emptySessions(),
    readiness,
  });
}

function emptyUsers(): UserDirectory {
  return {
    async findByLoginIdentifier() {
      return null;
    },
    async findById() {
      return null;
    },
  };
}

function emptySessions(): SessionStore {
  return {
    async create() {},
    async findByTokenHash() {
      return null;
    },
    async revoke() {},
    async touchLastSeen() {},
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
  return `http://127.0.0.1:${address.port}${path}`;
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose) => {
    server.close(() => resolveClose());
  });
}
