import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { importValidatedCalendar, validateCalendarCsv } from "./calendar.js";

const header =
  "date,dow,dow_name,is_weekend,iso_year,iso_week,is_payday,festival,festival_ramp,is_holiday,monsoon,is_operating";

test("the supplied calendar file matches the approved columns", async () => {
  const text = await readFile(
    path.resolve(import.meta.dirname, "../../../../data/competition-import/calendar.csv"),
    "utf8",
  );
  const validated = validateCalendarCsv(text);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows.length, 910);
  assert.equal(validated.rows[0]?.sourceId, "2024-01-01");
  assert.equal(validated.rows[0]?.dowName, "Mon");
  assert.equal(validated.rows[0]?.isOperating, 1);
  assert.equal(validated.rows[0]?.festival, "");
  assert.equal(validated.rows[0]?.festivalRamp, "0.0");
  const pongal = validated.rows.find((row) => row.sourceId === "2024-01-15");
  assert.equal(pongal?.festival, "thai_pongal");
  assert.equal(pongal?.festivalRamp, "1.0");
  assert.equal(pongal?.isHoliday, 1);
  const last = validated.rows[validated.rows.length - 1];
  assert.equal(last?.sourceId, "2026-06-28");
  assert.equal(last?.dowName, "Sun");
  assert.equal(last?.isWeekend, 1);
  assert.equal(last?.isOperating, 0);
  assert.equal(new Set(validated.rows.map((row) => row.sourceId)).size, 910);
});

test("invalid calendar values fail without a write", async () => {
  const invalidDate = validateCalendarCsv(`${header}\n2024-02-31,6,Sun,1,2024,9,0,,0.0,0,0,0\n`);
  assert.equal(invalidDate.errors[0]?.field, "date");
  const invalidFlag = validateCalendarCsv(
    `${header}\n2024-01-07,6,Sun,1,2024,1,0,,0.0,0,0,2\n`,
  );
  assert.equal(invalidFlag.errors[0]?.field, "is_operating");
  const invalidFestival = validateCalendarCsv(
    `${header}\n2024-01-15,0,Mon,0,2024,3,0,unknown,1.0,1,0,1\n`,
  );
  assert.equal(invalidFestival.errors[0]?.field, "festival");
  const writes: string[] = [];
  const summary = await importValidatedCalendar({
    rows: invalidDate.rows,
    loadExisting: async () => null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(summary.inserted, 0);
  assert.equal(writes.length, 0);
});

test("a duplicate source date rejects the file and a rerun does not insert again", async () => {
  const duplicated = validateCalendarCsv(
    `${header}\n2024-01-01,0,Mon,0,2024,1,0,,0.0,0,0,1\n2024-01-01,0,Mon,0,2024,1,0,,0.0,0,0,1\n`,
  );
  assert.equal(duplicated.rows.length, 0);
  assert.equal(duplicated.errors[0]?.sourceId, "2024-01-01");

  const valid = validateCalendarCsv(
    `${header}\n2024-01-01,0,Mon,0,2024,1,0,,0.0,0,0,1\n`,
  );
  const existing = new Map<string, Record<string, string>>();
  const writes: string[] = [];
  const first = await importValidatedCalendar({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
      existing.set(row.sourceId, row.values);
    },
  });
  const second = await importValidatedCalendar({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(first.inserted, 1);
  assert.equal(second.inserted, 0);
  assert.equal(second.unchanged, 1);
  assert.deepEqual(writes, ["2024-01-01"]);
});

test("a conflicting calendar row is not overwritten", async () => {
  const valid = validateCalendarCsv(
    `${header}\n2024-01-01,0,Mon,0,2024,1,0,,0.0,0,0,1\n`,
  );
  const existing = new Map<string, Record<string, string>>([
    [
      "2024-01-01",
      {
        ...valid.rows[0].values,
        is_operating: "0",
      },
    ],
  ]);
  const writes: string[] = [];
  const summary = await importValidatedCalendar({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(summary.inserted, 0);
  assert.equal(summary.conflicts.length, 1);
  assert.equal(writes.length, 0);
});
