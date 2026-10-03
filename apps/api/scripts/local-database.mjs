import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(apiRoot, "../..");

const databases = {
  development: "wayloom_development",
  test: "wayloom_test",
};

/**
 * Resolve a local DATABASE_URL for seed/import/migrate without changing the guard rules.
 * Uses TEST_DATABASE_URL or DATABASE_URL from the repository .env when they point at
 * 127.0.0.1 and the requested local database name.
 */
export function resolveLocalDatabaseUrl(target, env = process.env) {
  if (env.NODE_ENV === "production") {
    throw new Error("Refusing local database command while NODE_ENV is production.");
  }
  if (target !== "development" && target !== "test") {
    throw new Error("Pass development or test as the database target.");
  }
  const expected = databases[target];
  const candidates =
    target === "test"
      ? [env.TEST_DATABASE_URL, env.DATABASE_URL]
      : [env.DATABASE_URL, env.TEST_DATABASE_URL];
  for (const connectionString of candidates) {
    if (connectionString === undefined || connectionString.trim() === "") {
      continue;
    }
    const parsed = parsePostgresUrl(connectionString);
    if (parsed === null) {
      continue;
    }
    if (parsed.hostname !== "127.0.0.1" || parsed.database !== expected) {
      continue;
    }
    return connectionString;
  }
  throw new Error(
    `No local ${expected} URL found. Set ${target === "test" ? "TEST_DATABASE_URL" : "DATABASE_URL"} to postgresql://wayloom_app:PASSWORD@127.0.0.1:5432/${expected}.`,
  );
}

export function loadRepositoryEnv() {
  const filePath = resolve(repoRoot, ".env");
  if (!existsSync(filePath)) {
    return;
  }
  for (const rawLine of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#") || !line.includes("=")) {
      continue;
    }
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (key.length > 0 && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function runWithLocalDatabase(target, args, options = {}) {
  loadRepositoryEnv();
  const connectionString = resolveLocalDatabaseUrl(target, process.env);
  const childEnv = { ...process.env, DATABASE_URL: connectionString };
  const child = spawnSync(process.execPath, args, {
    cwd: options.cwd ?? apiRoot,
    env: childEnv,
    stdio: "inherit",
    ...options,
  });
  return child.status ?? 1;
}

function parsePostgresUrl(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    return null;
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    return null;
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  return { hostname: parsed.hostname, database };
}

const isMain =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const target = process.argv[2];
  const script = process.argv[3];
  if (target === undefined || script === undefined) {
    console.error("Usage: node scripts/local-database.mjs <development|test> <path-to-script.js> [args...]");
    process.exit(1);
  }
  loadRepositoryEnv();
  const connectionString = resolveLocalDatabaseUrl(target, process.env);
  console.log(`database=${databaseNameFromUrl(connectionString)}`);
  const status = runWithLocalDatabase(target, process.argv.slice(3), { cwd: apiRoot });
  process.exit(status);
}

function databaseNameFromUrl(connectionString) {
  const parsed = parsePostgresUrl(connectionString);
  return parsed?.database ?? "unknown";
}
