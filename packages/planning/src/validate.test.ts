import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { canonicalPlanningInput } from "./contract.js";
import { planningScenarios } from "./fixtures.js";
import { validatePlanningInput } from "./validate.js";

test("approved fixtures validate without planning or persistence", () => {
  for (const scenario of planningScenarios()) {
    const before = JSON.stringify(scenario.input);
    const result = validatePlanningInput(scenario.input);
    assert.equal(JSON.stringify(scenario.input), before, scenario.name);
    if (scenario.classification === "validation_failure") {
      assert.equal(result.ok, false, scenario.name);
    } else {
      assert.equal(result.ok, true, scenario.name);
      if (result.ok) assert.equal(result.input.contractVersion, "1");
    }
  }
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/validate.ts"), "utf8");
  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("$transaction"), false);
  assert.equal(source.includes("trip_distance_km /"), false);
});

test("structure, identity, and outlet context fail closed", () => {
  const basic = planningScenarios().find((item) => item.name === "planning_basic_feasible");
  assert.ok(basic !== undefined);
  const input = structuredClone(basic.input) as Record<string, unknown>;
  assert.equal(validatePlanningInput({ ...input, contractVersion: "2" }).ok, false);
  const unsupported = validatePlanningInput({ ...input, contractVersion: "2" });
  if (!unsupported.ok) assert.equal(unsupported.failures[0]?.category, "unsupported_value");
  const withoutOrders = { ...input };
  delete withoutOrders.orders;
  const missing = validatePlanningInput(withoutOrders);
  if (!missing.ok) assert.equal(missing.failures[0]?.path, "orders");

  const duplicated = structuredClone(basic.input) as { orders: Record<string, unknown>[] };
  const order = duplicated.orders[0];
  assert.ok(order !== undefined);
  duplicated.orders.push({ ...order });
  const duplicate = validatePlanningInput(duplicated);
  assert.equal(duplicate.ok, false);
  if (!duplicate.ok) assert.equal(duplicate.failures.some((item) => item.category === "duplicate_identity"), true);

  const mismatched = structuredClone(basic.input) as { orders: { brand: string; deliveryId: string; outletId: string }[] };
  const first = mismatched.orders[0];
  assert.ok(first !== undefined);
  first.brand = "Style";
  const conflict = validatePlanningInput(mismatched);
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.failures[0]?.category, "cross_record_inconsistency");

  first.brand = "Fresh";
  first.outletId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const reference = validatePlanningInput(mismatched);
  assert.equal(reference.ok, false);
  if (!reference.ok) assert.equal(reference.failures[0]?.category, "invalid_reference");
});

test("required travel is required, traffic is not an input, and validation order is stable", () => {
  const basic = planningScenarios().find((item) => item.name === "planning_basic_feasible");
  assert.ok(basic !== undefined);
  const input = structuredClone(basic.input) as { travel: unknown[]; orders: { district: string }[] };
  input.travel = [];
  const missingTravel = validatePlanningInput(input);
  assert.equal(missingTravel.ok, false);
  if (!missingTravel.ok) assert.equal(missingTravel.failures[0]?.category, "missing_required_dataset");

  const withTraffic = { ...structuredClone(basic.input) as object, trafficSpeed: [{ speed_index: "" }] };
  const traffic = validatePlanningInput(withTraffic);
  assert.equal(traffic.ok, false);
  if (!traffic.ok) assert.equal(traffic.failures[0]?.category, "malformed_optional_dataset");
  assert.equal(JSON.stringify(traffic).includes("speed_index"), false);

  const fuel = planningScenarios().find((item) => item.name === "planning_fuel_exact_quota");
  const validated = validatePlanningInput(fuel?.input);
  assert.equal(validated.ok, true);
  if (!validated.ok) return;
  assert.equal(JSON.stringify(validated.input).includes("tripDistanceKm"), false);
  const again = validatePlanningInput(fuel?.input);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(canonicalPlanningInput(validated.input), canonicalPlanningInput(again.input));
});
