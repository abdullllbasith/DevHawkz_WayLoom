import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

const databases = {
  development: "wayloom_development",
  test: "wayloom_test",
};

const command = process.argv[2];
const target = process.argv[3];

if (process.env.NODE_ENV === "production") {
  console.error("Refusing database command while NODE_ENV is production.");
  process.exit(1);
}

if (target !== "development" && target !== "test") {
  console.error(
    "Refusing database command. Pass development or test as the target.",
  );
  process.exit(1);
}

if (command !== "status" && command !== "check" && command !== "reset-test") {
  console.error(
    "Refusing database command. Allowed commands are status, check, and reset-test.",
  );
  process.exit(1);
}

if (command === "reset-test" && target !== "test") {
  console.error(
    "Refusing reset. reset-test can target only the test database.",
  );
  process.exit(1);
}

loadRepositoryEnv(resolve(apiRoot, "../..", ".env"));

const sourceName =
  target === "development" ? "DATABASE_URL" : "TEST_DATABASE_URL";
const connectionString = process.env[sourceName];
if (!connectionString) {
  console.error(`${sourceName} is required.`);
  process.exit(1);
}

const databaseName = databaseNameFromUrl(connectionString, sourceName);
if (databaseName !== databases[target]) {
  console.error(
    `Refusing ${target} command. ${sourceName} does not point at ${databases[target]}.`,
  );
  process.exit(1);
}

const childEnv = { ...process.env, DATABASE_URL: connectionString };
const args =
  command === "status"
    ? ["migrate", "status"]
    : command === "check"
      ? []
      : ["migrate", "reset", "--force"];

const child =
  command === "check"
    ? spawnSync(
        process.execPath,
        [resolve(apiRoot, "dist/check-prisma-connection.js")],
        {
          cwd: apiRoot,
          env: childEnv,
          stdio: "inherit",
        },
      )
    : spawnSync(process.execPath, [prismaCli, ...args], {
        cwd: apiRoot,
        env: childEnv,
        stdio: "inherit",
      });

process.exit(child.status ?? 1);

function loadRepositoryEnv(path) {
  if (!existsSync(path)) {
    return;
  }
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
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

function databaseNameFromUrl(connectionString, sourceName) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    console.error(`${sourceName} is not a valid database URL.`);
    process.exit(1);
  }
  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    console.error("Refusing database command. The URL is not PostgreSQL.");
    process.exit(1);
  }
  return decodeURIComponent(parsed.pathname.replace(/^\//, ""));
}
