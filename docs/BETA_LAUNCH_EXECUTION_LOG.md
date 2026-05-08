# BETA_LAUNCH_EXECUTION_LOG.md - Beta Launch Execution Log

## Purpose

Use this document as the operator-owned execution record for beta launch readiness. It records evidence and human decisions for staging or beta mode only. It does not approve production deploy, real Email or LINE sends, real payment charging, production alert providers, production secrets, or Swiss Ephemeris production activation.

## Execution summary

```text
Release candidate branch:
Release candidate commit:
Release candidate tag placeholder:
Execution date/time:
Operator:
Release owner:
Engineering owner:
Security/privacy owner:
Payment owner:
LINE/email owner:
Astro/license owner:
Support owner:
Rollback owner:
Environment mode: local / staging / production-not-enabled
Provider mode: sandbox / mock / dry-run / approved-staging-test / no-go
Astro engine mode: mock / approved-non-production-swisseph / no-go
Payment mode: mock / approved-staging-test / no-go
Notification mode: disabled / dry_run / approved-staging-enabled / no-go
Decision status: pending / go / no-go
```

## Pre-launch checks

Record command output summaries, not secrets or raw provider payloads.

```text
[ ] pnpm install
[ ] pnpm lint
[ ] pnpm typecheck
[ ] pnpm test
[ ] cd services/astro-calc && python3 -m pytest
[ ] cd services/astro-calc && python3 -m ruff check .
[ ] cd services/astro-calc && python3 -m mypy .
[ ] git diff --check
[ ] No .env file committed
[ ] No production secrets committed
[ ] No ephemeris binaries committed
[ ] No runtime ephemeris downloads required
[ ] No real provider calls occurred in tests
[ ] Codex review has no unresolved P0/P1 or critical P2 findings
Evidence notes:
```

## Environment checks

```text
[ ] Local/mock mode works without production secrets
[ ] Staging mode uses sandbox/mock/dry-run provider modes unless explicitly approved
[ ] Production mode is not enabled by accident
[ ] ENABLE_REAL_EMAIL_SENDS=false unless human-approved staging/test send
[ ] ENABLE_REAL_LINE_SENDS=false unless human-approved staging/test send
[ ] ENABLE_REAL_PAYMENT_PROVIDER=false unless human-approved staging/test payment validation
[ ] ENABLE_PROVIDER_DRY_RUN=true unless approved provider-specific staging/test call
[ ] REQUIRE_PROVIDER_ACTIVATION_APPROVAL is recorded for any real-provider path
[ ] Swiss Ephemeris production mode is disabled unless professional license and ephemeris path are approved
[ ] Payment provider guard blocks incomplete config and client-side success activation
[ ] LINE and Email guardrails block real sends without explicit flags and complete config
[ ] Health/status output contains modes and sanitized codes only
Accepted warnings:
```

## Smoke test execution

Use this as the execution ledger for `docs/BETA_SMOKE_TESTS.md` and `docs/SMOKE_TEST_CHECKLIST.md`.

| Area | Evidence | Status | Owner | Notes |
| --- | --- | --- | --- | --- |
| User onboarding |  | pending |  |  |
| Birth profile creation |  | pending |  |  |
| Unknown birth time flow |  | pending |  |  |
| Content generation |  | pending |  |  |
| Content preview and approval |  | pending |  |  |
| Subscription entitlement |  | pending |  |  |
| Notification scheduling |  | pending |  |  |
| Email dry-run |  | pending |  |  |
| LINE dry-run |  | pending |  |  |
| Payment webhook mock |  | pending |  |  |
| Privacy export |  | pending |  |  |
| Birth profile deletion |  | pending |  |  |
| Account deletion/deactivation |  | pending |  |  |
| Monitoring redaction |  | pending |  |  |
| Rollback rehearsal |  | pending |  |  |

Stop and mark no-go if any smoke evidence contains secrets, raw email addresses, raw LINE user IDs, birth data, raw payment payloads, card data, ephemeris paths, license data, or production credentials.

## Provider activation status

```text
Email real send status: disabled / approved-staging-test / no-go
LINE real send status: disabled / approved-staging-test / no-go
Payment real provider status: disabled / approved-staging-test / no-go
Astro production ephemeris status: disabled / approved-non-production-validation / no-go
Alert provider status: mock / approved-staging-test / no-go
```

Provider-specific notes:

```text
[ ] Email real sends are disabled unless explicitly approved
[ ] LINE real sends are disabled unless explicitly approved
[ ] Payment real provider is disabled unless explicitly approved
[ ] Payment webhook ingress containment is documented for rollback
[ ] Astro production ephemeris is disabled unless professional license/path/manifest are approved
[ ] Scheduler trigger/cron/worker/manual runner is stopped unless execution is explicitly approved
[ ] NOTIFICATION_SCHEDULER_MODE is used as validation/status evidence, not as the only kill switch
```

## Rollback execution checklist

Use `docs/ROLLBACK_CHECKLIST.md` and `docs/LAUNCH_DISABLE_SWITCHES.md`.

```text
[ ] Rollback owner assigned
[ ] Last known good commit or deployment artifact recorded
[ ] Real Email sends can be disabled or kept sandboxed
[ ] Real LINE sends can be disabled or kept sandboxed
[ ] Payment checkout can be disabled or kept mock
[ ] Payment webhook ingress can be blocked or signing secret rotated if needed
[ ] Scheduler trigger/worker can be stopped
[ ] Astro engine can be returned to mock for non-production validation
[ ] Beta enrollment pause limitation is understood
[ ] Support communication draft is ready
[ ] Audit logs and monitoring event IDs will be preserved
Rollback target:
```

## Post-launch monitoring execution

Use `docs/POST_LAUNCH_MONITORING_CHECKLIST.md`.

### First 15 minutes

```text
[ ] /api/health checked
[ ] Operator console checked behind admin auth
[ ] No real provider calls without approval
[ ] No secrets or PII in logs, health, alerts, PR comments, or support notes
[ ] Payment, notification, privacy, and admin events show sanitized metadata
```

### First 1 hour

```text
[ ] Payment webhook anomalies reviewed
[ ] Email delivery failures reviewed
[ ] LINE delivery failures reviewed
[ ] Duplicate-send prevention reviewed
[ ] Astro health/config events reviewed
[ ] Content approval backlog reviewed
[ ] Support queue reviewed
```

### First 24 hours

```text
[ ] Privacy export/delete/deactivation events reviewed
[ ] Subscription lifecycle anomalies reviewed
[ ] Beta feedback themes summarized without PII
[ ] Known limitations updated only if docs remain accurate
[ ] Follow-up issues opened for accepted risks
```

## Support and feedback execution checklist

Use `docs/BETA_SUPPORT_AND_FEEDBACK.md`, `docs/BETA_SUPPORT_TEMPLATES.md`, and `docs/BETA_FEEDBACK_GUIDE.md`.

```text
[ ] Support channel ready
[ ] Feedback channel ready
[ ] Support owner available during launch window
[ ] Escalation owner available for payment, deletion, provider, admin, and astro/license issues
[ ] User-facing copy includes entertainment/self-reflection framing
[ ] Feedback instructions exclude raw birth data, full email addresses, raw LINE user IDs, payment payloads, provider payloads, invite codes, tokens, and secrets
[ ] Known limitations are linked for beta users and support
```

## Final execution notes

```text
Blockers:
Risks accepted:
Human approvals recorded:
Decision:
Signed by:
Timestamp:
```
