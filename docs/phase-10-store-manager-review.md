# TASK-10-06 — Store Manager Review

**Review result:** BLOCKED

The four Store Manager areas exist and stay inside the approved order, tracking, and receipt contracts. The seeded Store Manager cannot complete the journey, and issue reporting through exceptions is not authorized.

## Screen fidelity

- Store Dashboard, Create Order, Order Confirmation and Tracking, and Confirm Receipt and Report Issues are the only Store Manager areas.
- Messages, support, item lines, photos, signatures, inventory updates, and invented ETAs are not screens in this implementation.
- Vehicle, route, and arrival stay `—` because the order response does not include them.

## Workflow continuity

- Create and submit call the existing `POST /api/orders` and `POST /api/orders/:id/submit` routes. The client does not calculate cutoff eligibility and does not call dispatcher confirm.
- Tracking reads `GET /api/orders` and `GET /api/orders/:id` and labels `SUBMITTED`, `PLANNED_ALLOCATED`, `DELIVERED`, `RECEIPT_CONFIRMED`, and `DEFERRED` from the server status.
- Receipt confirmation is offered only when the order status is `DELIVERED` and posts `result` plus optional `issueDetails` to `POST /api/orders/:id/receipt`.
- The seeded Store Manager cannot create that order. On 2026-10-04 the local API authenticated `seed.store-manager`, `GET /api/orders` returned an empty list, and create for outlet `OUT001` returned `403 FORBIDDEN`. The dispatcher can read the seeded order `SEED-2026-06-02-OUT001` as `PLANNED_ALLOCATED`. The seed does not insert `user_outlets`.

## Authorization

- Outlet scope remains the server `user_outlets` check. The UI does not grant another outlet.
- `POST /api/exceptions` allows `DISPATCHER` only. `recordException` rejects any other role. A Store Manager post returned `403 FORBIDDEN`.
- No Store Manager exception permission, endpoint, or schema was added.
- Receipt issue details stay on the existing receipt request. They do not change delivery outcome or proof of delivery.

## Data integrity and security

- Order fields shown are the order API fields. Missing brand, district, depot, and temperature render as `—`.
- `submitted_at` is left to the server submit route.
- A second create click is ignored while the first request is in flight. The server also rejects a repeated delivery id.
- Cookie session and `x-wayloom-csrf` are forwarded on create, submit, and receipt. Credentials are not written to browser storage by these screens.

## Responsive behavior

- The shell uses the sidebar at 768px and above and a bottom navigation below that width.
- A live phone-width pass was not completed. The unauthenticated `/store` request redirects to sign-in, which is the expected session gate.

## Required decision

Persist the existing `user_outlets` assignment for `seed.store-manager` and competition outlet `OUT001` in the approved seed, or supply an already assigned outlet. Do not add an outlets API or a Store Manager exception permission in this phase.

**Owning follow-up:** the competition seed scenario that creates `seed.store-manager` without a `user_outlets` row. Exception reporting remains owned by the dispatcher exception route.
