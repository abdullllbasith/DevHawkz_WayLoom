import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { parseCsv } from "./csv.js";
import { assertImportDatabaseTarget } from "./database-target.js";
import {
  competitionImportDirectory,
  discoverHackathonDatasets,
  rejectNonHackathonDataset,
} from "./datasets.js";
import { executeImport, formatImportSummary, sameSourceValues } from "./identity.js";
import { formatImportIssue } from "./issues.js";
import { runCompetitionImport } from "./run.js";
import {
  duplicateSourceIdentifiers,
  parseCallerTime,
  parseNonNegativeNumber,
  requireAllowedValue,
  requireHeaders,
  sourceIdentity,
} from "./validate.js";

test("competition files are discovered from data/competition-import", () => {
  assert.equal(
    competitionImportDirectory(path.join("G:", "WayLoom", "DevHawkz_WayLoom")).endsWith(
      path.join("data", "competition-import"),
    ),
    true,
  );
});

test("missing competition files fail with file context", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "wayloom-import-"));
  const discovered = await discoverHackathonDatasets(directory);
  assert.deepEqual(
    discovered.errors.map((issue) => issue.file),
    ["outlets.csv", "vehicles.csv", "calendar.csv"],
  );
  assert.match(formatImportIssue(discovered.errors[0]!), /outlets outlets\.csv/);
});

test("CSV header and row errors keep dataset and row context", () => {
  const parsed = parseCsv("outlets", "outlets.csv", "outlet_id,outlet_id\nA,B\n");
  assert.equal(parsed.table, null);
  assert.equal(parsed.errors[0]?.row, 1);
  assert.equal(parsed.errors[0]?.field, "outlet_id");
  assert.match(formatImportIssue(parsed.errors[0]!), /row 1/);
});

test("column count errors keep the data row number", () => {
  const parsed = parseCsv("vehicles", "vehicles.csv", "vehicle_id,depot\nV1\n");
  assert.equal(parsed.errors[0]?.row, 2);
  assert.match(parsed.errors[0]?.message ?? "", /Expected 2 columns/);
});

test("source identity is stable and rejects an empty identifier", () => {
  assert.equal(sourceIdentity(" OUT-1 "), "OUT-1");
  assert.throws(() => sourceIdentity("  "), /empty/);
  const table = parseCsv("outlets", "outlets.csv", "outlet_id\nOUT-1\nOUT-1\n").table;
  assert.ok(table);
  const duplicates = duplicateSourceIdentifiers("outlets", "outlets.csv", table, "outlet_id");
  assert.equal(duplicates[0]?.sourceId, "OUT-1");
  assert.equal(duplicates[0]?.row, 3);
});

test("validation utilities report field and row context", () => {
  const numberError = parseNonNegativeNumber(
    "vehicles",
    "vehicles.csv",
    2,
    "V1",
    "weight_cap_kg",
    "-1",
  );
  assert.match(numberError.error?.message ?? "", /non-negative/);
  const enumError = requireAllowedValue(
    "outlets",
    "outlets.csv",
    4,
    "OUT-1",
    "brand",
    "Other",
    ["Fresh"],
  );
  assert.equal(enumError?.field, "brand");
  const timeError = parseCallerTime(
    "calendar",
    "calendar.csv",
    5,
    "2026-10-03",
    "open",
    "9:30",
    "HH:MM",
  );
  assert.equal(timeError?.row, 5);
  const table = parseCsv("outlets", "outlets.csv", "name\nA\n").table;
  assert.ok(table);
  assert.equal(requireHeaders("outlets", "outlets.csv", table, ["outlet_id"])[0]?.field, "outlet_id");
});

test("an unsafe database target is refused before connection", async () => {
  assert.throws(
    () =>
      assertImportDatabaseTarget(
        "postgresql://wayloom_app:secret@127.0.0.1:5432/wayloom_development",
        "production",
      ),
    /production/,
  );
  assert.throws(
    () =>
      assertImportDatabaseTarget(
        "postgresql://wayloom_app:secret@example.com:5432/wayloom_development",
        "development",
      ),
    /local development or test/,
  );
  const result = await runCompetitionImport({
    repoRoot: "G:/WayLoom/DevHawkz_WayLoom",
    env: { NODE_ENV: "production", DATABASE_URL: "postgresql://127.0.0.1/wayloom_development" },
    connect: () => {
      throw new Error("connect must not be called");
    },
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.lines[0] ?? "", /production/);
  assert.equal(result.lines.join("\n").includes("secret"), false);
});

test("the same source record is unchanged and a conflict is not written", async () => {
  const existing = new Map<string, Record<string, string>>([["OUT-1", { outlet_id: "OUT-1", brand: "Fresh" }]]);
  const writes: string[] = [];
  let transactionCalls = 0;
  const unchanged = await executeImport({
    dataset: "outlets",
    file: "outlets.csv",
    records: [{ sourceId: "OUT-1", values: { brand: "Fresh", outlet_id: "OUT-1" } }],
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (record) => {
      writes.push(record.sourceId);
    },
    transaction: async (work) => {
      transactionCalls += 1;
      await work();
    },
  });
  assert.equal(unchanged.inserted, 0);
  assert.equal(unchanged.unchanged, 1);
  assert.equal(writes.length, 0);
  assert.equal(sameSourceValues({ b: "2", a: "1" }, { a: "1", b: "2" }), true);

  const conflict = await executeImport({
    dataset: "outlets",
    file: "outlets.csv",
    records: [{ sourceId: "OUT-1", values: { outlet_id: "OUT-1", brand: "Style" } }],
    loadExisting: async (sourceId) => existing.get(sourceId) ?? null,
    write: async (record) => {
      writes.push(record.sourceId);
    },
    transaction: async (work) => {
      transactionCalls += 1;
      await work();
    },
  });
  assert.equal(conflict.inserted, 0);
  assert.equal(conflict.conflicts.length, 1);
  assert.equal(writes.length, 0);
  assert.equal(transactionCalls, 0);
  assert.match(formatImportSummary(conflict), /conflicts=1/);
});

test("a new source record is inserted once inside the transaction", async () => {
  const writes: string[] = [];
  const summary = await executeImport({
    dataset: "vehicles",
    file: "vehicles.csv",
    records: [
      { sourceId: "V2", values: { vehicle_id: "V2" } },
      { sourceId: "V1", values: { vehicle_id: "V1" } },
    ],
    loadExisting: async () => null,
    write: async (record) => {
      writes.push(record.sourceId);
    },
    transaction: async (work) => {
      await work();
    },
  });
  assert.deepEqual(writes, ["V1", "V2"]);
  assert.equal(summary.inserted, 2);
  assert.equal(formatImportSummary(summary), formatImportSummary(summary));
});

test("files outside the Hackathon set are refused", async () => {
  const rejected = rejectNonHackathonDataset("datathon-training.csv");
  assert.match(rejected?.message ?? "", /Datathon-only/);
  const directory = await mkdtemp(path.join(tmpdir(), "wayloom-import-"));
  await writeFile(path.join(directory, "datathon-training.csv"), "id\n1\n", "utf8");
  const result = await runCompetitionImport({
    repoRoot: directory,
    env: {
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://wayloom_app:secret@127.0.0.1:5432/wayloom_test",
    },
    requestedFile: "datathon-training.csv",
    connect: () => {
      throw new Error("connect must not be called");
    },
  });
  assert.equal(result.exitCode, 1);
  assert.equal(result.database, null);
  assert.equal(result.lines.join("\n").includes("secret"), false);
});
