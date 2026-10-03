/**
 * Shared TypeScript planning contracts.
 * Planning execution belongs in services/planning and is not implemented here.
 */
export {
  CUTOFF_CLOCK,
  CUTOFF_TIME_ZONE,
  EXISTING_TRIP_COUNT_SOURCE,
  FUEL_FORMULA,
  PLANNING_CONTRACT_VERSION,
  PROJECTED_FUEL_FORMULA,
  TRIP_DISTANCE_FORMULA,
  TRIP_TIME_FORMULA,
  canonicalPlanningInput,
  deferralReasons,
  hardConstraints,
  parsePlanningFailure,
  parsePlanningInput,
  parsePlanningResult,
  planningAuthority,
  planningDatasets,
  planningUnits,
} from "./contract.js";
export { planningScenarios } from "./fixtures.js";
export type { PlanningScenario, ScenarioClassification } from "./fixtures.js";
export { validatePlanningInput, validationCategories } from "./validate.js";
export type { PlanningValidationFailure, PlanningValidationResult, ValidationCategory } from "./validate.js";
export { validateVehicleFuel, validateWeeklyFuel } from "./fuel.js";
export type { FuelContext, FuelFailureCode, FuelResult, FuelTripInput } from "./fuel.js";
export { constructTrips } from "./construct.js";
export type { ConstructedTrip, TripConstructionResult } from "./construct.js";
export { generateCandidates, tripDistanceKm } from "./candidates.js";
export type { CandidateGenerationResult, GeneratedCandidate } from "./candidates.js";
export { classifyCutoff, cutoffEligibleOrders } from "./cutoff.js";
export type { CutoffFailureCode, CutoffRequest, CutoffResult } from "./cutoff.js";
export { calculateTripTime, tripTimeForOrders } from "./trip-time.js";
export type { TripTimeFailureCode, TripTimeRequest, TripTimeResult, TripTimeStopInput } from "./trip-time.js";
export { evaluateFeasibility } from "./feasibility.js";
export type { ConstraintEvaluation, ConstraintStatus, FeasibilityResult, PlanningCandidate } from "./feasibility.js";
export type {
  ContractResult,
  DeferralReason,
  HardConstraintId,
  PlanningCalendar,
  PlanningFailure,
  PlanningInput,
  PlanningOrder,
  PlanningOutlet,
  PlanningResult,
  PlanningServiceAllowance,
  PlanningStop,
  PlanningTravel,
  PlanningTrip,
  PlanningVehicle,
  UnallocatedOrder,
} from "./contract.js";
