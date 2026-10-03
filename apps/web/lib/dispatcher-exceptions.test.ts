import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyExceptionCategory,
  computeExceptionsKpis,
  exportExceptionsCsv,
  filterExceptionsList,
  readExceptionList,
  validateCreateExceptionInput,
  type StoredException,
} from "./dispatcher-exceptions.ts";

test("classifyExceptionCategory identifies operational groups accurately", () => {
  assert.equal(classifyExceptionCategory("loading problem").group, "loading");
  assert.equal(classifyExceptionCategory("Shortfall at dock").group, "loading");

  assert.equal(classifyExceptionCategory("vehicle breakdown").group, "vehicle");
  assert.equal(classifyExceptionCategory("Van tire puncture").group, "vehicle");

  assert.equal(classifyExceptionCategory("outlet gate locked").group, "delivery");
  assert.equal(classifyExceptionCategory("delivery access refused").group, "delivery");

  assert.equal(classifyExceptionCategory("heavy rain delay").group, "delay");
  assert.equal(classifyExceptionCategory("traffic congestion").group, "delay");

  assert.equal(classifyExceptionCategory("damaged carton").group, "cargo");
  assert.equal(classifyExceptionCategory("temperature excursion").group, "cargo");

  assert.equal(classifyExceptionCategory("miscellaneous note").group, "other");
});

test("readExceptionList safely parses backend records and sorts by occurredAt descending", () => {
  assert.deepEqual(readExceptionList(null), []);
  assert.deepEqual(readExceptionList("invalid"), []);
  assert.deepEqual(readExceptionList([{ wrong: "field" }]), []);

  const input = [
    {
      id: "ex-1",
      category: "loading problem",
      details: "case damaged during pallet load",
      occurredAt: "2026-06-02T08:00:00.000Z",
    },
    {
      id: "ex-2",
      category: "vehicle breakdown",
      details: null,
      occurredAt: "2026-06-02T11:30:00.000Z",
    },
  ];

  const parsed = readExceptionList(input);
  assert.equal(parsed.length, 2);
  // Most recent first: ex-2 (11:30) then ex-1 (08:00)
  assert.equal(parsed[0]?.id, "ex-2");
  assert.equal(parsed[0]?.category, "vehicle breakdown");
  assert.equal(parsed[0]?.details, null);

  assert.equal(parsed[1]?.id, "ex-1");
  assert.equal(parsed[1]?.category, "loading problem");
  assert.equal(parsed[1]?.details, "case damaged during pallet load");
});

test("computeExceptionsKpis computes counts by operational category", () => {
  const sample: StoredException[] = [
    { id: "1", category: "loading problem", details: null, occurredAt: "2026-06-02T08:00:00.000Z" },
    { id: "2", category: "vehicle breakdown", details: null, occurredAt: "2026-06-02T09:00:00.000Z" },
    { id: "3", category: "delivery refusal", details: null, occurredAt: "2026-06-02T10:00:00.000Z" },
    { id: "4", category: "system discrepancy", details: null, occurredAt: "2026-06-02T10:30:00.000Z" },
  ];

  const kpis = computeExceptionsKpis(sample);
  assert.equal(kpis.totalExceptions, 4);
  assert.equal(kpis.loadingCount, 1);
  assert.equal(kpis.vehicleCount, 1);
  assert.equal(kpis.deliveryCount, 1);
  assert.equal(kpis.otherCount, 1);
});

test("filterExceptionsList filters by query text and category group", () => {
  const sample: StoredException[] = [
    { id: "ex-101", category: "loading shortfall", details: "3 items missing", occurredAt: "2026-06-02T08:00:00.000Z" },
    { id: "ex-202", category: "vehicle breakdown", details: "alternator failure", occurredAt: "2026-06-02T09:00:00.000Z" },
    { id: "ex-303", category: "delivery access issue", details: "narrow gate", occurredAt: "2026-06-02T10:00:00.000Z" },
  ];

  assert.equal(filterExceptionsList(sample, { search: "", categoryGroup: "ALL" }).length, 3);
  assert.equal(filterExceptionsList(sample, { search: "alternator", categoryGroup: "ALL" }).length, 1);
  assert.equal(filterExceptionsList(sample, { search: "ex-101", categoryGroup: "ALL" }).length, 1);
  assert.equal(filterExceptionsList(sample, { search: "", categoryGroup: "loading" }).length, 1);
  assert.equal(filterExceptionsList(sample, { search: "", categoryGroup: "vehicle" }).length, 1);
  assert.equal(filterExceptionsList(sample, { search: "missing", categoryGroup: "vehicle" }).length, 0);
});

test("validateCreateExceptionInput enforces category requirement and preserves details", () => {
  assert.equal(validateCreateExceptionInput("").ok, false);
  assert.equal(validateCreateExceptionInput("   ").ok, false);

  const valid = validateCreateExceptionInput("loading problem", "box crushed");
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.category, "loading problem");
    assert.equal(valid.details, "box crushed");
  }

  const validNoDetails = validateCreateExceptionInput("vehicle breakdown");
  assert.equal(validNoDetails.ok, true);
  if (validNoDetails.ok) {
    assert.equal(validNoDetails.category, "vehicle breakdown");
    assert.equal(validNoDetails.details, undefined);
  }
});

test("exportExceptionsCsv produces structured CSV without fabricated data", () => {
  const sample: StoredException[] = [
    { id: "ex-1", category: "loading, dock", details: "box crushed", occurredAt: "2026-06-02T08:00:00.000Z" },
  ];

  const csv = exportExceptionsCsv(sample);
  assert.equal(csv.includes("Exception ID,Category,Category Group,Details,Occurred At,Status"), true);
  assert.equal(csv.includes('"loading, dock"'), true);
  assert.equal(csv.includes("box crushed"), true);
  assert.equal(csv.includes("Reported"), true);
});
