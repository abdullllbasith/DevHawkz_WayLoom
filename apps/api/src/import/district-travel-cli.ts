import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getPrismaClient } from "../db.js";
import { assertImportDatabaseTarget } from "./database-target.js";
import {
  importValidatedDistrictTravel,
  parseDistrictTravelSourceId,
  validateDistrictTravelCsv,
} from "./district-travel.js";
import { formatImportSummary } from "./identity.js";
import { formatImportIssue } from "./issues.js";

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
    error instanceof Error ? error.message : "District-travel import target was refused.";
  console.log(message);
  process.exit(1);
}

const sourcePath = path.join(repoRoot, "data", "competition-import", "district_travel.csv");
const text = await readFile(sourcePath, "utf8");
const validated = validateDistrictTravelCsv(text);
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
    importValidatedDistrictTravel({
      rows: validated.rows,
      loadExisting: async (sourceId) => {
        const identity = parseDistrictTravelSourceId(sourceId);
        const existing = await transaction.districtTravelSource.findUnique({
          where: {
            depot_district: {
              depot: identity.depot,
              district: identity.district,
            },
          },
        });
        if (!existing) {
          return null;
        }
        return {
          district: existing.district,
          depot: existing.depot,
          road_class: existing.roadClass,
          free_flow_kmh: existing.freeFlowKmh,
          depot_to_district_km: existing.depotToDistrictKm,
          depot_to_district_freeflow_min: existing.depotToDistrictFreeflowMin,
          inter_stop_km: existing.interStopKm,
          inter_stop_freeflow_min: existing.interStopFreeflowMin,
        };
      },
      write: async (row) => {
        await transaction.districtTravelSource.create({
          data: {
            depot: row.depot,
            district: row.district,
            roadClass: row.roadClass,
            freeFlowKmh: row.freeFlowKmh,
            depotToDistrictKm: row.depotToDistrictKm,
            depotToDistrictFreeflowMin: row.depotToDistrictFreeflowMin,
            interStopKm: row.interStopKm,
            interStopFreeflowMin: row.interStopFreeflowMin,
          },
        });
      },
      transaction: async (work) => {
        await work();
      },
    }),
  );
  console.log(`database=${targetDatabase}`);
  console.log(`source_rows=${String(validated.rows.length)}`);
  console.log(formatImportSummary(summary));
  if (summary.conflicts.length > 0 || summary.errors.length > 0) {
    process.exitCode = 1;
  }
} catch {
  console.log("District-travel import failed before completion. No partial import was committed.");
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
