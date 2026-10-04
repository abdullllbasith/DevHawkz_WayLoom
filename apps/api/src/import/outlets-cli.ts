import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getPrismaClient } from "../db.js";
import { assertImportDatabaseTarget } from "./database-target.js";
import { formatImportSummary } from "./identity.js";
import { formatImportIssue } from "./issues.js";
import { importValidatedOutlets, validateOutletCsv } from "./outlets.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
loadRepositoryEnv(path.join(repoRoot, ".env"));

let targetDatabase: string;
try {
  targetDatabase = assertImportDatabaseTarget(
    process.env.DATABASE_URL,
    process.env.NODE_ENV,
  ).database;
} catch (error) {
  const message = error instanceof Error ? error.message : "Outlet import target was refused.";
  console.log(message);
  process.exit(1);
}

const sourcePath = path.join(repoRoot, "data", "competition-import", "outlets.csv");
const text = await readFile(sourcePath, "utf8");
const validated = validateOutletCsv(text);
if (validated.errors.length > 0) {
  console.log(`database=${targetDatabase}`);
  console.log("inserted=0");
  for (const error of validated.errors) {
    console.log(formatImportIssue(error));
  }
  process.exit(1);
}

const prisma = getPrismaClient();
try {
  const connected = await prisma.$queryRaw<Array<{ db: string }>>`
    SELECT current_database() AS db
  `;
  if (connected[0]?.db !== targetDatabase) {
    console.log("Database connection failed.");
    process.exit(1);
  }
  const summary = await prisma.$transaction(async (transaction) =>
    importValidatedOutlets({
      rows: validated.rows,
      loadExisting: async (sourceId) => {
        const existing = await transaction.outlet.findUnique({
          where: { outletId: sourceId },
        });
        if (!existing) {
          return null;
        }
        return {
          outlet_id: existing.outletId,
          brand: existing.brand,
          district: existing.district,
          depot: existing.depot,
          dock_type: existing.dockType,
          parking_constraint: existing.parkingConstraint,
          mall_window: existing.mallWindow ?? "",
          window_open_time: formatStoredClock(existing.windowOpenTime),
          window_close_time: formatStoredClock(existing.windowCloseTime),
        };
      },
      write: async (row) => {
        await transaction.outlet.create({
          data: {
            outletId: row.sourceId,
            brand: row.brand,
            district: row.district,
            depot: row.depot,
            dockType: row.dockType,
            parkingConstraint: row.parkingConstraint,
            mallWindow: row.mallWindow,
            windowOpenTime: row.windowOpenTime,
            windowCloseTime: row.windowCloseTime,
          },
        });
      },
      transaction: async (work) => {
        await work();
      },
    }),
    { timeout: 120_000 },
  );
  console.log(`database=${targetDatabase}`);
  console.log(`source_rows=${String(validated.rows.length)}`);
  console.log(formatImportSummary(summary));
  if (summary.conflicts.length > 0 || summary.errors.length > 0) {
    process.exitCode = 1;
  }
} catch {
  console.log("Outlet import failed before completion. No partial import was committed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  (globalThis as { wayloomPrisma?: unknown }).wayloomPrisma = undefined;
}

function formatStoredClock(value: Date | null): string {
  if (value === null) {
    return "";
  }
  const hours = String(value.getUTCHours()).padStart(2, "0");
  const minutes = String(value.getUTCMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
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
