# AI service boundary

WayLoom AI is decision support. It is not a Dispatcher and it is not a required step in order, planning, loading, delivery, receipt, or sync.

Deterministic domain and planning code remains authoritative for feasibility, hard constraints, allocation, state transitions, and transactions. A human role still decides. An AI outage leaves those workflows usable.

## Allowed

- Explain a completed planning result, including served and deferred orders and the constraint or deferral reason already on that result.
- Explain an approved exception from its stored category and details.
- Surface a decision-support insight from counts the server already derived from operational records.
- Recommend or explain an action without committing a protected change.

## Forbidden

- Replacing hard-constraint validation or the planning engine.
- Writing orders, trips, loading, delivery, proof, receipts, deferrals, exceptions, or authorization.
- Assigning a vehicle, deferring an order, or reordering a route.
- Inventing an operational fact, reason code, or measurement.
- Reading credentials, session tokens, or other secrets.
- Adding a role, screen, or workflow.

The provider, when configured, is called only after the deterministic result exists. Provider failure returns a bounded fallback built from those facts. It does not change them.

No AI route is part of this boundary. Existing APIs stay the only way to change operational state.
