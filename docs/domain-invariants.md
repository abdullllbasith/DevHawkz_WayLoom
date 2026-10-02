# Domain invariants

This catalogue is the server-side contract for orders, planning, trips, loading, delivery, receipt, deferral, exceptions, and synchronization. Later domain services, state guards, APIs, and tests enforce these rules. This document does not implement them.

The user interface is not an enforcement layer. A rule is enforced by the database, a domain service, a state-transition guard, API authorization, the planning engine, a sync processor, or a transaction. One rule may be checked in more than one of those places.

The approved order lifecycle is the schema enum `order_status`:

```text
Draft
 ↓ submit
Submitted
 ↓ dispatcher review/close
Confirmed
 ├→ Deferred → next run/re-plan
 ↓ planning
Planned / Allocated
 ↓
Loading
 ├→ Exception Reported
 ↓
Loaded
 ↓
Dispatched
 ↓
Delivered
 ↓
Receipt Confirmed
```

`Draft → Submitted` belongs to the Store Manager. `Submitted → Confirmed` and `Confirmed → Planned / Allocated` belong to the Dispatcher and planning workflow. `Planned / Allocated → Loading` belongs to the Loader workflow. `Loaded → Dispatched` is operational. `Dispatched → Delivered` belongs to the Driver. `Delivered → Receipt Confirmed` belongs to the Store Manager. The schema enum does not grant permission to make a transition.

Trip allocation status is only `PLANNED` or `CONFIRMED`. Deferral has no status field. Loading has no status enum. Delivery outcome is text because no outcome list is approved. Proof of delivery is evidence for a delivery, not a requirement for every outcome.

## Unresolved gaps

These gaps stay open. They are not filled by a new rule.

- The cutoff timezone is not approved. `submitted_at` is the timestamp that later eligibility uses. No `planning_eligible` column is added. Eligibility is not calculated until the timezone is approved.
- The production `delivery_id` format is not approved. The development seed identifier does not define it. `delivery_id` remains unique.
- An order may have more than one `trip_stops` row in the current database. The whole-order rule is a domain and planning rule. This catalogue does not add a uniqueness constraint.
- `exceptions` has no approved context foreign key. Store Manager, Driver, and Loader access fails closed. Dispatcher operational scope includes an exception by role. No context column, severity, or exception status is added.
- A sync conflict policy is not approved. `client_event_id` is unique, and the sync payload is not stored. No overwrite rule is added.
- Transaction boundaries are defined here and implemented by TASK-04-14.

## Catalogue

| ID | Domain | Rule | Enforcement | Severity | Verification |
|---|---|---|---|---|---|
| INV-ORD-001 | Order | `delivery_id` is the unique business identity of one order. The internal `id` is a separate UUID. | Database | HIGH | A second order with the same `delivery_id` is rejected. |
| INV-ORD-002 | Order | An order references an existing outlet through `outlet_id`. Brand, district, and depot stay on that outlet and are not editable order columns. | Database, domain service | HIGH | An unknown outlet is rejected. A payload that supplies brand, district, or depot does not change the outlet. |
| INV-ORD-003 | Order | `order_units`, `order_weight_kg`, and `order_volume_m3` are separate and must be greater than zero. No maximum is added. | Database | HIGH | Zero and negative quantities are rejected. |
| INV-ORD-004 | Order | Temperature is only `chilled` or `ambient`. | Database | HIGH | A value outside those two tokens is rejected. |
| INV-ORD-005 | Order | Status is only a value in `order_status`. | Database, state-transition guard | HIGH | An unknown status is rejected. |
| INV-ORD-006 | Order | A Store Manager submission moves `Draft` to `Submitted` and preserves the original `submitted_at`. Later steps do not overwrite that timestamp. | State-transition guard | HIGH | Submit succeeds from `Draft`. A later planning step leaves `submitted_at` unchanged. |
| INV-ORD-007 | Order | An order is not `Confirmed` before it has been `Submitted`. | State-transition guard | HIGH | `Draft` to `Confirmed` fails. |
| INV-ORD-008 | Order | Planning eligibility uses `submitted_at` and the cutoff rule: before cutoff, the order may be eligible for next-day planning; after cutoff, it follows the following planning run. | Planning engine | HIGH | Two submitted orders on opposite sides of the cutoff are classified only after the timezone gap is resolved. Until then, eligibility is not stored. |
| INV-PLAN-001 | Planning | A confirmed allocation satisfies every hard constraint or it is not confirmed. A violation is not downgraded to a warning. | Planning engine | CRITICAL | Each violated constraint below produces no confirmed trip for that order. |
| INV-PLAN-002 | Planning | A `chilled` order requires a reefer-capable vehicle. An `ambient` order may use an ambient or reefer vehicle. | Planning engine | CRITICAL | A chilled order on a non-reefer vehicle is not allocated. The deferral reason is `NO_REEFER`. |
| INV-PLAN-003 | Planning | A van-only outlet requires a van. | Planning engine | CRITICAL | Another vehicle type is not allocated. The deferral reason is `VAN_ACCESS`. |
| INV-PLAN-004 | Planning | Weight and volume are checked separately against `weight_cap_kg` and `volume_cap_m3`. | Planning engine | CRITICAL | An order that fits one capacity and exceeds the other is not allocated. The deferral reason is `NO_CAPACITY`. |
| INV-PLAN-005 | Planning | The vehicle depot must be compatible with the outlet depot. | Planning engine | CRITICAL | A mismatched depot is not allocated. The deferral reason is `DEPOT_MISMATCH`. |
| INV-PLAN-006 | Planning | One trip carries one outlet brand and one district. | Planning engine | CRITICAL | Stops from two brands or two districts are not placed on the same trip. |
| INV-PLAN-007 | Planning | A planned arrival stays inside the outlet delivery window. Windows are hard. | Planning engine | CRITICAL | An arrival outside the window is not allocated. The deferral reason is `WINDOW_CONFLICT`. |
| INV-PLAN-008 | Planning | Trip time is `depot_to_district_freeflow_min + inter_stop_freeflow_min × (orders - 1) +` the sum of `service_allowance_min(brand, dock_type)`. Traffic speed and road conditions are not inputs. | Planning engine | CRITICAL | A trip over the time budget is not allocated. The deferral reason is `TIME_BUDGET`. A missing traffic or road file does not change the result. |
| INV-PLAN-009 | Planning | Fuel used is `trip_distance_km / vehicle.km_per_l`, compared with the vehicle weekly fuel quota. The calculation does not replace `km_per_l` or `weekly_fuel_quota_l`. | Planning engine | CRITICAL | Usage above the remaining weekly quota is not allocated. The stored vehicle efficiency is unchanged. |
| INV-PLAN-010 | Planning | A vehicle has at most two trips on one operational date. `trip_number` is `1` or `2`. | Database, planning engine | CRITICAL | A third trip for the same vehicle and date is rejected. |
| INV-PLAN-011 | Planning | Operating days are Monday through Saturday. Sunday operation is not added. | Planning engine | HIGH | A Sunday operational date is not planned. |
| INV-PLAN-012 | Planning | An order that cannot be allocated stays unallocated with one approved deferral reason. It is not forced onto a trip. | Planning engine, domain service | HIGH | The order has a `deferrals` row and no confirmed trip stop. |
| INV-PLAN-013 | Planning | One order is allocated to one vehicle and one trip. It is not split. | Planning engine, domain service | CRITICAL | A second trip stop for an order that already has an allocation is rejected. |
| INV-TRIP-001 | Trip | A trip has one operational date, one depot, and one existing vehicle. | Database | HIGH | A trip without a vehicle is rejected. |
| INV-TRIP-002 | Trip | `route_id` is the route identifier. `seq_in_route` is the 0-based stop sequence. They are not interchangeable. | Domain service | HIGH | Setting `route_id` from a sequence number is rejected. |
| INV-TRIP-003 | Trip | Stop sequence is unique within the trip and is not negative. | Database | HIGH | A duplicate or negative sequence is rejected. |
| INV-TRIP-004 | Trip | A stop references one existing order. The stop does not copy outlet or vehicle source fields. | Database, domain service | HIGH | An unknown order is rejected. A stop write does not update the outlet. |
| INV-TRIP-005 | Trip | Trip status is only `PLANNED` or `CONFIRMED`. | Database | HIGH | Another trip status is rejected. |
| INV-LOAD-001 | Loading | A loader verifies only a loading record whose `loader_user_id` is that loader. An unassigned task is not verifiable. | API authorization | CRITICAL | Another loader, or a record with no matching loader, is denied. |
| INV-LOAD-002 | Loading | A loading record references one trip stop. Verification does not mark an order on a different stop as loaded. | Database, domain service | HIGH | A load result for a different stop is rejected. |
| INV-LOAD-003 | Loading | Loading does not authorize delivery on a different trip. | Domain service | HIGH | A loaded stop does not create a delivery record for another trip. |
| INV-LOAD-004 | Loading | Shortfall units stay on the loading record. They are not discarded. There is no loading status enum. | Domain service, database | HIGH | A shortfall leaves `shortfall_units` and does not delete the record. Negative units are rejected. |
| INV-DEL-001 | Delivery | A driver reaches a trip only through the vehicle assigned by `vehicles.driver_user_id`. A null vehicle driver fails closed. | API authorization | CRITICAL | A driver assigned to another vehicle is denied. A vehicle with no driver is denied. |
| INV-DEL-002 | Delivery | A delivery record is submitted only by the driver in `delivery_records.driver_user_id`, for that trip stop. | API authorization, domain service | CRITICAL | Another driver's request is denied. |
| INV-DEL-003 | Delivery | A delivery outcome references the trip stop. It is not recorded from `Draft` or another state before `Dispatched`. | State-transition guard, database | HIGH | A delivery for a `Draft` order is rejected. |
| INV-DEL-004 | Delivery | `Delivered` does not return to `Planned / Allocated` or an earlier state. | State-transition guard | CRITICAL | That backward transition is rejected. |
| INV-DEL-005 | Delivery | Proof of delivery references its delivery record. An empty evidence reference is rejected. A delivery outcome does not require a proof. | Database, domain service | HIGH | An outcome with no proof is kept. A blank evidence reference is rejected. |
| INV-DEL-006 | Delivery | Delivery outcome stays text. No outcome list is added. | Domain service | HIGH | A service that requires an unlisted outcome token is not part of this contract. |
| INV-REC-001 | Receipt | Receipt confirmation references one existing delivery record and cannot precede that delivery. | Database, domain service | CRITICAL | A receipt for an unknown or not-yet-delivered order is rejected. |
| INV-REC-002 | Receipt | One current receipt exists per delivery record. | Database | HIGH | A second receipt for the same delivery is rejected. |
| INV-REC-003 | Receipt | Store Manager outlet scope uses `user_outlets`. `receipts.store_manager_user_id` and `orders.created_by_user_id` do not authorize outlet access. | API authorization | CRITICAL | A manager assigned to another outlet is denied even when named on the receipt or order. |
| INV-REC-004 | Receipt | Issue details do not rewrite the delivery outcome, and confirmation does not change outlet or vehicle source facts. | Domain service | HIGH | After confirmation, the delivery outcome and outlet row are unchanged. |
| INV-REC-005 | Receipt | `Receipt Confirmed` does not return to a pre-delivery state. | State-transition guard | CRITICAL | A move back to `Dispatched`, `Loaded`, or `Planned / Allocated` is rejected. |
| INV-DEF-001 | Deferral | A deferral references the order it explains. | Database | HIGH | A deferral with an unknown order is rejected. |
| INV-DEF-002 | Deferral | The reason is only `NO_CAPACITY`, `NO_REEFER`, `VAN_ACCESS`, `WINDOW_CONFLICT`, `DEPOT_MISMATCH`, or `TIME_BUDGET`. | Database | HIGH | Another reason is rejected. |
| INV-DEF-003 | Deferral | A deferral does not describe an order as successfully allocated. Re-planning does not delete earlier deferral rows. There is no deferral status. | Domain service | HIGH | An allocated order is not given a success deferral. A later plan leaves the old deferral row in place. |
| INV-EXC-001 | Exception | An exception has no approved operational context foreign key. Store Manager, Driver, and Loader access fails closed. Dispatcher operational scope includes it by role. | API authorization | CRITICAL | Those three roles are denied. A client-supplied order or trip id does not grant access. |
| INV-EXC-002 | Exception | Recording an exception does not itself change the order, delivery, or receipt, and it adds no severity or status. | Domain service | HIGH | The underlying row is unchanged after the exception is stored. |
| INV-SYNC-001 | Sync | `client_event_id` is unique and not blank. The same client event is not applied twice. | Database, sync processor | CRITICAL | A replay does not create a second delivery or proof. |
| INV-SYNC-002 | Sync | A sync row is a reconciliation record. The business record remains the delivery or proof. The event type is only `delivery outcome` or `proof of delivery`. | Database, sync processor | HIGH | Applying a sync row without the domain write does not count as delivery. Another event type is rejected. |
| INV-SYNC-003 | Sync | The sync payload is not stored. An invalid or stale event does not bypass authorization, and no unapproved conflict rule overwrites server state. | Sync processor, API authorization | CRITICAL | A sync request with another user's identity is denied. Server delivery text is not replaced by an unapproved client copy. |
| INV-AUTH-001 | Authorization | Domain operations take the actor from the server session. Client actor, role, outlet, driver, and loader identifiers are not authorization inputs. | API authorization, domain service | CRITICAL | A body or header that names another user does not change the actor. |
| INV-AUTH-002 | Authorization | Store Manager scope is `user_outlets`. Loader scope is `loading_records.loader_user_id`. Driver route scope is `vehicles.driver_user_id`. Driver delivery scope is `delivery_records.driver_user_id`. Dispatcher scope is the approved operational targets. | API authorization | CRITICAL | Each wrong-scope request is denied before the mutation. |
| INV-SRC-001 | Source data | Planning and operations do not update `outlets`, `vehicles`, or the competition source tables. Conflicting source imports write nothing. | Domain service | CRITICAL | A confirmed allocation leaves outlet, vehicle, and source rows unchanged. |
| INV-SRC-002 | Source data | Trip time, fuel used, and planning eligibility are derived. They are not written back as source columns. Datathon files are not a runtime input. | Planning engine, domain service | HIGH | After a planning calculation, source columns still hold the imported tokens. |
| INV-STATE-001 | State | The only forward order path is the approved lifecycle above, including `Deferred` toward a later run and `Exception Reported` from `Loading`. | State-transition guard | CRITICAL | `Draft` to `Delivered` fails. `Loading` may enter `Exception Reported`. |
| INV-STATE-002 | State | A confirmed allocation is not silently replaced by a different allocation. A change uses the approved re-plan or reconfirmation flow. Loading completion does not move an order backward. | Domain service, state-transition guard | HIGH | Replacing the vehicle on a confirmed trip without that flow is rejected. |
| INV-AUD-001 | Audit | The audit actor is the server user. Business mutations do not choose another actor. Audit rows do not store passwords, hashes, session identifiers, cookies, or CSRF tokens. | API authorization, domain service | CRITICAL | A client actor id is absent from the stored audit actor. A known password is absent from the audit row. |
| INV-TXN-001 | Transaction | Confirming an allocation commits the intended trip and stops together, or commits none of them. | Transaction | CRITICAL | A failure while writing the second stop leaves no confirmed partial trip. |
| INV-TXN-002 | Transaction | Receipt confirmation does not partially update an unrelated order, trip, or delivery. | Transaction | HIGH | A failed receipt leaves a different order's delivery unchanged. |
| INV-TXN-003 | Transaction | A sync event is recorded as processed only when its domain mutation commits. A duplicate event does not create a second domain row. | Transaction, database | CRITICAL | A failed delivery write leaves the client event unprocessed. A replay does not insert a second delivery. |

Severity uses CRITICAL where a broken rule would allocate infeasibly, deliver another person's work, apply a sync event twice, or accept a client actor. HIGH covers the remaining lifecycle and lineage rules. No rule in this catalogue is enforced only by the user interface.
