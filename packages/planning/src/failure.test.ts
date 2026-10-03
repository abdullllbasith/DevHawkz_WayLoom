import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { constructTrips } from "./construct.js";
import { generateCandidates } from "./candidates.js";
import { parsePlanningInput, parsePlanningResult, type PlanningInput } from "./contract.js";
import { runClosedPlanning } from "./failure.js";
import { planningScenarios } from "./fixtures.js";

test("invalid input stops, and an empty candidate set is not a service failure", () => {
  const input = scenario("planning_basic_feasible");
  const broken = { ...input, operationalDate: "2026-06-31" };
  const invalid = runClosedPlanning(broken, { VEH001: 0 }, []);
  assert.equal(invalid.ok, false);
  if (!invalid.ok) {
    assert.equal(invalid.failure.status, "validation_failure");
    assert.equal(JSON.stringify(invalid.failure).includes("trips"), false);
  }
  const missingQuota = scenario("planning_basic_feasible");
  delete (missingQuota.vehicles[0] as { weeklyFuelQuotaL?: string }).weeklyFuelQuotaL;
  const missing = runClosedPlanning(missingQuota, { VEH001: 0 }, []);
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.failure.status, "validation_failure");
  const over = scenario("planning_weight_over_capacity");
  const generated = generateCandidates(over, { VEH001: 0 });
  assert.equal(generated.ok && generated.candidates.length, 0);
  const unallocated = runClosedPlanning(over, { VEH001: 0 }, []);
  assert.equal(unallocated.ok, true);
  if (unallocated.ok) {
    assert.equal(unallocated.result.status, "result");
    assert.equal(unallocated.result.trips.length, 0);
    assert.equal(unallocated.result.unallocated[0]?.deferralReason, "NO_CAPACITY");
    assert.equal(unallocated.result.solverStatus, null);
  }
});

test("a feasible order left unexplained is not rewritten as NO_CAPACITY", () => {
  const input = scenario("planning_basic_feasible");
  const success = runClosedPlanning(input, { VEH001: 0 }, tripIds(input));
  assert.equal(success.ok, true);
  const withheld = runClosedPlanning(input, { VEH001: 0 }, []);
  assert.equal(withheld.ok, false);
  if (!withheld.ok) {
    assert.equal(withheld.failure.status, "service_failure");
    assert.equal(JSON.stringify(withheld.failure).includes("NO_CAPACITY"), false);
    assert.equal(JSON.stringify(withheld).includes(JSON.stringify(success.ok && success.result.trips)), false);
  }
  const secretCounts = runClosedPlanning(input, { password: 0 } as unknown as Record<string, number>, []);
  assert.equal(secretCounts.ok, false);
  if (!secretCounts.ok) assert.equal(secretCounts.failure.status, "service_failure");
  const constructed = constructTrips(input, [{ password: "secret" }], { VEH001: 0 });
  assert.equal(constructed.ok, false);
  if (!constructed.ok) assert.equal(constructed.code, "invalid_value");
  const infeasible = constructTrips(scenario("planning_weight_over_capacity"), generatedCandidates(scenario("planning_basic_feasible")), { VEH001: 0 });
  assert.equal(infeasible.ok, true);
  if (infeasible.ok) assert.equal(infeasible.trips.length, 0);
});

test("an internal error and an invalid result stay closed", () => {
  const input = scenario("planning_basic_feasible");
  const exploding: { contractVersion: string } = { contractVersion: "1" };
  Object.defineProperty(exploding, "orders", { enumerable: true, get() { throw new Error("session=secret"); } });
  const crashed = runClosedPlanning(exploding, { VEH001: 0 }, []);
  assert.equal(crashed.ok, false);
  if (!crashed.ok) {
    assert.equal(crashed.failure.status, "service_failure");
    assert.equal(JSON.stringify(crashed).includes("secret"), false);
    assert.equal(JSON.stringify(crashed).includes("session"), false);
  }
  const unknown = runClosedPlanning(input, { VEH001: 0 }, ["missing-trip"]);
  assert.equal(unknown.ok, false);
  if (!unknown.ok) assert.equal(unknown.failure.status, "service_failure");
  assert.equal(parsePlanningResult({ contractVersion: "1", status: "result", operationalDate: "2026-06-02", trips: [], unallocated: [], solverStatus: "OPTIMAL" }).ok, false);
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/failure.ts"), "utf8");
  assert.equal(source.includes("setTimeout"), false);
  assert.equal(source.includes("setInterval"), false);
  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("OPTIMAL"), false);
});

function scenario(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  const parsed = parsePlanningInput(found.input);
  if (!parsed.ok) throw new Error(name);
  return parsed.value;
}

function tripIds(input: PlanningInput): string[] {
  const generated = generateCandidates(input, { VEH001: 0 });
  if (!generated.ok) throw new Error("candidates");
  return generated.candidates.map((candidate) => candidate.id);
}

function generatedCandidates(input: PlanningInput): unknown[] {
  const generated = generateCandidates(input, { VEH001: 0 });
  if (!generated.ok) throw new Error("candidates");
  return generated.candidates;
}
