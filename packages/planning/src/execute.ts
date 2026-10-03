/**
 * Run the closed Phase 5 planning boundary: candidates, construction, deterministic selection, result assembly.
 */
import { generateCandidates } from "./candidates.js";
import { constructTrips } from "./construct.js";
import { PLANNING_CONTRACT_VERSION } from "./contract.js";
import { runClosedPlanning } from "./failure.js";
import type { PlanningRun } from "./result.js";
import { selectDeterministicTripIds } from "./selection.js";

export function executePlanningEngine(
  value: unknown,
  committedTripCounts: Readonly<Record<string, number | null>>,
): PlanningRun {
  const generated = generateCandidates(value, committedTripCounts);
  if (!generated.ok) {
    return failure(generated.code === "invalid_input" || generated.code === "invalid_cutoff" ? "validation_failure" : "service_failure");
  }
  const constructed = constructTrips(value, generated.candidates, committedTripCounts);
  if (!constructed.ok) {
    return failure(constructed.code === "invalid_input" ? "validation_failure" : "service_failure");
  }
  const selectedTripIds = selectDeterministicTripIds(constructed.trips);
  return runClosedPlanning(value, committedTripCounts, selectedTripIds);
}

function failure(status: "validation_failure" | "service_failure"): PlanningRun {
  return { ok: false, failure: { contractVersion: PLANNING_CONTRACT_VERSION, status } };
}
