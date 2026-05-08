# BETA_RELEASE_CANDIDATE.md - Beta Release Candidate

## Purpose

Use this packet to validate the beta release candidate end to end in mock or staging-safe mode. It does not approve production deploy, real provider sends, real payment activation, production secrets, or Swiss Ephemeris production use.

PR40 is the final release-candidate packaging layer. It consolidates release notes, go/no-go gates, smoke evidence, rollback, disable switches, monitoring watchpoints, and beta support handling without adding product features.

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
Launch tag candidate:
```

## Required environment mode

```text
[ ] APP_ENV=staging or local for dry-run validation
[ ] EMAIL_PROVIDER_MODE=sandbox unless a human approves provider-specific staging/test mode
[ ] LINE_PROVIDER_MODE=sandbox unless a human approves provider-specific staging/test mode
[ ] PAYMENT_PROVIDER_MODE=mock unless a human approves provider-specific staging/test mode
[ ] NOTIFICATION_SCHEDULER_MODE=dry_run or disabled for validation/status unless a human approves enabled staging/test mode
[ ] Scheduler trigger, cron job, queue worker, or manual runner disabled unless a human approves scheduler execution
[ ] ASTRO_ENGINE=mock unless a human approves non-production real-engine validation
[ ] SWISSEPH_LICENSE_MODE=none unless an approved non-production validation requires otherwise
[ ] ASTRO_EPHEMERIS_PATH unset for mock mode
[ ] ENABLE_REAL_EMAIL_SENDS=false unless explicitly approved for provider-specific staging/test mode
[ ] ENABLE_REAL_LINE_SENDS=false unless explicitly approved for provider-specific staging/test mode
[ ] ENABLE_REAL_PAYMENT_PROVIDER=false unless explicitly approved for provider-specific staging/test mode
[ ] ENABLE_PROVIDER_DRY_RUN=true unless a human has approved real-provider staging/test calls
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
- Provider activation guardrails for Email, LINE, and Payment.
- Beta invite/content management and support communication materials when merged into the candidate branch.
- Final rollback and go/no-go evidence.

## Scope excluded

- LINE MINI App work.
- Production deploy or merge approval.
- Real production Email, LINE, payment, alert, or campaign sends.
- Production secrets or `.env` values in the repository.
- Payment provider activation beyond mock or explicitly approved staging/test mode.
- Swiss Ephemeris production use, ephemeris binaries, or runtime ephemeris downloads.
- Telegram and Microsoft Teams delivery.
- Any beta invite/content management behavior not already present in the candidate branch.
- Production alert provider network sends.

## Linked PRs summary

```text
PR10-PR28 foundation: expected merged before this RC
PR29 provider activation guardrails: expected merged before PR40 final go; mark no-go for real provider activation if absent
PR31 beta launch content and invite management: expected merged before PR40 final go; mark no-go for beta invite if absent
PR32 release candidate validation: expected merged before PR40 final go
PR33 payment provider activation guardrails: expected merged before payment staging/test readiness is accepted
PR34 astro production ephemeris guardrails: expected merged before Swiss Ephemeris production readiness is accepted
PR40 beta release candidate package: this packet
```

Do not invent missing implementation details. If any expected dependency is not merged into the candidate branch, record it as pending and keep the dependent readiness area marked no-go or pending.

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
[ ] No `.env` file committed
[ ] No ephemeris binaries committed
[ ] No production secrets committed
[ ] Codex review reports no major issues
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

Real provider status must be "pending" or "no-go" unless the matching `ENABLE_REAL_*` flag, provider mode, provider credentials, dry-run status, and human approval gate are recorded outside the repository.

## Swiss Ephemeris production requirements

Production Swiss Ephemeris remains no-go unless all of the following are recorded by a human owner:

```text
[ ] ASTRO_ENGINE=swisseph
[ ] SWISSEPH_LICENSE_MODE=professional
[ ] ASTRO_EPHEMERIS_PATH points to approved files outside the repository
[ ] ASTRO_EPHEMERIS_MANIFEST_PATH points to an approved manifest
[ ] ASTRO_REQUIRE_PINNED_EPHEMERIS=true
[ ] Manifest includes file names, sizes, SHA-256 hashes, fingerprint, license mode, approval metadata, and active calculation profile approval
[ ] Runtime ephemeris downloads are disabled
[ ] No ephemeris binaries or license files are committed
[ ] Health/status output does not expose sensitive local paths or license details
```

## Payment provider readiness

```text
[ ] Payment remains mock for default beta validation
[ ] Real payment mode is disabled by default
[ ] Checkout creation does not activate subscription
[ ] Subscription activation requires verified webhook processing
[ ] Invalid webhook signature fails closed
[ ] Duplicate webhook is idempotent
[ ] Webhook payload cannot override stored checkout user or plan binding
[ ] Payment incident containment includes webhook route/provider-dashboard disablement or webhook secret rotation; checkout mode alone is not treated as webhook containment
[ ] Receipt hooks are sandboxed/mocked unless explicitly approved
[ ] No card data is stored
```

## Email and LINE readiness

```text
[ ] Email remains sandbox unless staging/test real sends are explicitly approved
[ ] LINE remains sandbox or disabled unless staging/test real sends are explicitly approved
[ ] Real sends require explicit `ENABLE_REAL_EMAIL_SENDS` or `ENABLE_REAL_LINE_SENDS`
[ ] Real sends require `REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true`
[ ] Provider dry-run blocks network calls until a human approves test sends
[ ] Webhook and audit metadata stay sanitized
[ ] Tests never send real Email or LINE messages
[ ] Scheduler containment uses trigger/worker disablement; `NOTIFICATION_SCHEDULER_MODE` alone is not treated as an execution kill switch
```

## Admin/operator readiness

```text
[ ] Operator console is available only behind admin auth
[ ] Environment validation status is visible without secrets
[ ] Health/status summaries do not expose raw PII, provider payloads, ephemeris paths, or license details
[ ] Release readiness, smoke tests, rollback, disable switches, and operations docs are linked for operators
```

## Privacy readiness

```text
[ ] Export user data path works for current user only
[ ] Delete birth profile path suppresses future chart generation and queued sends
[ ] Account deletion/deactivation suppresses entitlement and delivery
[ ] Unsubscribe and notification preference controls suppress delivery
[ ] Support process avoids raw birth data, full email addresses, raw LINE IDs, and payment payloads
```

## Monitoring readiness

```text
[ ] Structured logs and alert events use sanitized metadata
[ ] Mock alert provider is used in tests
[ ] Health output never exposes raw secrets or PII
[ ] Post-launch monitoring owner and watch window are recorded
[ ] Escalation path exists for payment, privacy, notification, provider, admin, and astro issues
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
[ ] Real provider staging/test sends remain disabled until explicit human approval
[ ] Production alert provider remains disabled until credentials and escalation policy are approved
```

## Monitoring watchpoints

- Health output must show provider modes without raw secrets, PII, birth data, payment payloads, ephemeris paths, or license values.
- Payment, Email, LINE, scheduler, astro, admin, privacy, environment, and subscription events must emit sanitized metadata only.
- Mock alert provider must not make network calls in tests.
- Any real provider call during tests is a no-go.
- Any unexpected scheduler dispatch, entitlement mutation, or content approval bypass is a no-go until investigated.

## Support and feedback plan

```text
[ ] Support owner assigned
[ ] Feedback channel ready
[ ] Beta issue template excludes secrets, raw provider payloads, raw LINE user IDs, full email addresses, and birth data
[ ] Escalation path exists for payment, privacy, deletion, admin, provider, and astro/license issues
[ ] User communication explains beta scope and entertainment/self-reflection framing
```

Use [Beta support and feedback](BETA_SUPPORT_AND_FEEDBACK.md) for user-facing response templates, escalation triggers, and feedback categories.

## Beta launch operator checklist

```text
[ ] Release owner confirms this RC packet is current
[ ] Engineering owner confirms required automated checks passed
[ ] Security/privacy owner confirms no secret or PII leakage
[ ] Payment owner confirms provider mode and webhook evidence
[ ] LINE/email owner confirms provider mode and send suppression evidence
[ ] Astro/license owner confirms engine mode and Swiss Ephemeris status
[ ] Support owner confirms support and feedback channel readiness
[ ] Rollback owner confirms rollback target and disable switches
[ ] Human go/no-go decision is recorded before beta invitations
```

## Manual smoke-test checklist

Record evidence in [E2E beta smoke test matrix](E2E_BETA_SMOKE_TEST_MATRIX.md) and [Beta smoke tests](BETA_SMOKE_TESTS.md).

```text
[ ] Signup/onboarding
[ ] Birth profile creation and unknown birth time warning
[ ] Daily/weekly/monthly/yearly access and entitlement gates
[ ] Subscription status display
[ ] Email verification/channel status
[ ] LINE follow/unfollow/blocked status where mock data exists
[ ] Notification preferences and dry-run scheduler
[ ] Privacy export/delete/unsubscribe/deactivation
[ ] Admin approve/reject content preview
[ ] Payment mock checkout and verified webhook path
[ ] Astro health and known limitations
[ ] Monitoring event redaction
[ ] Operator console readiness
[ ] Rollback and disable switches
```

## Rollback steps

1. Keep or return Email and LINE to sandbox/disabled mode.
2. Keep or return payment to mock/disabled mode.
3. Stop the scheduler trigger, cron job, queue worker, or manual runner before relying on scheduler containment.
4. Keep or return `NOTIFICATION_SCHEDULER_MODE` to disabled or `dry_run` for validation/status evidence.
5. Stop unsafe generation jobs and keep `ASTRO_ENGINE=mock` for non-production validation.
6. Human operator restores the last known good deployment.
7. Re-run `/api/health`, critical smoke tests, and monitoring checks.
8. Notify beta users with approved support wording and no incident-sensitive details.
9. Preserve audit logs, monitoring event IDs, and payment/deletion evidence.

Use [Launch disable switches](LAUNCH_DISABLE_SWITCHES.md) for fast containment before a full rollback.

## Disable-switch checklist

```text
[ ] Disable real Email sends: `ENABLE_REAL_EMAIL_SENDS=false` and `EMAIL_PROVIDER_MODE=sandbox`
[ ] Disable real LINE sends: `ENABLE_REAL_LINE_SENDS=false` and `LINE_PROVIDER_MODE=sandbox` or `disabled`
[ ] Disable real payment checkout: `ENABLE_REAL_PAYMENT_PROVIDER=false` and `PAYMENT_PROVIDER_MODE=mock`
[ ] Disable or block payment webhook ingress, or rotate/remove the payment webhook signing secret, before treating payment mutation as contained
[ ] Disable scheduler trigger/cron/worker/manual runner; set `NOTIFICATION_SCHEDULER_MODE=disabled` or `dry_run` only as supporting validation/status evidence
[ ] Switch astro engine to mock/prototype: `ASTRO_ENGINE=mock`, clear ephemeris path/manifest, and set `SWISSEPH_LICENSE_MODE=none`
[ ] Disable beta enrollment by revoking unredeemed invite codes and allowlist entries; if any active shared invite code has prior redemptions or cannot be proven unredeemed, mark beta no-go until a real global pause or per-user migration exists
```

## Post-launch watchpoints

Use [Post-launch monitoring checklist](POST_LAUNCH_MONITORING_CHECKLIST.md). Minimum watchpoints:

```text
[ ] Health and operator status remain sanitized
[ ] Payment webhook anomalies remain signature-verified and idempotent
[ ] Email and LINE delivery failures do not leak raw identifiers
[ ] Notification scheduler does not duplicate sends
[ ] Privacy export/delete/unsubscribe/deactivation events remain functional
[ ] Astro health/config errors remain sanitized and fail closed
[ ] Content approval and safety flags remain visible to admins
```

## Launch tag guidance

Create a launch tag only after human go approval and required checks pass.

```text
Suggested tag format: beta-rc-YYYYMMDD-N
Tag target: exact approved release commit
Tag message must include: RC version, commit, environment, provider modes, astro mode/profile, decision owner
Do not tag a commit with unresolved P0/P1/critical P2 findings
Do not tag as production-ready unless production deploy and provider activation are separately approved
```

## Final PR40 document links

- [Beta release notes](BETA_RELEASE_NOTES.md)
- [Final go/no-go checklist](FINAL_GO_NO_GO_CHECKLIST.md)
- [Post-launch monitoring checklist](POST_LAUNCH_MONITORING_CHECKLIST.md)
- [Beta support and feedback](BETA_SUPPORT_AND_FEEDBACK.md)
- [Launch disable switches](LAUNCH_DISABLE_SWITCHES.md)
- [Launch risk register](LAUNCH_RISK_REGISTER.md)
- [Rollback checklist](ROLLBACK_CHECKLIST.md)

## PR41 launch operations records

- [Beta launch execution log](BETA_LAUNCH_EXECUTION_LOG.md)
- [Staging dry-run results](STAGING_DRY_RUN_RESULTS.md)
- [Beta go/no-go execution record](BETA_GO_NO_GO_EXECUTION_RECORD.md)
- [Release tagging guide](RELEASE_TAGGING_GUIDE.md)

## Go/no-go decision table

| Area | Evidence | Status | Owner | Notes |
| --- | --- | --- | --- | --- |
| Local checks | Full command proof attached | pending |  |  |
| Dry run | `pnpm beta:dry-run` result | pending |  |  |
| E2E smoke matrix | `docs/E2E_BETA_SMOKE_TEST_MATRIX.md` complete | pending |  |  |
| Provider modes | Mock/sandbox/dry-run confirmed | pending |  |  |
| PR29 dependency | Merged or pending/no-go noted | pending |  |  |
| PR31 dependency | Merged or pending/no-go for beta invite noted | pending |  |  |
| Rollback | Owner and target recorded | pending |  |  |
| Support | Owner and feedback path ready | pending |  |  |
| Final decision | Go or no-go recorded by human | pending |  |  |
