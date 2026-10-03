import { transitionOrder } from "./order-transition.js";
import type { OrderActor, OrderResult, OrderStore } from "./order.js";

const clientControlledFields = [
  "status",
  "to",
  "from",
  "currentStatus",
  "previousStatus",
  "submittedAt",
  "actorId",
  "actorUserId",
  "role",
  "outletId",
  "tripId",
  "vehicleId",
  "routeId",
  "seqInRoute",
  "loaderUserId",
  "driverUserId",
  "deferralReason",
  "planningEligible",
  "planningResult",
  "dispatchDate",
  "dispatchStatus",
] as const;

export async function guardOrderTransition(input: {
  actor: OrderActor | null;
  orderId: string;
  to: string;
  now: Date;
  store: OrderStore;
  command?: Record<string, unknown>;
}): Promise<OrderResult> {
  if (input.command !== undefined && hasClientControlledField(input.command)) {
    return { ok: false, code: "invalid_input" };
  }
  if (!isAuthenticated(input.actor)) {
    return { ok: false, code: "authorization_failure" };
  }
  return transitionOrder({
    actor: input.actor,
    orderId: input.orderId,
    to: input.to,
    now: input.now,
    store: input.store,
  });
}

function isAuthenticated(actor: OrderActor | null): actor is OrderActor {
  return actor !== null && actor.userId.trim() !== "" && actor.role.trim() !== "";
}

function hasClientControlledField(command: Record<string, unknown>): boolean {
  return clientControlledFields.some((field) => Object.prototype.hasOwnProperty.call(command, field));
}
