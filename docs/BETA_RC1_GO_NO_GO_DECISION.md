# BETA_RC1_GO_NO_GO_DECISION.md - Beta RC1 Go/No-Go Decision

## Purpose

Record the human go/no-go decision for `beta-rc-1`. This document is the final
decision template for RC1 staging or beta launch readiness. It does not approve
production deploy, production secrets, real provider activation, payment
charging, real Email or LINE campaigns, or Swiss Ephemeris production use.

## Decision header

```text
Release tag: beta-rc-1
Tag target commit: 92bbeb7af02f75c35ed8a73785d0360968ab5ce3
Decision date/time:
Environment:
Release owner:
Engineering owner:
Security/privacy owner:
Payment owner:
LINE/email owner:
Astro/license owner:
Support owner:
Rollback owner:
Approved beta audience:
Decision: pending / go / no-go
```

## Required evidence links

```text
[ ] docs/BETA_RC1_EXECUTION_RESULTS.md is filled for the launch window
[ ] docs/BETA_RC1_SMOKE_TEST_RESULTS.md has evidence for required RC1 smoke rows
[ ] docs/BETA_LAUNCH_EXECUTION_LOG.md has the operator execution record
[ ] docs/STAGING_DRY_RUN_RESULTS.md has dry-run evidence
[ ] docs/BETA_GO_NO_GO_EXECUTION_RECORD.md has human approval fields or is superseded by this RC1 decision record
[ ] docs/FINAL_GO_NO_GO_CHECKLIST.md has final checklist evidence or is linked here
[ ] docs/ROLLBACK_CHECKLIST.md has owner and rollback target evidence
```

## Go conditions

Mark go only if every required condition is true or explicitly waived by the
human owner with a beta-scope explanation.

```text
[ ] pnpm install passed
[ ] pnpm lint passed
[ ] pnpm typecheck passed
[ ] pnpm test passed
[ ] Astro pytest passed
[ ] Astro ruff passed
[ ] Astro mypy passed
[ ] git diff --check passed
[ ] Codex review has no unresolved P0/P1 or critical P2 findings
[ ] No .env file is committed
[ ] No production secret is committed
[ ] No ephemeris binary is committed
[ ] No runtime ephemeris download is required
[ ] No real provider call occurred in tests
[ ] Provider modes are mock/sandbox/dry-run unless explicitly approved for staging/test
[ ] Real Email, LINE, and Payment activation flags are disabled unless explicitly approved
[ ] Provider dry-run status is sanitized and does not expose secrets
[ ] Payment webhook signature and idempotency evidence is accepted
[ ] Client-side payment success cannot activate entitlement
[ ] Notification duplicate-send prevention and suppression evidence is accepted
[ ] Scheduler trigger/cron/worker/manual runner state is known and controllable
[ ] Privacy export, birth profile deletion, account deletion, deactivation, unsubscribe, and suppression paths are accepted
[ ] Content safety, unknown birth time warning, and admin approval gate are accepted
[ ] Monitoring redaction is verified for logs, health, alerts, audit notes, and support notes
[ ] Rollback owner, rollback target, and disable switches are recorded
[ ] Support owner and feedback path are ready
[ ] Known limitations are accepted and user-facing copy remains entertainment/self-reflection oriented
```

## No-go conditions

Any checked item below blocks RC1 go unless the human owner records a narrower
beta scope that removes the affected path from launch.

```text
[ ] Any unresolved P0/P1 or critical P2 finding remains
[ ] Any production secret or .env file is committed
[ ] Any ephemeris binary is committed
[ ] Any real Email, LINE, payment, alert, or webhook provider call occurs in tests
[ ] Real provider mode is requested without complete config, explicit flags, dry-run evidence, and human approval
[ ] Payment webhook signature verification or idempotency is uncertain
[ ] Client-side payment success can activate entitlement
[ ] Webhook payload can override stored checkout user or plan binding
[ ] Duplicate notification or duplicate receipt risk is unresolved
[ ] Deleted, deactivated, unsubscribed, or non-entitled users can receive content
[ ] Content approval can be bypassed in beta approval mode
[ ] Unsafe horoscope claims, medical/legal/financial advice, death/accident predictions, or guaranteed outcomes are present
[ ] Unknown birth time warning is not surfaced
[ ] Raw PII, birth data, payment payloads, card data, provider payloads, ephemeris paths, license data, tokens, or secrets appear in logs, health, alerts, audit, PR comments, or support notes
[ ] Rollback owner or rollback target is missing
[ ] Scheduler rollback relies only on NOTIFICATION_SCHEDULER_MODE without stopping the actual trigger/worker
[ ] Payment rollback leaves signed provider webhook retries able to mutate state without containment
[ ] Swiss Ephemeris production mode is enabled without professional license, approved ephemeris path, manifest, and human approval
[ ] Beta enrollment cannot be limited or paused for the approved audience
```

## Human approvals

| Approval area | Owner | Decision | Evidence | Notes |
| --- | --- | --- | --- | --- |
| Release |  | pending |  |  |
| Engineering |  | pending |  |  |
| Security/privacy |  | pending |  |  |
| Payment |  | pending |  |  |
| LINE/email |  | pending |  |  |
| Astro/license |  | pending |  |  |
| Support |  | pending |  |  |
| Rollback |  | pending |  |  |

## Accepted risks and blockers

```text
Accepted risks:
Blockers:
Scoped-out smoke tests:
Required follow-up issues:
Known limitations accepted:
Provider modes accepted:
Astro mode accepted:
Beta audience accepted:
```

## Rollback readiness

```text
[ ] Disable real Email sends or keep sandboxed
[ ] Disable real LINE sends or keep sandboxed
[ ] Disable payment provider or keep mock
[ ] Block payment webhook ingress at the provider dashboard, edge gateway, deployment route, or rotate/remove the webhook signing secret if signed retries may still reach the app
[ ] Disable scheduler trigger/cron/worker/manual runner
[ ] Set NOTIFICATION_SCHEDULER_MODE=disabled or dry_run for status evidence
[ ] Switch ASTRO_ENGINE=mock/prototype for non-production validation rollback
[ ] Disable or pause beta enrollment where supported
[ ] Preserve audit logs and monitoring event IDs
[ ] Notify beta users with approved support wording
Rollback owner:
Rollback target:
Support channel:
```

## Final decision

```text
Decision: pending / go / no-go
Approved beta audience:
Launch tag: beta-rc-1
Provider modes accepted:
Astro mode accepted:
Known limitations accepted:
Accepted risks:
Blockers:
Signed by:
Timestamp:
```
