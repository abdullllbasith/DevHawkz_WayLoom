export type ObjectAction = "read" | "mutate";

export type ObjectDecision = { allowed: true } | { allowed: false };

const denied: ObjectDecision = { allowed: false };
const permitted: ObjectDecision = { allowed: true };

export const dispatcherOperationalTargets = [
  "order",
  "trip",
  "tripStop",
  "loadingRecord",
  "deliveryRecord",
  "proofOfDelivery",
  "deferral",
  "exception",
  "receipt",
] as const;

export type DispatcherOperationalTarget = (typeof dispatcherOperationalTargets)[number];

export function authorizeStoreManagerOutlet(input: {
  role: string;
  assignedOutletIds: readonly string[];
  outletId: string;
  action: ObjectAction;
}): ObjectDecision {
  if (input.role !== "STORE_MANAGER" || !isAction(input.action)) {
    return denied;
  }
  if (input.outletId.length === 0 || !input.assignedOutletIds.includes(input.outletId)) {
    return denied;
  }
  return permitted;
}

export function authorizeDriverRoute(input: {
  role: string;
  userId: string;
  vehicleDriverUserId: string | null;
  action: ObjectAction;
}): ObjectDecision {
  if (input.role !== "DRIVER" || !isAction(input.action)) {
    return denied;
  }
  if (input.vehicleDriverUserId === null || input.vehicleDriverUserId !== input.userId) {
    return denied;
  }
  return permitted;
}

export function authorizeDriverDelivery(input: {
  role: string;
  userId: string;
  deliveryDriverUserId: string | null;
  action: ObjectAction;
}): ObjectDecision {
  if (input.role !== "DRIVER" || !isAction(input.action)) {
    return denied;
  }
  if (input.deliveryDriverUserId === null || input.deliveryDriverUserId !== input.userId) {
    return denied;
  }
  return permitted;
}

export function authorizeLoaderTask(input: {
  role: string;
  userId: string;
  loaderUserId: string | null;
  action: ObjectAction;
}): ObjectDecision {
  if (input.role !== "LOADER" || !isAction(input.action)) {
    return denied;
  }
  if (input.loaderUserId === null || input.loaderUserId !== input.userId) {
    return denied;
  }
  return permitted;
}

export function authorizeDispatcherOperational(input: {
  role: string;
  target: string;
  action: ObjectAction;
}): ObjectDecision {
  if (input.role !== "DISPATCHER" || !isAction(input.action)) {
    return denied;
  }
  if (!dispatcherOperationalTargets.some((target) => target === input.target)) {
    return denied;
  }
  return permitted;
}

export function authorizeIdentityChange(): ObjectDecision {
  return denied;
}

function isAction(action: ObjectAction): boolean {
  return action === "read" || action === "mutate";
}
