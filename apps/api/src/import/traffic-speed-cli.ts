import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getPrismaClient } from "../db.js";
import { assertImportDatabaseTarget } from "./database-target.js";
import { formatImportSummary } from "./identity.js";
import { formatImportIssue } from "./issues.js";
import {
  importValidatedTrafficSpeed,
  parseTrafficSpeedSourceId,
  readOptionalSourceText,
  TRAFFIC_SPEED_DATASET,
  TRAFFIC_SPEED_FILE,
  validateTrafficSpeedCsv,
} from "./traffic-speed.js";

const repoRoot = path.resolve(import.meta.dirname, "../../../..");
loadRepositoryEnv(path.join(repoRoot, ".env"));

let targetDatabase: string;
try {
  targetDatabase = assertImportDatabaseTarget(
    process.env.DATABASE_URL,
    process.env.NODE_ENV,
  ).database;
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Traffic-speed import target was refused.";
  console.log(message);
  process.exit(1);
}

const sourcePath = path.join(repoRoot, "data", "competition-import", TRAFFIC_SPEED_FILE);
const source = readOptionalSourceText(sourcePath);
if (source.absent) {
  console.log(`database=${targetDatabase}`);
  console.log(`dataset=${TRAFFIC_SPEED_DATASET}`);
  console.log(`file=${TRAFFIC_SPEED_FILE}`);
  console.log("skipped=absent");
  console.log("inserted=0");
  process.exit(0);
}

const validated = validateTrafficSpeedCsv(source.text);
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
  const summary = await prisma.$transaction(
    async (transaction) =>
      importValidatedTrafficSpeed({
        rows: validated.rows,
        loadExisting: async (sourceId) => {
          const identity = parseTrafficSpeedSourceId(sourceId);
          const existing = await transaction.trafficSpeedSource.findUnique({
            where: {
              district_hour_monsoon: {
                district: identity.district,
                hour: identity.hour,
                monsoon: identity.monsoon,
              },
            },
          });
          if (!existing) {
            return null;
          }
          return {
            district: existing.district,
            hour: existing.hour,
            monsoon: existing.monsoon,
            speed_index: existing.speedIndex,
          };
        },
        write: async (row) => {
          await transaction.trafficSpeedSource.create({
            data: {
              district: row.district,
              hour: row.hour,
              monsoon: row.monsoon,
              speedIndex: row.speedIndex,
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
  console.log("Traffic-speed import failed before completion. No partial import was committed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  (globalThis as { wayloomPrisma?: unknown }).wayloomPrisma = undefined;
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
