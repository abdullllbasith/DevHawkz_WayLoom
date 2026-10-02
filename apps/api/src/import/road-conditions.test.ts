import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { rejectNonHackathonDataset } from "./datasets.js";
import {
  importValidatedRoadConditions,
  readOptionalSourceText,
  validateRoadConditionsCsv,
} from "./road-conditions.js";

const header = "district,date,disruption_index";

function suppliedDataRowCount(text: string): number {
  return text.split(/\r?\n/).filter((line) => line.length > 0).length - 1;
}

test("the supplied road-conditions file preserves source tokens", async () => {
  const text = await readFile(
    path.resolve(import.meta.dirname, "../../../../data/competition-import/road_conditions.csv"),
    "utf8",
  );
  const validated = validateRoadConditionsCsv(text);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows.length, suppliedDataRowCount(text));
  assert.equal(validated.rows[0]?.district, "Colombo");
  assert.equal(validated.rows[0]?.date, "2024-01-01");
  assert.equal(validated.rows[0]?.disruptionIndex, "100");
  assert.equal(new Set(validated.rows.map((row) => row.sourceId)).size, validated.rows.length);
  assert.ok(rejectNonHackathonDataset("road_conditions.csv"));
});

test("an absent road-conditions file is reported as absent", () => {
  const missing = readOptionalSourceText(
    path.resolve(
      import.meta.dirname,
      "../../../../data/competition-import/road_conditions_missing.csv",
    ),
  );
  assert.equal(missing.absent, true);
});

test("invalid road-conditions values fail without a write", async () => {
  const missingDistrict = validateRoadConditionsCsv(`${header}\n,2024-01-01,100\n`);
  assert.equal(missingDistrict.rows.length, 0);
  assert.equal(missingDistrict.errors[0]?.field, "district");
  const missingHeader = validateRoadConditionsCsv("district,date\nColombo,2024-01-01\n");
  assert.equal(missingHeader.rows.length, 0);
  assert.ok(missingHeader.errors.length > 0);
  const writes: string[] = [];
  const summary = await importValidatedRoadConditions({
    rows: missingDistrict.rows,
    loadExisting: async () => null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(summary.inserted, 0);
  assert.equal(writes.length, 0);
});

test("a road-conditions date token is preserved as text", () => {
  const validated = validateRoadConditionsCsv(`${header}\nMarket,2024-01-01,100\n`);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows[0]?.district, "Market");
  assert.equal(validated.rows[0]?.date, "2024-01-01");
  assert.equal(validated.rows[0]?.disruptionIndex, "100");
});

test("a duplicate district and date rejects the file and a rerun does not insert again", async () => {
  const duplicated = validateRoadConditionsCsv(
    `${header}\nColombo,2024-01-01,100\nColombo,2024-01-01,80\n`,
  );
  assert.equal(duplicated.rows.length, 0);
  assert.match(duplicated.errors[0]?.message ?? "", /Duplicate source identity/);

  const valid = validateRoadConditionsCsv(`${header}\nColombo,2024-01-01,100\n`);
  const existing = new Map<string, Record<string, string>>();
  const writes: string[] = [];
  const first = await importValidatedRoadConditions({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
      existing.set(row.sourceId, row.values);
    },
  });
  const second = await importValidatedRoadConditions({
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

test("a conflicting road-conditions row is not overwritten", async () => {
  const valid = validateRoadConditionsCsv(`${header}\nColombo,2024-01-01,100\n`);
  const existing = new Map<string, Record<string, string>>([
    [
      valid.rows[0].sourceId,
      {
        ...valid.rows[0].values,
        disruption_index: "99",
      },
    ],
  ]);
  const writes: string[] = [];
  const summary = await importValidatedRoadConditions({
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
