# BETA_RELEASE_CANDIDATE.md - Beta Release Candidate

## Purpose

Use this packet to validate the beta release candidate end to end in mock or staging-safe mode. It does not approve production deploy, real provider sends, real payment activation, production secrets, or Swiss Ephemeris production use.

## Release candidate header

```text
RC version:
RC date:
Branch:
Commit:
Release owner:
Engineering owner:
Support owner:
Rollback owner:
Decision status: pending / go / no-go
```

## Required environment mode

```text
[ ] APP_ENV=staging or local for dry-run validation
[ ] EMAIL_PROVIDER_MODE=sandbox unless a human approves provider-specific staging/test mode
[ ] LINE_PROVIDER_MODE=sandbox unless a human approves provider-specific staging/test mode
[ ] PAYMENT_PROVIDER_MODE=mock unless a human approves provider-specific staging/test mode
[ ] NOTIFICATION_SCHEDULER_MODE=dry_run or disabled unless a human approves enabled staging/test mode
[ ] ASTRO_ENGINE=mock unless a human approves non-production real-engine validation
[ ] SWISSEPH_LICENSE_MODE=none unless an approved non-production validation requires otherwise
[ ] ASTRO_EPHEMERIS_PATH unset for mock mode
```

## Scope included

- Responsive web onboarding and birth profile capture.
- Unknown birth time warning path.
- Mock astro-calc health and configured-engine health evidence.
- Horoscope content generation, safety check, and admin content preview approval.
- Subscription entitlement state in mock/payment foundation mode.
- Notification preference setup and dry-run scheduling.
- Email and LINE mock or sandbox delivery paths.
- Payment mock checkout/webhook foundation.
- Privacy export, birth profile deletion, and account deletion/deactivation.
- Monitoring/alert redaction and operator console readiness.
- Final rollback and go/no-go evidence.

## Scope excluded

- LINE MINI App work.
- Production deploy or merge approval.
- Real production Email, LINE, payment, alert, or campaign sends.
- Production secrets or `.env` values in the repository.
- Payment provider activation beyond mock or explicitly approved staging/test mode.
- Swiss Ephemeris production use, ephemeris binaries, or runtime ephemeris downloads.
- Telegram and Microsoft Teams delivery.
- Beta invite/content management logic not already present in the branch.

## Linked PRs summary

```text
PR10-PR28 foundation: expected merged before this RC
PR29 provider activation guardrails: pending dependency if not merged
PR31 beta launch content and invite management: pending dependency if not merged
PR32 release candidate validation: this packet
```

Do not invent PR29 or PR31 implementation details. If either PR is not merged into the candidate branch, record the dependency as pending and keep real provider activation and invite readiness marked no-go or pending.

## Build and test evidence

```text
[ ] pnpm install
[ ] pnpm lint
[ ] pnpm typecheck
[ ] pnpm test
[ ] cd services/astro-calc && python3 -m pytest
[ ] cd services/astro-calc && python3 -m ruff check .
[ ] cd services/astro-calc && python3 -m mypy .
[ ] git diff --check
[ ] pnpm beta:dry-run
Evidence notes:
```

## Provider activation status

```text
Email: sandbox / staging-test-approved / pending / no-go
LINE: sandbox / staging-test-approved / pending / no-go
Payment: mock / staging-test-approved / pending / no-go
Notification scheduler: disabled / dry_run / staging-enabled-approved / no-go
Astro engine: mock / non-production-real-engine-approved / no-go
Alert provider: mock / staging-test-approved / pending / no-go
```

## Human approval gates

Human approval is required before merge, staging deploy, production deploy, production secrets, real Email or LINE sends, payment activation, real alert provider credentials, Swiss Ephemeris commercial/professional strategy, production ephemeris files, or privacy/retention/consent behavior changes.

## Known limitations

```text
[ ] Horoscope copy is entertainment and self-reflection only
[ ] Mock astro output is not production-approved astrology
[ ] Swiss Ephemeris production license and file manifest remain blocked unless explicitly approved
[ ] Real provider activation guardrails are pending PR29 if not merged
[ ] Beta invite/content management is pending PR31 if not merged
[ ] Payment webhook idempotency durability must be accepted only for mock/staging until production storage is approved
[ ] Support and rollback owners must be named before beta invite
```

## Monitoring watchpoints

- Health output must show provider modes without raw secrets, PII, birth data, payment payloads, ephemeris paths, or license values.
- Payment, Email, LINE, scheduler, astro, admin, privacy, environment, and subscription events must emit sanitized metadata only.
- Mock alert provider must not make network calls in tests.
- Any real provider call during tests is a no-go.

## Support and feedback plan

```text
[ ] Support owner assigned
[ ] Feedback channel ready
[ ] Beta issue template excludes secrets, raw provider payloads, raw LINE user IDs, full email addresses, and birth data
[ ] Escalation path exists for payment, privacy, deletion, admin, provider, and astro/license issues
[ ] User communication explains beta scope and entertainment/self-reflection framing
```

## Rollback steps

1. Keep or return Email and LINE to sandbox/disabled mode.
2. Keep or return payment to mock/disabled mode.
3. Keep or return scheduler to disabled or `dry_run`.
4. Stop unsafe generation jobs and keep `ASTRO_ENGINE=mock` for non-production validation.
5. Human operator restores the last known good deployment.
6. Re-run `/api/health`, critical smoke tests, and monitoring checks.
7. Notify beta users with approved support wording and no incident-sensitive details.
8. Preserve audit logs, monitoring event IDs, and payment/deletion evidence.

## Go/no-go decision table

| Area | Evidence | Status | Owner | Notes |
| --- | --- | --- | --- | --- |
| Local checks | Full command proof attached | pending |  |  |
| Dry run | `pnpm beta:dry-run` result | pending |  |  |
| E2E smoke matrix | `docs/E2E_BETA_SMOKE_TEST_MATRIX.md` complete | pending |  |  |
| Provider modes | Mock/sandbox/dry-run confirmed | pending |  |  |
| PR29 dependency | Merged or pending/no-go noted | pending |  |  |
| PR31 dependency | Merged or pending/no-go noted | pending |  |  |
| Rollback | Owner and target recorded | pending |  |  |
| Support | Owner and feedback path ready | pending |  |  |
| Final decision | Go or no-go recorded by human | pending |  |  |
