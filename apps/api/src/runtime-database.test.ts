import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { Logger } from "./log.js";
import { redactSecrets } from "./log.js";
import type { UserDirectory } from "./security/auth.js";
import type { SessionStore } from "./security/session.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");
const secretUrl = "postgresql://wayloom_app:real-secret@db.internal:5432/wayloom_production";

test("runtime configuration separates environments and hides secrets", async () => {
  const production = loadConfig({
    NODE_ENV: "production",
    API_HOST: "0.0.0.0",
    API_PORT: "4000",
    LOGIN_RATE_LIMIT_MAX: "20",
    LOGIN_RATE_LIMIT_WINDOW_SECONDS: "900",
    DATABASE_URL: secretUrl,
  });
  assert.equal(JSON.stringify(production).includes("real-secret"), false);
  assert.throws(() => loadConfig({ NODE_ENV: "production", API_HOST: "0.0.0.0", API_PORT: "4000", LOGIN_RATE_LIMIT_MAX: "20", LOGIN_RATE_LIMIT_WINDOW_SECONDS: "900" }), /DATABASE_URL is required/);
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "production",
        API_HOST: "0.0.0.0",
        API_PORT: "4000",
        LOGIN_RATE_LIMIT_MAX: "20",
        LOGIN_RATE_LIMIT_WINDOW_SECONDS: "900",
        DATABASE_URL: "postgresql://wayloom_app:PASSWORD@127.0.0.1:5432/wayloom_development",
      }),
    /placeholder password/,
  );
  assert.throws(
    () => loadConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://wayloom_app:PASSWORD@127.0.0.1:5432/wayloom_development" }),
    /wayloom_test/,
  );
  loadConfig({ NODE_ENV: "test", DATABASE_URL: "postgresql://wayloom_app:PASSWORD@127.0.0.1:5432/wayloom_test" });
  loadConfig({ NODE_ENV: "development", DATABASE_URL: "postgresql://wayloom_app:PASSWORD@postgres:5432/wayloom_development" });
  const redacted = redactSecrets(`connection ${secretUrl}`);
  assert.equal(redacted.includes("real-secret"), false);
  assert.match(redacted, /postgresql:\/\/\[redacted\]/);

  const example = readFileSync(resolve(repoRoot, ".env.example"), "utf8");
  assert.equal(example.includes("SESSION_SECRET"), false);
  assert.equal(example.includes("NEXT_PUBLIC_"), false);
  assert.equal(example.includes("PASSWORD"), true);
  assert.equal(example.includes("real-secret"), false);
  const webSource = readFileSync(resolve(repoRoot, "apps/web/lib/api-client.ts"), "utf8");
  const csrfSource = readFileSync(resolve(repoRoot, "apps/api/src/security/csrf.ts"), "utf8");
  const sessionSource = readFileSync(resolve(repoRoot, "apps/api/src/security/session.ts"), "utf8");
  assert.equal(webSource.includes("DATABASE_URL"), false);
  assert.equal(webSource.includes("NEXT_PUBLIC_"), false);
  assert.equal(csrfSource.includes("process.env"), false);
  assert.equal(sessionSource.includes("SESSION_SECRET"), false);

  const server = await listen(
    createApp({
      nodeEnv: "test",
      log: silentLog(),
      users: emptyUsers(),
      sessions: emptySessions(),
    }),
  );
  try {
    const health = await fetch(url(server, "/health"));
    const body = await health.text();
    assert.equal(health.status, 200);
    assert.equal(body.includes("postgres"), false);
    assert.equal(body.includes("DATABASE_URL"), false);
    assert.deepEqual(JSON.parse(body), { status: "ok" });
  } finally {
    await close(server);
  }
});

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
