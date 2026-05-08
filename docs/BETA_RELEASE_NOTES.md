# BETA_RELEASE_NOTES.md - Beta Release Notes

## Release header

```text
Beta release: Beta RC
RC version:
Release date:
Commit:
Environment: staging or local dry run
Release owner:
Support owner:
Rollback owner:
Decision: pending / go / no-go
```

## Summary

This beta release candidate packages the Thai horoscope subscription platform for staging-safe validation. It includes onboarding, birth profile capture, subscription entitlement flows, content safety, admin approval, dry-run notification scheduling, provider activation guardrails, observability, operator checklists, and rollback instructions.

Horoscope content is for entertainment, lifestyle guidance, and self-reflection. It must not be presented as guaranteed prediction, medical diagnosis, legal advice, financial instruction, or a substitute for professional judgment.

## Included capabilities

```text
[ ] Responsive web onboarding and account/birth-profile flows
[ ] Unknown birth time warning and softer confidence handling
[ ] Daily, weekly, monthly, and yearly horoscope access with entitlement gates
[ ] Thai horoscope content rules engine with safety filters
[ ] Admin content preview and beta approval gate
[ ] Email and LINE gateway abstractions with mock/sandbox-safe defaults
[ ] Real Email and LINE activation paths guarded by explicit flags and human approval
[ ] Payment provider activation path guarded by explicit flags and verified webhook flow
[ ] Notification scheduler validation/status modes plus documented trigger/worker disablement for containment
[ ] Privacy export, birth profile deletion, unsubscribe, deactivation, and account deletion request paths
[ ] Operator console, environment health, structured observability, and sanitized alerts
[ ] Astro core service and Swiss Ephemeris production guardrails
[ ] Beta invite/content management and support communication materials
```

## Explicitly disabled by default

```text
[ ] Production deploy
[ ] Real production Email sends
[ ] Real production LINE sends
[ ] Real payment charging
[ ] Real alert provider network sends
[ ] Production Swiss Ephemeris activation
[ ] Runtime ephemeris downloads
[ ] Committed ephemeris binaries or license files
[ ] LINE MINI App behavior
```

## Required beta mode

Default beta validation should use:

```text
APP_ENV=staging
EMAIL_PROVIDER_MODE=sandbox
LINE_PROVIDER_MODE=sandbox
PAYMENT_PROVIDER_MODE=mock
NOTIFICATION_SCHEDULER_MODE=dry_run
Scheduler trigger/cron/worker/manual runner stopped unless explicitly approved
ASTRO_ENGINE=mock
SWISSEPH_LICENSE_MODE=none
ENABLE_REAL_EMAIL_SENDS=false
ENABLE_REAL_LINE_SENDS=false
ENABLE_REAL_PAYMENT_PROVIDER=false
ENABLE_PROVIDER_DRY_RUN=true
```

Provider-specific staging/test mode may be used only after the relevant human owner approves the credentials, recipients, dry-run evidence, and rollback plan.

## Provider activation status

```text
Email: guarded, disabled by default, sandbox-safe for beta
LINE: guarded, disabled by default, sandbox-safe for beta
Payment: guarded, disabled by default, mock-safe for beta
Notification scheduler: trigger/worker stopped unless human-approved staging test; dry_run or disabled status mode for validation
Alert provider: mock-only unless human-approved staging test
```

## Astro status

Swiss Ephemeris production is not enabled by this release note. Production Swiss Ephemeris requires `SWISSEPH_LICENSE_MODE=professional`, an approved `ASTRO_EPHEMERIS_PATH` outside the repository, an approved manifest with file hashes and active profile approval, `ASTRO_REQUIRE_PINNED_EPHEMERIS=true`, and a human license/ops decision.

## Validation evidence

```text
pnpm install:
pnpm lint:
pnpm typecheck:
pnpm test:
cd services/astro-calc && python3 -m pytest:
cd services/astro-calc && python3 -m ruff check .:
cd services/astro-calc && python3 -m mypy .:
git diff --check:
Manual smoke checklist:
Codex review:
```

## Known limitations

- Beta is not production approval.
- Mock/sandbox modes validate workflows, not production provider readiness.
- Real provider credentials, payment charging, and production alerting remain human-gated.
- Swiss Ephemeris production requires legal/license and file-manifest approval.
- Horoscope text is reflective and entertainment-oriented; it does not guarantee outcomes.
- Unknown birth time reduces confidence for house, angle, and timing-sensitive claims.

## Rollback note

Use [Rollback checklist](ROLLBACK_CHECKLIST.md) and [Launch disable switches](LAUNCH_DISABLE_SWITCHES.md). Record rollback owner, rollback target, provider modes after rollback, scheduler mode, user communication, and monitoring evidence before beta invitations.

## Support and feedback note

Use [Beta support and feedback](BETA_SUPPORT_AND_FEEDBACK.md). Do not include raw birth data, full email addresses, raw LINE user IDs, provider payloads, tokens, secrets, payment details, ephemeris paths, or license details in release notes, support tickets, screenshots, or PR comments.
