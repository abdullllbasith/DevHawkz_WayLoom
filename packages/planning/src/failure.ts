/**
 * Stop a planning run at the first closed failure.
 * This does not choose a plan, retry, persist, or invent a failure status.
 */
import { generateCandidates } from "./candidates.js";
import { PLANNING_CONTRACT_VERSION, type PlanningFailure } from "./contract.js";
import { constructTrips } from "./construct.js";
import { explainAllocations } from "./deferral-reason.js";
import { assemblePlanningResult, type PlanningRun } from "./result.js";
import { validatePlanningInput } from "./validate.js";

export function runClosedPlanning(
  value: unknown,
  committedTripCounts: Readonly<Record<string, number | null>>,
  selectedTripIds: readonly string[],
): PlanningRun {
  try {
    const validated = validatePlanningInput(value);
    if (!validated.ok) return failure("validation_failure");
    const generated = generateCandidates(value, committedTripCounts);
    if (!generated.ok) return failure(generated.code === "invalid_input" ? "validation_failure" : "service_failure");
    const constructed = constructTrips(value, generated.candidates, committedTripCounts);
    if (!constructed.ok) return failure(constructed.code === "invalid_input" ? "validation_failure" : "service_failure");
    if (new Set(selectedTripIds).size !== selectedTripIds.length) return failure("service_failure");
    const selected = constructed.trips.filter((trip) => selectedTripIds.includes(trip.id));
    if (selected.length !== selectedTripIds.length) return failure("service_failure");
    const explained = explainAllocations(value, selected, committedTripCounts);
    if (!explained.ok) return failure("service_failure");
    return assemblePlanningResult(value, selected, explained.orders);
  } catch {
    return failure("service_failure");
  }
}

function failure(status: PlanningFailure["status"]): PlanningRun {
  return { ok: false, failure: { contractVersion: PLANNING_CONTRACT_VERSION, status } };
}
