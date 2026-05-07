# RELEASE_READINESS_CHECKLIST.md - Release Readiness Checklist

## Goal

Define the final beta release gates for the Thai horoscope platform without approving production secrets, real provider activation, payment launch, or Swiss Ephemeris production use.

This checklist is for staging and beta readiness. Human approval is still required before merge, production deploy, provider activation, payment activation, production secrets, and Swiss Ephemeris license or ephemeris file decisions.

## Release status

```text
Target stage: staging/beta
Production launch: not approved
Real payment activation: not approved
Real LINE/email production sends: not approved
Swiss Ephemeris production use: blocked pending professional license and approved file manifest
Ephemeris binaries in repository: prohibited
Runtime ephemeris downloads: prohibited
```

## Related readiness docs

- [Beta launch plan](BETA_LAUNCH_PLAN.md)
- [Beta smoke tests](BETA_SMOKE_TESTS.md)
- [Go/no-go criteria](GO_NO_GO_CRITERIA.md)
- [Launch risk register](LAUNCH_RISK_REGISTER.md)
- [Rollback checklist](ROLLBACK_CHECKLIST.md)
- [Beta dry run report](BETA_DRY_RUN_REPORT.md)
- [Real provider activation runbook](REAL_PROVIDER_ACTIVATION_RUNBOOK.md)
- [Provider activation checklist](PROVIDER_ACTIVATION_CHECKLIST.md)
- [Provider dry run](PROVIDER_DRY_RUN.md)

## Security readiness

```text
[ ] Admin auth requires a server-verified signed session outside local development
[ ] Production forbids MOCK_ADMIN_TOKEN
[ ] Server actions and admin actions fail closed without a verified admin session
[ ] LINE, email, and payment webhook signatures are verified where supported
[ ] Payment webhooks are idempotent before entitlement, receipt, or audit side effects
[ ] Secrets are configured only in the deployment platform
[ ] No production secrets are committed
[ ] No .env file is committed
[ ] Health checks do not expose raw secrets, tokens, provider credentials, PII, or birth data
[ ] Structured logs and alerts redact raw PII before emission
[ ] Raw payment payloads are not logged
[ ] Card data, PAN, CVC, and CVV are not stored
[ ] Tests never send real payment, LINE, email, webhook, Slack, or vendor alert calls
```

## Privacy readiness

```text
[ ] User data export path is available and scoped to the requesting user
[ ] Birth profile deletion is available
[ ] Account deletion request path is available
[ ] Unsubscribe and topic notification controls are available
[ ] Deactivated users are suppressed from entitlement and send flows
[ ] Deleted or deactivated users do not receive scheduled sends
[ ] PII redaction covers email, LINE user ID, birth date, birth time, birth place, and location
[ ] Consent tracking exists for terms, privacy, birth data, service notifications, marketing, and payment terms as applicable
[ ] Data retention notes are documented before production launch
[ ] Audit metadata avoids direct PII, birth data, horoscope body text, and unnecessary derived identifiers
```

## Payment readiness

```text
[ ] Payment provider foundation exists with mock and configurable HTTP modes
[ ] Real payment mode requires provider endpoint, API key, and webhook secret
[ ] Webhook signature verification fails closed when the secret or signature is missing
[ ] Webhook idempotency prevents duplicate subscription, receipt, and audit side effects
[ ] Checkout completion is bound to a stored server-created checkout session
[ ] Subscription lifecycle mapping covers create, renew, renewal failure, cancel, expire, and reactivate behavior
[ ] Receipt hook behavior is sandboxed and deduplicated
[ ] Card data is never stored in application state, audit logs, health checks, logs, or alerts
[ ] Real provider activation checklist is completed and approved by a human owner
[ ] Real payment activation requires ENABLE_REAL_PAYMENT_PROVIDER=true and REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
```

## Notification readiness

```text
[ ] Email gateway supports sandbox mode and configured HTTP mode
[ ] LINE gateway supports sandbox mode, configured HTTP mode, and disabled mode where allowed
[ ] Real Email and LINE sends require explicit ENABLE_REAL_* flags and human approval gate configuration
[ ] Notification scheduler supports disabled, dry_run, and enabled modes
[ ] Enabled scheduler requires an internal scheduler token outside local development
[ ] Duplicate-send prevention is keyed by user/topic/period
[ ] Quiet hours and timezone behavior are documented and tested for the intended beta scope
[ ] Fallback channel behavior avoids duplicate messages
[ ] Blocked, unsubscribed, bounced, deleted, and deactivated users are suppressed
[ ] No sends occur after deletion or deactivation
[ ] Tests use sandbox/mock hooks and never send real messages
```

## Astro readiness

```text
[ ] Astro core engine remains isolated in services/astro-calc
[ ] Next.js does not calculate planetary positions
[ ] Horoscope interpretation prose remains outside services/astro-calc
[ ] Swiss Ephemeris production mode requires SWISSEPH_LICENSE_MODE=professional
[ ] Swiss Ephemeris mode requires ASTRO_EPHEMERIS_PATH
[ ] Ephemeris files are mounted or packaged intentionally, not downloaded at runtime
[ ] Ephemeris binaries are not committed
[ ] Production file manifest records supported files, sizes, SHA-256 hashes, and combined fingerprint before approval
[ ] Chart snapshots include engine/profile/fingerprint metadata when real engine output is approved
[ ] Ayanamsa metadata is recorded through calculation profile metadata
[ ] Unknown birth time warnings downgrade house, angle, and timing claims
[ ] Solar return support remains readiness/structural metadata unless explicitly approved
[ ] Transit/hourly timing support remains structural and not final prediction text
[ ] Golden validation cases and known limitations are reviewed before beta
```

## Environment readiness

```text
[ ] Local development works without production secrets
[ ] Staging variables are configured in the deployment platform only
[ ] Production variables are listed but not added to the repository
[ ] Mock/sandbox modes are visible in health warnings
[ ] Real provider modes fail closed without their required secrets
[ ] Real provider modes fail closed without explicit ENABLE_REAL_* flags when dry-run is disabled
[ ] Provider dry-run validates readiness without network calls or real state mutation
[ ] Production blocks sandbox email, sandbox LINE, mock payment, mock astro, disabled LINE, and MOCK_ADMIN_TOKEN
[ ] Swiss Ephemeris production blocks non-professional license mode and missing ephemeris path
[ ] GET /api/health returns sanitized component status
[ ] Smoke tests are run after human staging deployment
```

## Monitoring readiness

```text
[ ] Structured logs use event type, severity, source, timestamp, safe references, and sanitized metadata
[ ] PII and secret redaction applies before logs and alerts are emitted
[ ] Alert events cover payment, email, LINE, scheduler, astro, admin, privacy, environment, and subscription anomalies
[ ] Mock alert provider is used in tests and does not perform network sends
[ ] Operations runbook explains incident triage for monitored event types
[ ] Health/status helpers expose modes and sanitized codes only
```

## Known limitations summary

```text
[ ] Horoscope content is entertainment and self-reflection, not guaranteed prediction
[ ] The service must not predict death, serious illness, accidents, unavoidable harm, or guaranteed outcomes
[ ] The service must not provide medical diagnosis, legal advice, or specific financial/investment instruction
[ ] Swiss Ephemeris production use requires a professional license decision before approval
[ ] Production ephemeris files must be approved, pinned, fingerprinted, and mounted or packaged intentionally
[ ] Solar return and hourly timing outputs are structural signals, not final prediction text
[ ] Payment provider foundation still requires production provider activation and durable production storage decisions
[ ] LINE and email real provider modes require approved credentials before production sends
[ ] Mock/sandbox modes are acceptable for local/staging validation only when clearly disclosed
```

## Go criteria

```text
[ ] Required checks pass on the release branch
[ ] Staging deploy is performed by a human operator
[ ] Staging health is ok or warnings are explicitly accepted for beta
[ ] Manual beta smoke tests pass
[ ] Known limitations are accepted and visible to operators/support
[ ] Rollback target and owner are recorded
[ ] Beta communication and support process are ready
```

## No-go criteria

```text
[ ] Any required check fails
[ ] Any secret, .env file, ephemeris binary, or production credential is present in the repository
[ ] Health, logs, alerts, PR comments, or audit metadata expose raw PII or secrets
[ ] Production mode depends on mock payment or mock astro
[ ] Real provider mode is enabled without required provider credentials
[ ] Swiss Ephemeris production mode lacks professional license approval or approved ephemeris manifest
[ ] Payment webhook signature verification or idempotency is bypassed
[ ] Deleted, deactivated, unsubscribed, blocked, or bounced users can still receive sends
[ ] Rollback owner or rollback target is unknown
```

## Proof commands

Run before PR handoff and again before beta release candidate approval:

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
