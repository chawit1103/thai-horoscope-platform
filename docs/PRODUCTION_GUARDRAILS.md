# PRODUCTION_GUARDRAILS.md — Production Guardrails

## Goal

List the fail-closed rules that must hold before production launch.

## Global guardrails

- Do not deploy production without human approval.
- Do not commit `.env` files or production secrets.
- Do not expose secrets or PII in health checks, logs, audit metadata, or PR comments.
- Do not send real LINE messages, real email, or real payment requests from tests.
- Do not enable paid production astrology calculations with mock ephemeris output.

## Admin auth

Production requires:

```text
ADMIN_SESSION_SECRET
```

Production forbids:

```text
MOCK_ADMIN_TOKEN
```

Admin routes and actions must fail closed when the session is missing or invalid.

## Email

Production real email requires:

```text
EMAIL_PROVIDER_MODE=http
EMAIL_FROM_ADDRESS
EMAIL_PROVIDER_ENDPOINT
EMAIL_PROVIDER_API_KEY
EMAIL_WEBHOOK_SECRET
EMAIL_AUDIT_HASH_SECRET
```

Email logs must not include raw email addresses, tokens, webhook secrets, provider API keys, subject/body content, or raw provider payloads.

## LINE

Production LINE requires:

```text
LINE_PROVIDER_MODE=http
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
LINE_AUDIT_HASH_SECRET
```

LINE logs must not include raw LINE user IDs, access tokens, webhook secrets, message bodies, or raw payloads.

## Payment

Production payment requires:

```text
PAYMENT_PROVIDER_MODE=http
PAYMENT_PROVIDER_CHECKOUT_ENDPOINT
PAYMENT_PROVIDER_API_KEY
PAYMENT_WEBHOOK_SECRET
```

Production forbids:

```text
PAYMENT_PROVIDER_MODE=mock
```

Payment webhooks must verify signatures and be idempotent before mutating subscriptions.

## Notification scheduler

Production enabled scheduler requires:

```text
NOTIFICATION_SCHEDULER_MODE=enabled
NOTIFICATION_SCHEDULER_TOKEN
```

The scheduler must record delivery attempts and avoid duplicate sends for the same user/topic/period.

## Astro calculation

Production forbids:

```text
ASTRO_ENGINE=mock
```

Swiss Ephemeris production requires:

```text
ASTRO_ENGINE=swisseph
SWISSEPH_LICENSE_MODE=professional
ASTRO_EPHEMERIS_PATH=/mounted/ephemeris/path
```

The ephemeris path must refer to an approved mounted or packaged file set. Runtime ephemeris downloads and committed ephemeris binaries are forbidden.
