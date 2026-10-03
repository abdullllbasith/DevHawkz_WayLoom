import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadRepositoryEnv, resolveLocalDatabaseUrl } from "./local-database.mjs";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2] ?? "test";
if (target !== "test" && target !== "development") {
  console.error("Usage: node scripts/gate-start-api-local.mjs [test|development]");
  process.exit(1);
}

loadRepositoryEnv();
const connectionString = resolveLocalDatabaseUrl(target, process.env);
const nodeEnv = target === "test" ? "test" : "development";

console.log(`Starting API with NODE_ENV=${nodeEnv} database=${new URL(connectionString).pathname.slice(1)}`);

const child = spawn(
  process.execPath,
  ["--env-file-if-exists=../../.env", "dist/server.js"],
  {
    cwd: apiRoot,
    env: {
      ...process.env,
      NODE_ENV: nodeEnv,
      DATABASE_URL: connectionString,
    },
    stdio: "inherit",
  },
);

child.on("exit", (code) => process.exit(code ?? 1));
