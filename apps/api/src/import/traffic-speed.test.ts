import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { rejectNonHackathonDataset } from "./datasets.js";
import {
  importValidatedTrafficSpeed,
  readOptionalSourceText,
  validateTrafficSpeedCsv,
} from "./traffic-speed.js";

const header = "district,hour,monsoon,speed_index";

function suppliedDataRowCount(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.length > 0).length - 1;
}

test("the supplied traffic-speed file preserves source tokens", async () => {
  const text = await readFile(
    path.resolve(import.meta.dirname, "../../../../data/competition-import/traffic_speed.csv"),
    "utf8",
  );
  const validated = validateTrafficSpeedCsv(text);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows.length, suppliedDataRowCount(text));
  assert.equal(validated.rows[0]?.district, "Colombo");
  assert.equal(validated.rows[0]?.hour, "0");
  assert.equal(validated.rows[0]?.monsoon, "0");
  assert.equal(validated.rows[0]?.speedIndex, "94");
  assert.equal(new Set(validated.rows.map((row) => row.sourceId)).size, validated.rows.length);
  assert.ok(rejectNonHackathonDataset("traffic_speed.csv"));
});

test("an absent traffic-speed file is reported as absent", () => {
  const missing = readOptionalSourceText(
    path.resolve(import.meta.dirname, "../../../../data/competition-import/traffic_speed_missing.csv"),
  );
  assert.equal(missing.absent, true);
});

test("invalid traffic-speed values fail without a write", async () => {
  const missingDistrict = validateTrafficSpeedCsv(`${header}\n,0,0,94\n`);
  assert.equal(missingDistrict.rows.length, 0);
  assert.equal(missingDistrict.errors[0]?.field, "district");
  const missingHeader = validateTrafficSpeedCsv("district,hour,monsoon\nColombo,0,0\n");
  assert.equal(missingHeader.rows.length, 0);
  assert.ok(missingHeader.errors.length > 0);
  const writes: string[] = [];
  const summary = await importValidatedTrafficSpeed({
    rows: missingDistrict.rows,
    loadExisting: async () => null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(summary.inserted, 0);
  assert.equal(writes.length, 0);
});

test("a traffic-speed token outside an application enum is preserved", () => {
  const validated = validateTrafficSpeedCsv(`${header}\nMarket,0,0,94\n`);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows[0]?.district, "Market");
  assert.equal(validated.rows[0]?.hour, "0");
  assert.equal(validated.rows[0]?.speedIndex, "94");
});

test("a duplicate district hour and monsoon rejects the file and a rerun does not insert again", async () => {
  const duplicated = validateTrafficSpeedCsv(
    `${header}\nColombo,0,0,94\nColombo,0,0,80\n`,
  );
  assert.equal(duplicated.rows.length, 0);
  assert.match(duplicated.errors[0]?.message ?? "", /Duplicate source identity/);

  const valid = validateTrafficSpeedCsv(`${header}\nColombo,0,0,94\n`);
  const existing = new Map<string, Record<string, string>>();
  const writes: string[] = [];
  const first = await importValidatedTrafficSpeed({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
      existing.set(row.sourceId, row.values);
    },
  });
  const second = await importValidatedTrafficSpeed({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(first.inserted, 1);
  assert.equal(second.inserted, 0);
  assert.equal(second.unchanged, 1);
  assert.equal(writes.length, 1);
});

test("a conflicting traffic-speed row is not overwritten", async () => {
  const valid = validateTrafficSpeedCsv(`${header}\nColombo,0,0,94\n`);
  const existing = new Map<string, Record<string, string>>([
    [
      valid.rows[0].sourceId,
      {
        ...valid.rows[0].values,
        speed_index: "99",
      },
    ],
  ]);
  const writes: string[] = [];
  const summary = await importValidatedTrafficSpeed({
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
