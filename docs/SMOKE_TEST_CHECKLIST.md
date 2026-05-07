# SMOKE_TEST_CHECKLIST.md — Manual Smoke Tests

## Goal

Validate that staging is operational without sending real provider traffic or exposing secrets.

## Health and configuration

```text
[ ] GET /api/health returns 200 or an expected 503 during negative config testing
[ ] Health output includes component statuses and modes
[ ] Health output does not include raw secrets, tokens, email addresses, LINE user IDs, payment credentials, or birth data
[ ] Missing config errors list variable names only
[ ] Provider activation readiness output is sanitized and safe for operator display
[ ] ENABLE_PROVIDER_DRY_RUN=true reports no provider network calls
```

## Monitoring and alerting

```text
[ ] Structured monitoring events use type, severity, source, timestamp, safe reference, dedupe key, and sanitized metadata
[ ] Mock alert hooks record sanitized alerts only
[ ] No real Slack, LINE, email, webhook, or vendor alert call occurs in tests
[ ] Duplicate non-critical alerts are suppressed when a dedupe key is configured
[ ] Logs and alerts do not include raw payment payloads, card data, birth data, ephemeris paths, or license data
```

## Web app

```text
[ ] Home page renders
[ ] Onboarding page renders
[ ] Birth profile can be saved in mock flow
[ ] Today page renders
[ ] Weekly page renders
[ ] Monthly page renders
[ ] Yearly page renders
```

## Admin

```text
[ ] Admin sign-in uses staging-only credentials
[ ] Missing or invalid admin session is rejected
[ ] Admin session cookie is HttpOnly and secure when served over HTTPS
[ ] Admin approve/reject actions require server-verified admin session
```

## Email

Sandbox mode:

```text
[ ] EMAIL_PROVIDER_MODE=sandbox
[ ] No real email provider API call occurs
[ ] Email audit metadata excludes PII and secrets
```

Real staging/test mode:

```text
[ ] EMAIL_PROVIDER_MODE=http
[ ] EMAIL_PROVIDER_ENDPOINT points to staging/test provider
[ ] EMAIL_PROVIDER_API_KEY is staging/test only
[ ] EMAIL_VERIFIED_SENDER_DOMAIN is verified for the intended sender/domain
[ ] ENABLE_REAL_EMAIL_SENDS=true only after human approval
[ ] REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true before activation
[ ] EMAIL_WEBHOOK_SECRET is configured
[ ] Test webhook signature verification passes with staging secret
[ ] Invalid webhook signature fails closed
```

## LINE

Sandbox mode:

```text
[ ] LINE_PROVIDER_MODE=sandbox
[ ] No real LINE push call occurs
[ ] LINE audit metadata excludes raw LINE user IDs and tokens
```

Real staging/test mode:

```text
[ ] LINE_PROVIDER_MODE=http
[ ] LINE_CHANNEL_SECRET is staging/test only
[ ] LINE_CHANNEL_ACCESS_TOKEN is staging/test only
[ ] ENABLE_REAL_LINE_SENDS=true only after human approval
[ ] REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true before activation
[ ] Invalid webhook signature fails closed
[ ] Test account only receives approved test messages
```

## Payment

Mock mode:

```text
[ ] PAYMENT_PROVIDER_MODE=mock
[ ] No real checkout or payment request occurs
[ ] Client return does not activate subscription
[ ] Invalid webhook signature fails closed
```

Real staging/test mode:

```text
[ ] PAYMENT_PROVIDER_MODE=http
[ ] PAYMENT_PROVIDER_CHECKOUT_ENDPOINT points to staging/test provider
[ ] PAYMENT_PROVIDER_API_KEY is staging/test only
[ ] PAYMENT_WEBHOOK_SECRET is configured
[ ] ENABLE_REAL_PAYMENT_PROVIDER=true only after human approval
[ ] REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true before activation
[ ] Webhook idempotency is verified
[ ] Duplicate webhook does not duplicate subscription, receipt, or audit side effects
```

## Notification scheduler

```text
[ ] NOTIFICATION_SCHEDULER_MODE=disabled or dry_run unless human approved
[ ] Scheduler does not send real LINE/email in smoke tests
[ ] Queued messages are idempotent by user/topic/period
[ ] Delivery attempts are recorded without PII or secrets
[ ] Fallback behavior does not duplicate messages
```

## Astro calculation

Mock/default mode:

```text
[ ] ASTRO_ENGINE=mock
[ ] No ephemeris path is required
[ ] No runtime ephemeris download occurs
```

Swiss Ephemeris staging validation:

```text
[ ] ASTRO_ENGINE=swisseph
[ ] SWISSEPH_LICENSE_MODE=free or professional for non-production validation
[ ] ASTRO_EPHEMERIS_PATH points outside the repo
[ ] Ephemeris files are not committed
[ ] Engine/profile/fingerprint are recorded in validation notes
```

Production Swiss Ephemeris remains blocked until professional license and approved ephemeris manifest are recorded.
