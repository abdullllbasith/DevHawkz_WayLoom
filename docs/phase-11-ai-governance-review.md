# TASK-11-12 — AI Governance Review

**Review result:** PASS

Reviewed at the decision-support modules in `apps/api/src/ai` and `apps/web/lib/ai-fallback.ts`. No new role, screen, permission, or operational API was added.

## Authority

| Check | Result |
|---|---|
| Deterministic planning remains authoritative | PASS. Planning explanation reads a completed `PlanningResult` and sets `allocationChanged` to false. |
| AI cannot override hard constraints | PASS. A source fact must already be on the planning result. `FUEL_QUOTA` is rejected when the result says `NO_CAPACITY`. |
| AI cannot directly mutate protected domain state | PASS. The modules do not import order, trip, loading, delivery, receipt, or sync stores. |
| Human/role authorization remains authoritative | PASS. The audit human decision stays `not_recorded`. No AI path grants a role. |

## Data

| Check | Result |
|---|---|
| No credentials or tokens enter AI requests | PASS. Input parsing rejects secret-like fields and text. |
| Data minimization is enforced | PASS. Each use accepts only its versioned field list. |
| AI context is server-authoritative and authorization-scoped | PASS. Callers pass server facts. The module does not widen outlet scope. |
| Audit data does not contain unnecessary secrets | PASS. `AI_ASSISTANCE` stores a short summary. A secret summary is refused. The provider key stays off `publicAiSettings`. |

## Reliability

| Check | Result |
|---|---|
| Provider failure degrades safely | PASS. Unavailable, timeout, and rate limit return a controlled code and the supplied facts. |
| Malformed output is rejected | PASS. `validateAdvisory` is the shared boundary. |
| Core workflows continue when AI is unavailable | PASS. Domain modules do not import `ai`. Default settings leave the provider disabled. |

## Explainability and integrity

| Check | Result |
|---|---|
| Generated explanations do not invent operational facts | PASS. Ungrounded source facts and a personal diagnosis fall back to the supplied record. |
| Planning explanations use actual planning results/reason codes | PASS. |
| Material AI assistance is auditable | PASS. Accepted and rejected advisories append `AI_ASSISTANCE`. |
| Human decisions remain distinguishable from AI recommendations | PASS. `humanDecision` is `not_recorded` on the AI row. |

## Scope

| Check | Result |
|---|---|
| No new role, screen, or autonomous workflow | PASS. The web change is the fallback message only. |
| No parallel planning engine | PASS. |
| No second source of truth | PASS. Insights repeat caller-supplied counts. |

**Blockers:** none.
