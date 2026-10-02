import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getPrismaClient } from "../db.js";
import { assertImportDatabaseTarget } from "./database-target.js";
import { formatImportSummary } from "./identity.js";
import { formatImportIssue } from "./issues.js";
import {
  importValidatedRoadConditions,
  parseRoadConditionsSourceId,
  readOptionalSourceText,
  ROAD_CONDITIONS_DATASET,
  ROAD_CONDITIONS_FILE,
  validateRoadConditionsCsv,
} from "./road-conditions.js";

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
    error instanceof Error ? error.message : "Road-conditions import target was refused.";
  console.log(message);
  process.exit(1);
}

const sourcePath = path.join(repoRoot, "data", "competition-import", ROAD_CONDITIONS_FILE);
const source = readOptionalSourceText(sourcePath);
if (source.absent) {
  console.log(`database=${targetDatabase}`);
  console.log(`dataset=${ROAD_CONDITIONS_DATASET}`);
  console.log(`file=${ROAD_CONDITIONS_FILE}`);
  console.log("skipped=absent");
  console.log("inserted=0");
  process.exit(0);
}

const validated = validateRoadConditionsCsv(source.text);
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
      importValidatedRoadConditions({
        rows: validated.rows,
        loadExisting: async (sourceId) => {
          const identity = parseRoadConditionsSourceId(sourceId);
          const existing = await transaction.roadConditionsSource.findUnique({
            where: {
              district_date: {
                district: identity.district,
                date: identity.date,
              },
            },
          });
          if (!existing) {
            return null;
          }
          return {
            district: existing.district,
            date: existing.date,
            disruption_index: existing.disruptionIndex,
          };
        },
        write: async (row) => {
          await transaction.roadConditionsSource.create({
            data: {
              district: row.district,
              date: row.date,
              disruptionIndex: row.disruptionIndex,
            },
          });
        },
        transaction: async (work) => {
          await work();
        },
      }),
    { timeout: 600_000 },
  );
  console.log(`database=${targetDatabase}`);
  console.log(`source_rows=${String(validated.rows.length)}`);
  console.log(formatImportSummary(summary));
  if (summary.conflicts.length > 0 || summary.errors.length > 0) {
    process.exitCode = 1;
  }
} catch {
  console.log("Road-conditions import failed before completion. No partial import was committed.");
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
