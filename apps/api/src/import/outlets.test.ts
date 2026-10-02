import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { formatImportIssue } from "./issues.js";
import { importValidatedOutlets, validateOutletCsv } from "./outlets.js";

const header =
  "outlet_id,brand,district,depot,dock_type,parking_constraint,mall_window,window_open_time,window_close_time";

test("the supplied outlets file matches the approved columns and imports as one set", async () => {
  const text = await readFile(
    path.resolve(import.meta.dirname, "../../../../data/competition-import/outlets.csv"),
    "utf8",
  );
  const validated = validateOutletCsv(text);
  assert.deepEqual(validated.errors, []);
  assert.equal(validated.rows.length, 120);
  assert.equal(validated.rows[0]?.sourceId, "OUT001");
  assert.equal(validated.rows[0]?.mallWindow, null);
  assert.equal(validated.rows[14]?.sourceId, "OUT015");
  assert.equal(validated.rows[14]?.mallWindow, "09:00-11:00");
  assert.equal(validated.rows[119]?.sourceId, "OUT120");
  assert.equal(validated.rows[87]?.district, "Kandy");
});

test("invalid outlet values fail without a write", async () => {
  const invalidBrand = validateOutletCsv(
    `${header}\nOUT001,Other,Colombo,Peliyagoda,street,normal,,05:00,07:30\n`,
  );
  assert.equal(invalidBrand.errors[0]?.field, "brand");
  const invalidDepot = validateOutletCsv(
    `${header}\nOUT001,Fresh,Colombo,Galle,street,normal,,05:00,07:30\n`,
  );
  assert.equal(invalidDepot.errors[0]?.field, "depot");
  const invalidDock = validateOutletCsv(
    `${header}\nOUT001,Fresh,Colombo,Peliyagoda,front,normal,,05:00,07:30\n`,
  );
  assert.equal(invalidDock.errors[0]?.field, "dock_type");
  const invalidParking = validateOutletCsv(
    `${header}\nOUT001,Fresh,Colombo,Peliyagoda,street,truck,,05:00,07:30\n`,
  );
  assert.equal(invalidParking.errors[0]?.field, "parking_constraint");
  const invalidTime = validateOutletCsv(
    `${header}\nOUT001,Fresh,Colombo,Peliyagoda,street,normal,,5:00,07:30\n`,
  );
  assert.equal(invalidTime.errors[0]?.field, "window_open_time");
  const invalidMall = validateOutletCsv(
    `${header}\nOUT001,Fresh,Colombo,Peliyagoda,mall_bay,mall_dock,9-11,09:00,11:00\n`,
  );
  assert.equal(invalidMall.errors[0]?.field, "mall_window");
  const missingDistrict = validateOutletCsv(
    `${header}\nOUT001,Fresh,,Peliyagoda,street,normal,,05:00,07:30\n`,
  );
  assert.equal(missingDistrict.errors[0]?.field, "district");
  assert.match(formatImportIssue(invalidBrand.errors[0]!), /row 2/);

  const writes: string[] = [];
  const summary = await importValidatedOutlets({
    rows: invalidBrand.rows,
    loadExisting: async () => null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(summary.inserted, 0);
  assert.equal(writes.length, 0);
});

test("a duplicate outlet id rejects the file and a rerun does not insert again", async () => {
  const duplicated = validateOutletCsv(
    `${header}\nOUT001,Fresh,Colombo,Peliyagoda,street,normal,,05:00,07:30\nOUT001,Fresh,Colombo,Peliyagoda,street,normal,,05:00,07:30\n`,
  );
  assert.equal(duplicated.rows.length, 0);
  assert.equal(duplicated.errors[0]?.sourceId, "OUT001");

  const valid = validateOutletCsv(
    `${header}\nOUT001,Fresh,Colombo,Peliyagoda,street,van_only,,05:00,07:30\n`,
  );
  assert.equal(valid.rows.length, 1);
  const existing = new Map<string, Record<string, string>>();
  const writes: string[] = [];
  const first = await importValidatedOutlets({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
      existing.set(row.sourceId, row.values);
    },
  });
  const second = await importValidatedOutlets({
    rows: valid.rows,
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(first.inserted, 1);
  assert.equal(second.inserted, 0);
  assert.equal(second.unchanged, 1);
  assert.deepEqual(writes, ["OUT001"]);
});

test("a conflicting outlet is not overwritten", async () => {
  const valid = validateOutletCsv(
    `${header}\nOUT001,Style,Colombo,Peliyagoda,street,normal,,09:00,17:00\n`,
  );
  const writes: string[] = [];
  const summary = await importValidatedOutlets({
    rows: valid.rows,
    loadExisting: async () => valid.rows[0]!.values,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  const changed = validateOutletCsv(
    `${header}\nOUT001,Tech,Colombo,Peliyagoda,street,normal,,09:00,17:00\n`,
  );
  const conflict = await importValidatedOutlets({
    rows: changed.rows,
    loadExisting: async () => valid.rows[0]!.values,
    write: async (row) => {
      writes.push(row.sourceId);
    },
  });
  assert.equal(summary.unchanged, 1);
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(writes.length, 0);
});
