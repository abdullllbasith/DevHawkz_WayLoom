# WayLoom Development Definition of Done

This is the only Definition of Done for WayLoom. A task is `COMPLETED` only when the applicable criteria below are satisfied and the required checks were actually run.

This document does not add product requirements or architecture. It applies the rules already approved in:

1. Official Challenge Booklet
2. Submitted WayLoom Designathon documentation
3. WayLoom Hackathon Technical Blueprint v1.4
4. `00_MASTER_TASK_MAP_v1.1.md`
5. `00_PROJECT_RULES.md`
6. The current task

Higher-priority sources win. This Definition of Done must not override the Challenge Booklet, the Designathon submission, or Blueprint v1.4. If sources conflict, stop and ask. Do not silently choose a resolution.

Cursor platform instructions outrank repository instructions. Do not try to override them.

## Universal completion criteria

### Scope

- The task objective is fully implemented.
- Only the approved task scope changed.
- No unrelated feature work was introduced.
- No architecture was silently changed.
- No future task was implemented early.

### Source-of-truth compliance

- The implementation follows the relevant Blueprint v1.4 requirements.
- The implementation follows `00_PROJECT_RULES.md`.
- The implementation follows the current task's acceptance criteria.
- Existing behavior was not changed without a reason.

### Code quality

- Code is readable, with separated responsibilities.
- Types are explicit where appropriate.
- No obvious dead code or unnecessary duplication was introduced.
- No unexplained magic values were introduced.
- No broad workaround was used only to make checks pass.

### Business rules

For domain work:

- Rules are enforced on the server or in the domain layer.
- Invalid state transitions are rejected.
- Authorization is respected.
- Hard planning constraints stay deterministic.
- Frontend-only validation is not sufficient for a critical business rule.

### Designathon fidelity

For UI, workflow, or other user-facing work:

- The result matches the submitted Designathon documentation.
- Approved screens, role boundaries, and the end-to-end workflow stay intact.
- Responsive and device expectations stay intact.
- Designathon terminology is unchanged unless a documented, approved reason exists.
- An intentional deviation is documented and approved.
- No new primary workflow is introduced without approval.

A task is not complete only because the UI works. Designathon continuity must also be verified.

### Security

For security or protected data:

- Authorization is enforced on the server.
- Object-level access is checked where it applies.
- Sensitive information is not exposed.
- Secrets are not committed.
- Authentication and session rules stay intact.
- CSRF protection stays intact where it applies.
- Offline browser storage does not contain authentication or session tokens.
- A security control was not weakened to make the task easier.

### Testing

Add the tests that fit the task. Do not require every test type for every task. Relevant types may include unit, integration, API, planning-constraint, synchronization, end-to-end, security, and responsive or UI checks.

### Verification

Run the required verification commands. Do not claim that tests, build, lint, typecheck, or deployment passed unless that check was run.

### Regression safety

Before completion:

- Run the relevant existing tests.
- Run the relevant build, type, and lint checks.
- Confirm critical existing behavior still works.
- Inspect the changed files.

### Documentation

Update documentation when the change affects a public API contract, architecture, environment configuration, database behavior, security behavior, an operational procedure, or developer setup. Do not document behavior that does not exist.

## Task-type criteria

### BUILD

The implementation exists, acceptance criteria pass, relevant tests pass, relevant static checks pass, and the change stays inside the task.

### DOMAIN

Also verify domain invariants, valid transitions, rejection of invalid transitions, authorization boundaries, and transaction or concurrency effects where they apply.

### API

Also verify request validation, the response contract, authorization, safe errors, status codes, transaction behavior where it applies, and the absence of sensitive data in responses.

### SECURITY

Also verify the required controls, authorization, sensitive-data handling, negative security cases, and that no control was weakened.

### DATA

Also verify source-versus-derived lineage, schema compatibility, deterministic import or seed behavior, data integrity, and confidential-data handling.

### PLANNING

Also verify hard constraints, deterministic feasibility, the known planning fixtures, deferral behavior, constraint explanations where they apply, and fuel, capacity, time, and window rules where they apply.

### OFFLINE

Also verify offline behavior, local persistence, approved offline delivery recording, pending synchronization state, synchronization when connectivity returns under the approved policy, unique client event IDs, idempotent synchronization, reconciliation under the approved conflict policy, retry and failure behavior under that policy, retention of a failed local record, and server-authoritative authorization. Test the offline, reconnect, and synchronization flow. Do not claim automatic retry or automatic synchronization unless that behavior is implemented and verified.

### AI

Also verify the approved AI boundary, structured input and output, deterministic hard-constraint enforcement, safe failure, required explainability, required auditability, and the absence of autonomous authority beyond the approved contract.

### REVIEW

Inspect the relevant implementation, compare it with the source of truth, and document findings, severity, impact, and recommended remediation. Do not modify code unless the task explicitly says to.

### GATE

All required preceding criteria pass, no blocking issue remains, required verification was performed, and the result is recorded as exactly `PASS` or `FAIL`.

## Severity

### BLOCKER

A security vulnerability, data-corruption risk, broken critical workflow, invalid planning allocation, architecture violation, failed critical gate, or loss of authoritative business state. A blocker prevents completion.

### HIGH

A missing important acceptance criterion, a major authorization defect, a missing critical test, a significant regression, or an incorrect business rule. A High issue normally prevents completion unless the project owner explicitly accepts it.

### MEDIUM

Incomplete non-critical validation, a maintainability problem, missing non-critical documentation, or a moderate UX or engineering issue. Fix it before completion when it is inside the task scope.

### LOW

Minor cleanup, a cosmetic documentation issue, or a non-critical refactor opportunity. Do not use Low to hide a functional defect. Do not downgrade a serious issue to pass a gate.

## Checklist

```text
[ ] Objective completed
[ ] Acceptance criteria satisfied
[ ] Scope remained within task boundary
[ ] Blueprint v1.4 respected
[ ] 00_PROJECT_RULES.md respected
[ ] Architecture unchanged unless explicitly approved
[ ] Business rules verified where applicable
[ ] Designathon fidelity verified for UI/workflow tasks where applicable
[ ] Offline/recovery flow verified for offline tasks where applicable
[ ] Security verified where applicable
[ ] Tests added/updated where appropriate
[ ] Required tests executed
[ ] Required build/type/lint checks executed
[ ] Regression checks completed
[ ] Documentation updated where necessary
[ ] Changed files inspected
[ ] No secrets introduced
[ ] No unexplained deviations
[ ] Completion report prepared
```

Skip an item only when it genuinely does not apply, and say why in the completion report. If an applicable category cannot be verified, report `BLOCKED` or `REWORK_REQUIRED`, not `COMPLETED`.

## Completion report

```text
Status:
Objective:
Files changed:
Implementation summary:
Tests run:
Verification commands:
Results:
Security considerations:
Documentation updates:
Deviations:
Known issues:
Next task:
```

Use `COMPLETED`, `BLOCKED`, or `REWORK_REQUIRED`. Do not use `COMPLETED` when a required acceptance criterion failed.

## Dependencies and regression

A task is not complete if it breaks a previously verified dependency.

If a later requirement intentionally changes existing behavior:

1. Identify the dependency.
2. Explain the change.
3. Update the affected tests.
4. Verify downstream behavior.
5. Record the reason.

Do not silently break earlier work.

## Dependency lock

Do not upgrade, downgrade, replace, or remove a dependency for convenience. If a dependency changes, report:

```text
Package:
Previous version:
New version:
Reason:
Compatibility impact:
Verification performed:
```

A dependency change must not replace the approved architecture or add a competing technology.

## Architecture change control

This document does not authorize an architecture change. Stop and escalate under `00_PROJECT_RULES.md` if completion would change the backend, database, authentication, planning service, service boundaries, role model, core state machine, offline strategy, AI authority, or Designathon workflow.

## Cursor behavior

Read the current task, the applicable project rules, and this document. Implement only the approved scope. Test, verify, inspect the changes, and report status. Compilation by itself is not completion.
