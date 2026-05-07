# STAGING_DEPLOYMENT_RUNBOOK.md — Staging Deployment Runbook

## Goal

Deploy and validate staging without production secrets, production payment activation, real user messaging, or unapproved ephemeris files.

Agents must not deploy automatically. A human operator owns the deployment action.

## Pre-deploy checks

Run from the repository root:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
cd services/astro-calc && python3 -m pytest
cd services/astro-calc && python3 -m ruff check .
cd services/astro-calc && python3 -m mypy .
git diff --check
```

## Staging environment setup

Minimum staging variables:

```text
APP_ENV=staging
ADMIN_SESSION_SECRET=<staging-only secret>
EMAIL_PROVIDER_MODE=sandbox
EMAIL_AUDIT_HASH_SECRET=<staging-only secret>
LINE_PROVIDER_MODE=sandbox
LINE_AUDIT_HASH_SECRET=<staging-only secret>
PAYMENT_PROVIDER_MODE=mock
NOTIFICATION_SCHEDULER_MODE=dry_run
ASTRO_ENGINE=mock
SWISSEPH_LICENSE_MODE=none
```

Use real provider staging/test accounts only after the owner approves that provider-specific test. Never reuse production tokens in staging.

## Deploy

Human operator:

1. Confirm branch and commit.
2. Confirm CI/checks are green.
3. Confirm staging secrets are present in the deployment platform and not committed.
4. Deploy to staging.
5. Open `/api/health`.
6. Continue only if health status is `ok` or warnings are explicitly accepted for sandbox/mock staging modes.

## Post-deploy smoke test

Use `docs/SMOKE_TEST_CHECKLIST.md`, `docs/BETA_SMOKE_TESTS.md`, and `docs/E2E_BETA_SMOKE_TEST_MATRIX.md`.

Minimum smoke paths:

- home page renders
- onboarding saves a mock birth profile
- today/weekly/monthly/yearly pages render
- admin sign-in and approval path works with staging-only credentials
- `/api/health` does not leak secrets
- LINE webhook rejects invalid signatures
- payment webhook rejects invalid signatures
- notification scheduler remains dry-run or sandboxed
- astro-calc uses mock or approved test engine only
- structured monitoring events and mock alert hooks contain sanitized metadata only

## Rollback

Rollback triggers:

- `/api/health` returns unexpected `error`
- secrets or raw provider credentials appear in logs or health output
- real email/LINE/payment calls are attempted unexpectedly
- admin auth fails open
- payment webhook mutates state after invalid signature
- astro engine/profile/fingerprint differs from expected staging plan
- logs or alerts contain raw PII, secrets, raw payment payloads, birth data, ephemeris paths, or license data

Rollback actions:

1. Disable or pause staging traffic.
2. Revert deployment to the last known good commit.
3. Pause notification scheduler if enabled.
4. Confirm payment provider remains mock/test and no payment activation occurred.
5. Record the failed health report codes, not raw secrets.
6. Open a fix PR with regression tests if code behavior was wrong.

## Evidence to capture

Capture in the deployment note:

```text
Commit:
Environment:
Health status:
Provider modes:
Astro engine/profile:
Smoke test result:
Rollback target:
Known accepted warnings:
Monitoring events checked:
```
