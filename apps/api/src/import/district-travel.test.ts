import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  importValidatedDistrictTravel,
  validateDistrictTravelCsv,
} from "./district-travel.js";

const header =
  "district,depot,road_class,free_flow_kmh,depot_to_district_km,depot_to_district_freeflow_min,inter_stop_km,inter_stop_freeflow_min";

test("the supplied district-travel file preserves source tokens", async () => {
  const text = await readFile(
    path.resolve(import.meta.dirname, "../../../../data/competition-import/district_travel.csv"),
    "utf8",
  );
  const validated = validateDistrictTravelCsv(text);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows.length, 12);
  assert.equal(validated.rows[0]?.district, "Colombo");
  assert.equal(validated.rows[0]?.depot, "Peliyagoda");
  assert.equal(validated.rows[0]?.roadClass, "urban");
  assert.equal(validated.rows[0]?.freeFlowKmh, "30.0");
  assert.equal(validated.rows[0]?.depotToDistrictKm, "12");
  assert.equal(validated.rows[0]?.interStopKm, "4.0");
  const nuwara = validated.rows.find((row) => row.district === "Nuwara Eliya");
  assert.equal(nuwara?.depot, "Kandy");
  assert.equal(nuwara?.roadClass, "hill");
  assert.equal(nuwara?.freeFlowKmh, "42.0");
  assert.equal(new Set(validated.rows.map((row) => row.sourceId)).size, validated.rows.length);
});

test("invalid district-travel values fail without a write", async () => {
  const missingDepot = validateDistrictTravelCsv(
    `${header}\nColombo,,urban,30.0,12,24,4.0,8\n`,
  );
  assert.equal(missingDepot.rows.length, 0);
  assert.equal(missingDepot.errors[0]?.field, "depot");
  const missingHeader = validateDistrictTravelCsv(
    "district,depot,road_class\nColombo,Peliyagoda,urban\n",
  );
  assert.equal(missingHeader.rows.length, 0);
  const writes: string[] = [];
  const summary = await importValidatedDistrictTravel({
    rows: missingDepot.rows,
    loadExisting: async () => null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(summary.inserted, 0);
  assert.equal(writes.length, 0);
});

test("a source depot outside the application depot enum is preserved", () => {
  const validated = validateDistrictTravelCsv(
    `${header}\nGalle,Coast,highway,70.0,120,103,10.0,9\n`,
  );
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows[0]?.depot, "Coast");
  assert.equal(validated.rows[0]?.roadClass, "highway");
});

test("a duplicate depot and district rejects the file and a rerun does not insert again", async () => {
  const duplicated = validateDistrictTravelCsv(
    `${header}\nColombo,Peliyagoda,urban,30.0,12,24,4.0,8\nColombo,Peliyagoda,suburban,45.0,28,37,7.0,9\n`,
  );
  assert.equal(duplicated.rows.length, 0);
  assert.match(duplicated.errors[0]?.message ?? "", /Duplicate source identity/);

  const valid = validateDistrictTravelCsv(
    `${header}\nColombo,Peliyagoda,urban,30.0,12,24,4.0,8\n`,
  );
  const existing = new Map<string, Record<string, string>>();
  const writes: string[] = [];
  const first = await importValidatedDistrictTravel({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
      existing.set(row.sourceId, row.values);
    },
  });
  const second = await importValidatedDistrictTravel({
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

test("a conflicting district-travel row is not overwritten", async () => {
  const valid = validateDistrictTravelCsv(
    `${header}\nColombo,Peliyagoda,urban,30.0,12,24,4.0,8\n`,
  );
  const existing = new Map<string, Record<string, string>>([
    [
      valid.rows[0].sourceId,
      {
        ...valid.rows[0].values,
        inter_stop_km: "9.0",
      },
    ],
  ]);
  const writes: string[] = [];
  const summary = await importValidatedDistrictTravel({
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
