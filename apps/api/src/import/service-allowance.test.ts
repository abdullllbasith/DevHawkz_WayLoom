import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  importValidatedServiceAllowance,
  validateServiceAllowanceCsv,
} from "./service-allowance.js";

const header = "brand,dock_type,service_allowance_min";

test("the supplied service-allowance file preserves source tokens", async () => {
  const text = await readFile(
    path.resolve(import.meta.dirname, "../../../../data/competition-import/service_allowance.csv"),
    "utf8",
  );
  const validated = validateServiceAllowanceCsv(text);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows.length, 9);
  assert.equal(validated.rows[0]?.brand, "Fresh");
  assert.equal(validated.rows[0]?.dockType, "rear_dock");
  assert.equal(validated.rows[0]?.serviceAllowanceMin, "15");
  const techMall = validated.rows.find(
    (row) => row.brand === "Tech" && row.dockType === "mall_bay",
  );
  assert.equal(techMall?.serviceAllowanceMin, "55");
  assert.equal(new Set(validated.rows.map((row) => row.sourceId)).size, validated.rows.length);
});

test("invalid service-allowance values fail without a write", async () => {
  const missingBrand = validateServiceAllowanceCsv(`${header}\n,rear_dock,15\n`);
  assert.equal(missingBrand.rows.length, 0);
  assert.equal(missingBrand.errors[0]?.field, "brand");
  const missingHeader = validateServiceAllowanceCsv("brand,dock_type\nFresh,rear_dock\n");
  assert.equal(missingHeader.rows.length, 0);
  const writes: string[] = [];
  const summary = await importValidatedServiceAllowance({
    rows: missingBrand.rows,
    loadExisting: async () => null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(summary.inserted, 0);
  assert.equal(writes.length, 0);
});

test("a source brand outside the application brand enum is preserved", () => {
  const validated = validateServiceAllowanceCsv(`${header}\nMarket,rear_dock,15\n`);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows[0]?.brand, "Market");
  assert.equal(validated.rows[0]?.serviceAllowanceMin, "15");
});

test("a duplicate brand and dock type rejects the file and a rerun does not insert again", async () => {
  const duplicated = validateServiceAllowanceCsv(
    `${header}\nFresh,rear_dock,15\nFresh,rear_dock,16\n`,
  );
  assert.equal(duplicated.rows.length, 0);
  assert.match(duplicated.errors[0]?.message ?? "", /Duplicate source identity/);

  const valid = validateServiceAllowanceCsv(`${header}\nFresh,rear_dock,15\n`);
  const existing = new Map<string, Record<string, string>>();
  const writes: string[] = [];
  const first = await importValidatedServiceAllowance({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
      existing.set(row.sourceId, row.values);
    },
  });
  const second = await importValidatedServiceAllowance({
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

test("a conflicting service-allowance row is not overwritten", async () => {
  const valid = validateServiceAllowanceCsv(`${header}\nFresh,rear_dock,15\n`);
  const existing = new Map<string, Record<string, string>>([
    [
      valid.rows[0].sourceId,
      {
        ...valid.rows[0].values,
        service_allowance_min: "99",
      },
    ],
  ]);
  const writes: string[] = [];
  const summary = await importValidatedServiceAllowance({
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
