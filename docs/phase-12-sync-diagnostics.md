# TASK-12-07 — Sync Diagnostics

**Result:** PASS

`sync.batch` is written after `applySyncBatch` returns. It counts `applied`, `already applied`, `temporary server failure`, and the remaining rejected results. It keeps each `clientEventId` and the active correlation id. It does not store credentials, and it does not decide whether an event applies.

`client_event_id` remains the Phase 9 idempotency key. The correlation id is only a trace. A diagnostic write failure does not change the batch response. The classification is covered by `diagnostics.test.ts`.
