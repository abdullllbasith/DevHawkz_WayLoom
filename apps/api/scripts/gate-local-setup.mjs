import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadRepositoryEnv, resolveLocalDatabaseUrl, runWithLocalDatabase } from "./local-database.mjs";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const prismaCli = require.resolve("prisma/build/index.js");

const target = process.argv[2] ?? "test";
if (target !== "development" && target !== "test") {
  console.error("Usage: node scripts/gate-local-setup.mjs [development|test]");
  process.exit(1);
}

loadRepositoryEnv();
const connectionString = resolveLocalDatabaseUrl(target, process.env);
const childEnv = { ...process.env, DATABASE_URL: connectionString };

function runStep(label, fn) {
  console.log(`\n== ${label} ==`);
  const status = fn();
  if (status !== 0) {
    console.error(`${label} failed.`);
    process.exit(status);
  }
}

runStep("Prisma migrate deploy", () =>
  spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: apiRoot,
    env: childEnv,
    stdio: "inherit",
  }).status ?? 1,
);

const imports = [
  "dist/import/outlets-cli.js",
  "dist/import/vehicles-cli.js",
  "dist/import/calendar-cli.js",
  "dist/import/district-travel-cli.js",
  "dist/import/service-allowance-cli.js",
  "dist/import/traffic-speed-cli.js",
  "dist/import/road-conditions-cli.js",
];

for (const script of imports) {
  runStep(script, () => runWithLocalDatabase(target, [resolve(apiRoot, script)]));
}

runStep("seed:scenario", () => runWithLocalDatabase(target, [resolve(apiRoot, "dist/seed/cli.js")]));

console.log("\nLocal gate setup completed.");
