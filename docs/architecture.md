# Architecture

Detailed architecture documentation will be written by later tasks, after the corresponding services exist.

This file does not describe an implemented system.

Source, derived, and operational lineage is recorded in `docs/data-model.md`. That section is the lineage record. This file does not restate it.

The approved `sessions` table is recorded in `docs/data-model.md`. The server session lifetime is exactly 12 hours from creation, and the session cookie `SameSite` value is `Strict`. The session mechanism is implemented in the API security module. Login, logout, and the four-role check are implemented on that module. Object-level authorization, CSRF, and rate limiting are separate tasks.
