import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { generateCandidates } from "./candidates.js";
import { constructTrips } from "./construct.js";
import { parsePlanningInput, type PlanningInput } from "./contract.js";
import { planningScenarios } from "./fixtures.js";

test("a feasible candidate becomes one normalized trip", () => {
  const input = scenario("planning_basic_feasible");
  const generated = generateCandidates(input, { VEH001: 0 });
  assert.equal(generated.ok, true);
  if (!generated.ok) return;
  const built = constructTrips(input, generated.candidates, { VEH001: 0 });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.trips.length, 1);
  assert.equal(built.rejected.length, 0);
  const trip = built.trips[0];
  assert.ok(trip !== undefined);
  assert.equal(trip.vehicleId, "VEH001");
  assert.equal(trip.tripNumber, 1);
  assert.equal(trip.weightKg, "10");
  assert.equal(trip.volumeM3, "1");
  assert.equal(trip.tripMinutes, "42");
  assert.equal(trip.tripDistanceKm, "12");
  assert.equal(trip.stops[0]?.sequence, 0);
  assert.equal(trip.stops[0]?.plannedArrival, "08:00");
  assert.equal(trip.feasibility.status, "feasible");
  assert.equal(new Set(trip.stops.map((stop) => stop.sequence)).size, trip.stops.length);
});

test("trip 2 is kept, trip 3 is rejected, and fuel stays on the approved distance", () => {
  const input = scenario("planning_basic_feasible");
  const second = generateCandidates(input, { VEH001: 1 });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  const built = constructTrips(input, second.candidates, { VEH001: 1 });
  assert.equal(built.ok && built.trips[0]?.tripNumber, 2);
  assert.equal(built.ok && built.trips[0]?.fuelUsedL !== null, true);
  const candidate = second.candidates[0];
  assert.ok(candidate !== undefined);
  const third = constructTrips(input, [{ ...candidate, tripNumber: 3 }], { VEH001: 1 });
  assert.equal(third.ok && third.trips.length, 0);
  assert.equal(third.ok && third.rejected[0]?.code, "invalid_candidate");
  const mismatched = constructTrips(input, second.candidates, { VEH001: 0 });
  assert.equal(mismatched.ok && mismatched.trips.length, 0);
  assert.equal(mismatched.ok && mismatched.rejected[0]?.code, "two_trips");
});

test("distinct candidates stay distinct and the source is unchanged", () => {
  const input = scenario("planning_determinism");
  const counts = { VEH001: 0, VEH002: 0 };
  const generated = generateCandidates(input, counts);
  assert.equal(generated.ok, true);
  if (!generated.ok) return;
  const before = JSON.stringify(generated.candidates);
  const first = constructTrips(input, generated.candidates, counts);
  const second = constructTrips(input, generated.candidates, counts);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(JSON.stringify(generated.candidates), before);
  assert.equal(first.ok && first.trips.some((trip) => trip.orderIds.length > 1), true);
  assert.equal(first.ok && new Set(first.trips.map((trip) => trip.id)).size, first.ok ? first.trips.length : 0);
  const heavy = first.ok ? first.trips.find((trip) => trip.orderIds.length > 1) : undefined;
  assert.equal(heavy?.weightKg, "20");
  assert.equal(heavy?.volumeM3, "2");
  assert.equal(heavy?.tripMinutes, "59");
  assert.equal(heavy?.tripDistanceKm, "14");
  const invalid = constructTrips(input, [{}], counts);
  assert.equal(invalid.ok && invalid.rejected[0]?.code, "invalid_candidate");
  const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../src/construct.ts"), "utf8");
  assert.equal(source.includes("prisma"), false);
  assert.equal(source.includes("ortools"), false);
  assert.equal(source.includes("FUEL_LIMIT"), false);
});

function scenario(name: string): PlanningInput {
  const found = planningScenarios().find((item) => item.name === name);
  if (found === undefined) throw new Error(name);
  const parsed = parsePlanningInput(found.input);
  if (!parsed.ok) throw new Error(name);
  return parsed.value;
}
