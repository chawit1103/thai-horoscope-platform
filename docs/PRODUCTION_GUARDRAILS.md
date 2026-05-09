# PRODUCTION_GUARDRAILS.md — Production Guardrails

## Goal

List the fail-closed rules that must hold before production launch.

## Global guardrails

- Do not deploy production without human approval.
- Do not commit `.env` files or production secrets.
- Do not expose secrets or PII in health checks, logs, audit metadata, or PR comments.
- Redact email addresses, raw LINE user IDs, birth data, payment payloads, card data, webhook secrets, API keys, ephemeris paths, and ephemeris license data before emitting logs or alerts.
- Do not send real LINE messages, real email, or real payment requests from tests.
- Do not send real Slack, LINE, email, webhook, or vendor alert calls from tests; use mock alert hooks only.
- Do not enable paid production astrology calculations with mock ephemeris output.
- Do not activate real Email, LINE, or Payment providers without explicit real-provider flags and human approval gate configuration.

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
EMAIL_VERIFIED_SENDER_DOMAIN
ENABLE_REAL_EMAIL_SENDS=true
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
ENABLE_PROVIDER_DRY_RUN=false
```

Email logs must not include raw email addresses, tokens, webhook secrets, provider API keys, subject/body content, or raw provider payloads.

Email HTTP gateway construction must go through provider activation readiness and fail closed unless `networkCallsAllowed=true`.

## LINE

Production LINE requires:

```text
LINE_PROVIDER_MODE=http
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
LINE_AUDIT_HASH_SECRET
ENABLE_REAL_LINE_SENDS=true
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
ENABLE_PROVIDER_DRY_RUN=false
```

LINE logs must not include raw LINE user IDs, access tokens, webhook secrets, message bodies, or raw payloads.

LINE HTTP gateway construction must go through provider activation readiness and fail closed unless `networkCallsAllowed=true`.

## Payment

Production payment requires:

```text
PAYMENT_PROVIDER_MODE=http
PAYMENT_PROVIDER_CHECKOUT_ENDPOINT
PAYMENT_PROVIDER_API_KEY
PAYMENT_WEBHOOK_SECRET
ENABLE_REAL_PAYMENT_PROVIDER=true
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
ENABLE_PROVIDER_DRY_RUN=false
```

Production forbids:

```text
PAYMENT_PROVIDER_MODE=mock
```

Payment webhooks must verify signatures and be idempotent before mutating subscriptions.

Payment HTTP provider construction must go through provider activation readiness and fail closed unless `networkCallsAllowed=true`. Checkout creation must not activate subscriptions, and client-side checkout success returns must be ignored. Subscription activation may happen only through verified webhook processing bound to a stored server-created checkout session.

## Notification scheduler

Production enabled scheduler requires:

```text
NOTIFICATION_SCHEDULER_MODE=enabled
NOTIFICATION_SCHEDULER_TOKEN
```

The scheduler must record delivery attempts and avoid duplicate sends for the same user/topic/period.

When dispatching in real Email or LINE provider environments, the scheduler must receive provider activation environment and block dry-run or misconfigured provider modes before calling a gateway.

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
ASTRO_EPHEMERIS_MANIFEST_PATH=/mounted/ephemeris/ephemeris-manifest.json
ASTRO_REQUIRE_PINNED_EPHEMERIS=true
```

The ephemeris path must refer to an approved mounted or packaged file set. Runtime ephemeris downloads and committed ephemeris binaries are forbidden.

Swiss Ephemeris production startup must verify the manifest fingerprint and fail closed when the mounted file set is missing, empty, unsupported, or different from the approved manifest. Health output may report that a path is configured and may report sanitized error codes, but it must not expose raw local filesystem paths or license data.

`ASTRO_CALC_SERVICE_URL` may be used by the web app for `/chart-preview?mode=live` in local or staging validation. It must point to an approved astro-calc service endpoint and must not contain embedded credentials. If the URL is missing, the service fails, or the returned snapshot is not the expected Swiss Ephemeris Thai almanac profile, the page must show Live mode as unavailable and must not fall back to Mock MVP.
