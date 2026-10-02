import {
  authorizeDispatcherOperational,
  authorizeStoreManagerOutlet,
} from "../security/object-authorization.js";
import {
  orderStatuses,
  type OrderActor,
  type OrderDomainCode,
  type OrderResult,
  type OrderStatusName,
  type OrderStore,
  type OrderTransitionFacts,
} from "./order.js";

const prohibitedCommandFields = [
  "status",
  "to",
  "submittedAt",
  "actorUserId",
  "role",
  "tripId",
  "vehicleId",
  "routeId",
  "seqInRoute",
  "deferralReason",
  "planningEligible",
  "dispatchDate",
  "dispatchStatus",
] as const;

type TransitionOwner = "STORE_MANAGER" | "DISPATCHER" | "LOADER" | "DRIVER";
type TransitionPrerequisite = "none" | "allocation" | "deferral" | "loader" | "delivery" | "receipt";

const transitions: readonly {
  from: OrderStatusName;
  to: OrderStatusName;
  owner: TransitionOwner;
  prerequisite: TransitionPrerequisite;
}[] = [
  { from: "DRAFT", to: "SUBMITTED", owner: "STORE_MANAGER", prerequisite: "none" },
  { from: "SUBMITTED", to: "CONFIRMED", owner: "DISPATCHER", prerequisite: "none" },
  { from: "CONFIRMED", to: "DEFERRED", owner: "DISPATCHER", prerequisite: "deferral" },
  { from: "CONFIRMED", to: "PLANNED_ALLOCATED", owner: "DISPATCHER", prerequisite: "allocation" },
  { from: "DEFERRED", to: "PLANNED_ALLOCATED", owner: "DISPATCHER", prerequisite: "allocation" },
  { from: "PLANNED_ALLOCATED", to: "LOADING", owner: "LOADER", prerequisite: "loader" },
  { from: "LOADING", to: "EXCEPTION_REPORTED", owner: "DISPATCHER", prerequisite: "none" },
  { from: "LOADING", to: "LOADED", owner: "LOADER", prerequisite: "loader" },
  { from: "LOADED", to: "DISPATCHED", owner: "DISPATCHER", prerequisite: "none" },
  { from: "DISPATCHED", to: "DELIVERED", owner: "DRIVER", prerequisite: "delivery" },
  { from: "DELIVERED", to: "RECEIPT_CONFIRMED", owner: "STORE_MANAGER", prerequisite: "receipt" },
];

export async function transitionOrder(input: {
  actor: OrderActor;
  orderId: string;
  to: string;
  now: Date;
  store: OrderStore;
  command?: Record<string, unknown>;
}): Promise<OrderResult> {
  if (input.command !== undefined && hasProhibitedField(input.command)) {
    return failure("invalid_input");
  }
  if (!isOrderStatus(input.to)) {
    return failure("invalid_input");
  }
  let order;
  try {
    order = await input.store.findById(input.orderId);
  } catch {
    return failure("persistence_failure");
  }
  if (order === null) {
    return failure("not_found");
  }
  const edge = transitions.find((candidate) => candidate.from === order.status && candidate.to === input.to);
  if (edge === undefined) {
    return failure("invalid_transition");
  }
  let facts: OrderTransitionFacts;
  try {
    facts = await input.store.findTransitionFacts(order.id);
  } catch {
    return failure("persistence_failure");
  }
  const denied = authorizeTransition(input.actor, order.outletId, edge.owner, edge.prerequisite, facts);
  if (denied !== null) {
    return failure(denied);
  }
  try {
    const updated = await input.store.compareAndSetStatus({
      id: order.id,
      expected: order.status,
      next: input.to,
      submittedAt: input.to === "SUBMITTED" ? input.now : null,
    });
    if (updated === null) {
      const current = await input.store.findById(order.id);
      return failure(current === null ? "not_found" : "concurrency_conflict");
    }
    return { ok: true, order: updated };
  } catch {
    return failure("persistence_failure");
  }
}

function authorizeTransition(
  actor: OrderActor,
  outletId: string,
  owner: TransitionOwner,
  prerequisite: TransitionPrerequisite,
  facts: OrderTransitionFacts,
): OrderDomainCode | null {
  if (owner === "STORE_MANAGER") {
    if (actor.role !== "STORE_MANAGER") {
      return "authorization_failure";
    }
    const outlet = authorizeStoreManagerOutlet({
      role: actor.role,
      assignedOutletIds: actor.assignedOutletIds,
      outletId,
      action: "mutate",
    });
    if (!outlet.allowed) {
      return "object_scope_failure";
    }
  } else if (owner === "DISPATCHER") {
    const dispatcher = authorizeDispatcherOperational({
      role: actor.role,
      target: "order",
      action: "mutate",
    });
    if (!dispatcher.allowed) {
      return "authorization_failure";
    }
  } else if (owner === "LOADER") {
    if (actor.role !== "LOADER") {
      return "authorization_failure";
    }
    if (facts.loaderUserIds.length === 0) {
      return "prerequisite_missing";
    }
    if (!facts.loaderUserIds.includes(actor.userId)) {
      return "object_scope_failure";
    }
  } else if (actor.role !== "DRIVER") {
    return "authorization_failure";
  } else if (facts.deliveryDriverUserIds.length === 0) {
    return "prerequisite_missing";
  } else if (!facts.deliveryDriverUserIds.includes(actor.userId)) {
    return "object_scope_failure";
  }
  return missingPrerequisite(prerequisite, facts);
}

function missingPrerequisite(
  prerequisite: TransitionPrerequisite,
  facts: OrderTransitionFacts,
): OrderDomainCode | null {
  if (prerequisite === "allocation" && facts.tripStopCount < 1) {
    return "prerequisite_missing";
  }
  if (prerequisite === "deferral" && (facts.deferralCount < 1 || facts.tripStopCount !== 0)) {
    return "prerequisite_missing";
  }
  if (prerequisite === "receipt" && facts.deliveryDriverUserIds.length === 0) {
    return "prerequisite_missing";
  }
  return null;
}

function isOrderStatus(value: string): value is OrderStatusName {
  return orderStatuses.some((status) => status === value);
}

function hasProhibitedField(command: Record<string, unknown>): boolean {
  return prohibitedCommandFields.some((field) => Object.prototype.hasOwnProperty.call(command, field));
}

function failure(code: OrderDomainCode): OrderResult {
  return { ok: false, code };
}
