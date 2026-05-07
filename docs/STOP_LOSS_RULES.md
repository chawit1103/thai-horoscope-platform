# Stop-Loss Rules for AI Coding Loops

This project uses AI heavily, but AI review/fix loops must not consume unlimited time.

## Core rule

```text
If a PR enters more than 2 review/fix loops, stop narrow patching.
```

Then:

```text
1. Stop using @codex fix.
2. Use Codex App local or Claude Code for a full-module hardening pass.
3. Use Codex GitHub only as reviewer.
4. If still failing, split the PR or reduce scope.
```

## Why

Narrow patching causes this pattern:

```text
review finds issue A
fix A creates issue B
fix B reveals issue C
fix C creates edge case D
```

For critical modules, this is expensive and risky.

## High-risk modules

Apply stop-loss aggressively for:

```text
- admin auth
- privacy export/delete
- email gateway
- LINE gateway
- payment provider
- subscription lifecycle
- notification scheduler
- astro calculation engine
- webhook handling
- audit logging
```

## Stop immediately if Codex introduces these regressions

```text
- fail-open security behavior
- hardcoded secrets
- caller-controlled authorization
- real provider calls in tests
- PII logging
- raw webhook/payment payload logging
- duplicate-send risk
- entitlement bypass
- delete/export cross-user leak
- production license bypass
```

## Escalation policy

### After 1 failed review loop

Codex App may fix locally with targeted prompt.

### After 2 failed review loops

Run a full hardening pass:

```text
- inspect the entire module
- define invariants
- add regression tests for each invariant
- search for adjacent risk patterns
- run full tests
```

### After 3 failed review loops

Split the PR:

```text
- merge safe docs/contracts first
- move risky runtime logic to smaller PR
- open follow-up for non-blocking P2 findings
```

## When P2 can be deferred

P2 may be deferred only if all are true:

```text
- not security/privacy/payment/user-facing delivery related
- no data loss or duplicate-send risk
- no entitlement bypass
- no PII/secret exposure
- documented as follow-up issue
```

P2 must not be deferred if it touches:

```text
- payment idempotency
- auth/session
- deletion/export
- email/LINE sending
- webhook signature
- audit partitioning
- calculation audit/replay
```
