import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { importValidatedVehicles, validateVehicleCsv } from "./vehicles.js";

const header =
  "vehicle_id,type,temp,weight_cap_kg,volume_cap_m3,fuel_type,km_per_l,weekly_fuel_quota_l,depot";

test("the supplied vehicles file matches the approved columns", async () => {
  const text = await readFile(
    path.resolve(import.meta.dirname, "../../../../data/competition-import/vehicles.csv"),
    "utf8",
  );
  const validated = validateVehicleCsv(text);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows.length, 60);
  assert.equal(validated.rows[0]?.sourceId, "VEH001");
  assert.equal(validated.rows[0]?.type, "truck");
  assert.equal(validated.rows[0]?.temp, "reefer");
  assert.equal(validated.rows[0]?.fuelType, "diesel");
  assert.equal(validated.rows[34]?.sourceId, "VEH035");
  assert.equal(validated.rows[34]?.type, "van");
  assert.equal(validated.rows[59]?.sourceId, "VEH060");
  assert.equal(validated.rows[59]?.depot, "Kandy");
});

test("invalid vehicle values fail without a write", async () => {
  const invalidType = validateVehicleCsv(
    `${header}\nVEH001,car,reefer,1000,10,diesel,5,100,Peliyagoda\n`,
  );
  assert.equal(invalidType.errors[0]?.field, "type");
  const invalidTemp = validateVehicleCsv(
    `${header}\nVEH001,truck,frozen,1000,10,diesel,5,100,Peliyagoda\n`,
  );
  assert.equal(invalidTemp.errors[0]?.field, "temp");
  const invalidDepot = validateVehicleCsv(
    `${header}\nVEH001,truck,reefer,1000,10,diesel,5,100,Galle\n`,
  );
  assert.equal(invalidDepot.errors[0]?.field, "depot");
  const invalidWeight = validateVehicleCsv(
    `${header}\nVEH001,truck,reefer,0,10,diesel,5,100,Peliyagoda\n`,
  );
  assert.equal(invalidWeight.errors[0]?.field, "weight_cap_kg");
  const writes: string[] = [];
  const summary = await importValidatedVehicles({
    rows: invalidType.rows,
    loadExisting: async () => null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(summary.inserted, 0);
  assert.equal(writes.length, 0);
});

test("a duplicate vehicle id rejects the file and a rerun does not insert again", async () => {
  const duplicated = validateVehicleCsv(
    `${header}\nVEH001,truck,reefer,1000,10,diesel,5,100,Peliyagoda\nVEH001,van,ambient,1000,10,diesel,5,100,Kandy\n`,
  );
  assert.equal(duplicated.rows.length, 0);
  assert.equal(duplicated.errors[0]?.sourceId, "VEH001");

  const valid = validateVehicleCsv(
    `${header}\nVEH001,truck,reefer,5510,26.4,diesel,4.7,340,Peliyagoda\n`,
  );
  const existing = new Map<string, Record<string, string>>();
  const writes: string[] = [];
  const first = await importValidatedVehicles({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
      existing.set(row.sourceId, row.values);
    },
  });
  const second = await importValidatedVehicles({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(first.inserted, 1);
  assert.equal(second.unchanged, 1);
  assert.deepEqual(writes, ["VEH001"]);
});

test("a conflicting vehicle is not overwritten and no driver is assigned", async () => {
  const valid = validateVehicleCsv(
    `${header}\nVEH001,truck,reefer,5510,26.4,diesel,4.7,340,Peliyagoda\n`,
  );
  assert.equal("driverUserId" in (valid.rows[0] ?? {}), false);
  const writes: string[] = [];
  const conflict = await importValidatedVehicles({
    rows: valid.rows,
    loadExisting: async () => ({
      ...(valid.rows[0]?.values ?? {}),
      fuel_type: "petrol",
    }),
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(writes.length, 0);
});
