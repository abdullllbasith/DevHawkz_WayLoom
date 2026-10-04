# TASK-13-04 — Four-Role End-to-End Test

**Review result:** PASS

`lifecycle.test.ts` walks one order through store create and submit, dispatcher confirm and allocation, loader verification, dispatcher dispatch, driver delivery and proof, and store receipt. The order id stays the same. A loader cannot dispatch. AI settings stay disabled.

The same suite covers a repeated sync event as `already applied` in `sync-batch.test.ts`. The live seed order `SEED-2026-06-02-OUT001` was already taken through that journey on `wayloom_test` and remains `RECEIPT_CONFIRMED`. The seed does not rewind it. This review did not create a second lifecycle or reset that database.
