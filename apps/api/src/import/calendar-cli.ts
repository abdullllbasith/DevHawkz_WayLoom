import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { getPrismaClient } from "../db.js";
import { formatSourceDate, importValidatedCalendar, validateCalendarCsv } from "./calendar.js";
import { assertImportDatabaseTarget } from "./database-target.js";
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
  const message = error instanceof Error ? error.message : "Calendar import target was refused.";
  console.log(message);
  process.exit(1);
}

const sourcePath = path.join(repoRoot, "data", "competition-import", "calendar.csv");
const text = await readFile(sourcePath, "utf8");
const validated = validateCalendarCsv(text);
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
    importValidatedCalendar({
      rows: validated.rows,
      loadExisting: async (sourceId) => {
        const existing = await transaction.calendarSource.findUnique({
          where: { date: sourceDate(sourceId) },
        });
        if (!existing) {
          return null;
        }
        return {
          date: formatSourceDate(existing.date),
          dow: String(existing.dow),
          dow_name: existing.dowName,
          is_weekend: String(existing.isWeekend),
          iso_year: String(existing.isoYear),
          iso_week: String(existing.isoWeek),
          is_payday: String(existing.isPayday),
          festival: existing.festival,
          festival_ramp: existing.festivalRamp,
          is_holiday: String(existing.isHoliday),
          monsoon: String(existing.monsoon),
          is_operating: String(existing.isOperating),
        };
      },
      write: async (row) => {
        await transaction.calendarSource.create({
          data: {
            date: row.sourceDate,
            dow: row.dow,
            dowName: row.dowName,
            isWeekend: row.isWeekend,
            isoYear: row.isoYear,
            isoWeek: row.isoWeek,
            isPayday: row.isPayday,
            festival: row.festival,
            festivalRamp: row.festivalRamp,
            isHoliday: row.isHoliday,
            monsoon: row.monsoon,
            isOperating: row.isOperating,
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
  console.log("Calendar import failed before completion. No partial import was committed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  (globalThis as { wayloomPrisma?: unknown }).wayloomPrisma = undefined;
}

function sourceDate(iso: string): Date {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day));
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
