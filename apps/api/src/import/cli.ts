import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getPrismaClient } from "../db.js";
import { runCompetitionImport } from "./run.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
loadRepositoryEnv(path.join(repoRoot, ".env"));

const result = await runCompetitionImport({
  repoRoot,
  env: process.env,
  requestedFile: process.argv[2],
  connect: async (connectionString) => {
    process.env.DATABASE_URL = connectionString;
    const prisma = getPrismaClient();
    try {
      const rows = await prisma.$queryRaw<Array<{ db: string }>>`
        SELECT current_database() AS db
      `;
      const database = rows[0]?.db;
      if (database === undefined) {
        throw new Error("Database connection failed.");
      }
      return { database };
    } finally {
      await prisma.$disconnect();
      globalPrismaCache().wayloomPrisma = undefined;
    }
  },
});

for (const line of result.lines) {
  console.log(line);
}
process.exit(result.exitCode);

function globalPrismaCache(): { wayloomPrisma?: unknown } {
  return globalThis as typeof globalThis & { wayloomPrisma?: unknown };
}

function loadRepositoryEnv(filePath: string): void {
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
