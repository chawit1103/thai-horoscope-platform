# BETA_DRY_RUN_REPORT.md - Beta Dry Run Report

## Goal

Capture a local staging/beta dry run before a human staging deploy. This report validates mock-safe configuration, dry-run scheduler mode, astro-calc health, and release-readiness document links without enabling real providers or requiring production secrets.

## How to run

From the repository root:

```bash
pnpm beta:dry-run
```

The dry run checks:

- staging environment validation passes with mock/sandbox modes
- no production provider secrets are required
- email and LINE remain sandboxed
- payment remains mock
- notification scheduler is `dry_run`
- astro-calc mock health passes without an ephemeris path
- `docs/RELEASE_READINESS_CHECKLIST.md` links to required beta release-candidate readiness docs
- `docs/ROLLBACK_CHECKLIST.md` exists

The command does not deploy, send messages, activate payments, download ephemeris files, or require production secrets.

## Expected mock-safe environment

```text
APP_ENV=staging
ADMIN_SESSION_SECRET=<dry-run placeholder>
EMAIL_PROVIDER_MODE=sandbox
EMAIL_AUDIT_HASH_SECRET=<dry-run placeholder>
LINE_PROVIDER_MODE=sandbox
LINE_AUDIT_HASH_SECRET=<dry-run placeholder>
PAYMENT_PROVIDER_MODE=mock
NOTIFICATION_SCHEDULER_MODE=dry_run
ASTRO_ENGINE=mock
SWISSEPH_LICENSE_MODE=none
ASTRO_EPHEMERIS_PATH unset
```

## Report template

```text
Commit:
Branch:
Dry-run command:
Dry-run status:
Environment status:
Provider modes:
Notification scheduler mode:
Astro health:
Release readiness links:
Rollback checklist:
Accepted warnings:
Result:
Operator:
Date:
```

## Required linked readiness docs

- [Beta release candidate](BETA_RELEASE_CANDIDATE.md)
- [E2E beta smoke test matrix](E2E_BETA_SMOKE_TEST_MATRIX.md)
- [Beta release notes](BETA_RELEASE_NOTES.md)
- [Beta release notes template](BETA_RELEASE_NOTES_TEMPLATE.md)
- [Final go/no-go checklist](FINAL_GO_NO_GO_CHECKLIST.md)
- [Post-launch monitoring checklist](POST_LAUNCH_MONITORING_CHECKLIST.md)
- [Beta support and feedback](BETA_SUPPORT_AND_FEEDBACK.md)
- [Launch disable switches](LAUNCH_DISABLE_SWITCHES.md)
- [Release readiness checklist](RELEASE_READINESS_CHECKLIST.md)
- [Beta launch plan](BETA_LAUNCH_PLAN.md)
- [Beta smoke tests](BETA_SMOKE_TESTS.md)
- [Go/no-go criteria](GO_NO_GO_CRITERIA.md)
- [Launch risk register](LAUNCH_RISK_REGISTER.md)
- [Rollback checklist](ROLLBACK_CHECKLIST.md)

## Stop conditions

Stop the dry run and open a fix when:

- the dry-run command fails
- any real provider mode is enabled unexpectedly
- a production credential is required for local dry run
- scheduler mode is not `dry_run`
- astro-calc health fails in mock mode
- required readiness docs or links are missing
- rollback checklist is missing
- logs or report output include raw secrets, PII, payment payloads, card data, LINE user IDs, birth data, ephemeris paths, or license data
