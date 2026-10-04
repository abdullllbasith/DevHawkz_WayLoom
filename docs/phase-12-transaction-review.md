# TASK-12-02 — Transaction Boundary Review

**Review result:** PASS

Each protected multi-record write uses the existing serializable domain transaction. Routes do not open a second transaction. A thrown write rolls back that transaction. A repeated request conflicts instead of inserting another protected row. AI and diagnostics are not inside these transactions.

| Operation | Boundary |
|---|---|
| Order create and submit | One order row. Submit sets status and `submitted_at` in the same compare-and-set. |
| Order confirm | One status change from `SUBMITTED` to `CONFIRMED`. |
| Trip create and confirm | Trip and stops share the trip transaction. A conflict after the status write rolls back. |
| Planning run | Each trip and each deferral uses its own domain transaction. A later failure does not reopen an earlier committed trip. The planning engine result is not a database transaction. |
| Loading verification | Loading row and the `LOADING` then `LOADED` transitions share one transaction. |
| Loading shortfall | Updates the existing loading row in that transaction. |
| Delivery and proof | Delivery row and `DELIVERED`, or the proof row, share the delivery transaction. |
| Receipt | Receipt row and `RECEIPT_CONFIRMED` share one transaction. |
| Exception | One exception row. It does not change the order. |
| Sync batch | Each event is applied in the sync transaction. The same `client_event_id` does not apply twice. |

Representative rollback is covered by `transaction.test.ts`, `trip.test.ts`, `loading.test.ts`, `delivery.test.ts`, `receipt.test.ts`, and `sync-batch.test.ts`. A logging or diagnostic failure is not part of these commits and cannot turn a failed mutation into success.

Database constraints stay in place. Authorization runs before the mutation.
