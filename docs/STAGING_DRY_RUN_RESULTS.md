# STAGING_DRY_RUN_RESULTS.md - Staging Dry-Run Results

## Purpose

Capture staging or local dry-run evidence before a human beta launch decision. This record is evidence only. It does not deploy, activate production providers, add secrets, charge users, send real messages, or approve production Swiss Ephemeris.

## Dry-run header

```text
Release candidate branch:
Commit:
Tag placeholder:
Environment:
Dry-run date/time:
Operator:
Dry-run command:
Dry-run status: pending / pass / fail
Provider modes:
Notification scheduler mode:
Astro engine/profile:
Payment mode:
Accepted warnings:
Result:
```

## Required commands

```text
[ ] pnpm install
[ ] pnpm lint
[ ] pnpm typecheck
[ ] pnpm test
[ ] pnpm beta:dry-run
[ ] cd services/astro-calc && python3 -m pytest
[ ] cd services/astro-calc && python3 -m ruff check .
[ ] cd services/astro-calc && python3 -m mypy .
[ ] git diff --check
Evidence notes:
```

## Environment validation result

```text
[ ] Local/mock mode passes without production secrets
[ ] Staging mode uses sandbox/mock/dry-run defaults
[ ] Production mode is not enabled accidentally
[ ] EMAIL_PROVIDER_MODE=sandbox unless human-approved staging/test mode
[ ] LINE_PROVIDER_MODE=sandbox unless human-approved staging/test mode
[ ] PAYMENT_PROVIDER_MODE=mock unless human-approved staging/test mode
[ ] ENABLE_REAL_EMAIL_SENDS=false unless explicitly approved
[ ] ENABLE_REAL_LINE_SENDS=false unless explicitly approved
[ ] ENABLE_REAL_PAYMENT_PROVIDER=false unless explicitly approved
[ ] ENABLE_PROVIDER_DRY_RUN=true unless explicitly approved provider test
[ ] NOTIFICATION_SCHEDULER_MODE=disabled or dry_run as validation/status evidence
[ ] Scheduler trigger/cron/worker/manual runner stopped unless explicitly approved
[ ] ASTRO_ENGINE=mock unless non-production real-engine validation is approved
[ ] SWISSEPH_LICENSE_MODE=none unless non-production validation is approved
```

## Provider flag verification

| Provider | Expected default | Observed | Status | Notes |
| --- | --- | --- | --- | --- |
| Email | sandbox, real sends disabled |  | pending |  |
| LINE | sandbox or disabled, real sends disabled |  | pending |  |
| Payment | mock, real provider disabled |  | pending |  |
| Alerting | mock provider |  | pending |  |
| Astro | mock engine unless approved |  | pending |  |
| Scheduler | trigger stopped, dry_run/disabled status |  | pending |  |

No-go if any dry-run output exposes secrets, raw PII, birth data, payment payloads, card data, raw LINE user IDs, ephemeris paths, or license data.

## Smoke evidence summary

| Smoke area | Evidence link or note | Status | Owner | Follow-up |
| --- | --- | --- | --- | --- |
| User onboarding |  | pending |  |  |
| Birth profile creation |  | pending |  |  |
| Unknown birth time flow |  | pending |  |  |
| Content generation |  | pending |  |  |
| Content preview/approval |  | pending |  |  |
| Subscription entitlement |  | pending |  |  |
| Notification scheduling |  | pending |  |  |
| Email dry-run |  | pending |  |  |
| LINE dry-run |  | pending |  |  |
| Payment webhook mock |  | pending |  |  |
| Privacy export/delete |  | pending |  |  |
| Account deletion/deactivation |  | pending |  |  |
| Monitoring redaction |  | pending |  |  |
| Rollback rehearsal |  | pending |  |  |

## Dry-run stop conditions

Mark the dry run failed and open a fix if:

```text
[ ] Any required command fails
[ ] Any real provider call occurs in tests or dry-run
[ ] Any production secret is required or exposed
[ ] Any .env file is committed
[ ] Any ephemeris binary is committed
[ ] Production mode is enabled accidentally
[ ] Swiss Ephemeris production is enabled without professional license and approved path/manifest
[ ] Payment webhook signature/idempotency behavior is uncertain
[ ] Scheduler execution is assumed contained only by NOTIFICATION_SCHEDULER_MODE
[ ] Payment rollback assumes checkout disablement also blocks signed webhook retries
[ ] Smoke evidence contains raw PII or secrets
```

## Dry-run sign-off

```text
Dry-run decision: pass / fail / pending
Accepted warnings:
Blockers:
Risks:
Operator:
Timestamp:
```
