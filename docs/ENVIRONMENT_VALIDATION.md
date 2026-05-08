# ENVIRONMENT_VALIDATION.md — Environment Validation

## Goal

Provide a fail-closed configuration check before staging or production traffic uses real providers.

The web app exposes a sanitized health/config report at:

```text
GET /api/health
```

The endpoint returns HTTP `200` when configuration is valid and HTTP `503` when required configuration is missing or unsafe. It must not expose raw secrets, tokens, email addresses, LINE user IDs, payment credentials, private birth data, or provider payloads.

The Python astro calculation service also exposes a `health()` utility that validates its runtime config and reports only sanitized fields such as engine, profile, license mode, and whether an ephemeris path is configured. It must not return the raw ephemeris path.

## Environment selection

The validator reads environment in this order:

```text
APP_ENV
DEPLOYMENT_ENV
VERCEL_ENV
NODE_ENV
```

Supported normalized environments:

```text
local
staging
production
```

`development` and `test` are treated as `local`. `preview` is treated as `staging`.

## Local development

Local mode should work without production secrets.

Expected safe defaults:

```text
APP_ENV=local
EMAIL_PROVIDER_MODE=sandbox
LINE_PROVIDER_MODE=sandbox
PAYMENT_PROVIDER_MODE=mock
NOTIFICATION_SCHEDULER_MODE=disabled
ASTRO_ENGINE=mock
SWISSEPH_LICENSE_MODE=none
```

Local mode must not send real email, real LINE messages, real payment requests, or runtime ephemeris downloads.

## Staging

Staging is for deployment and smoke validation. It may use sandbox/mock modes while provider staging accounts are not ready, but the health report must make that visible with warnings.

Required outside local:

```text
ADMIN_SESSION_SECRET
EMAIL_AUDIT_HASH_SECRET
LINE_AUDIT_HASH_SECRET when LINE is not disabled
```

Real provider modes require their provider credentials even in staging. Use `ENABLE_PROVIDER_DRY_RUN=true` to validate real provider readiness without allowing real provider network calls.

## Production

Production must fail closed for unsafe defaults.

Production blocks:

- `EMAIL_PROVIDER_MODE=sandbox`
- `LINE_PROVIDER_MODE=sandbox`
- `PAYMENT_PROVIDER_MODE=mock`
- `ASTRO_ENGINE=mock`
- `LINE_PROVIDER_MODE=disabled`
- `ASTRO_ENGINE=swisseph` without `SWISSEPH_LICENSE_MODE=professional`
- `ASTRO_ENGINE=swisseph` without `ASTRO_EPHEMERIS_PATH`
- configured `MOCK_ADMIN_TOKEN`

## Provider mode variables

Email:

```text
EMAIL_PROVIDER_MODE=sandbox|http
```

`EMAIL_PROVIDER_MODE=http` requires:

```text
EMAIL_FROM_ADDRESS
EMAIL_PROVIDER_ENDPOINT
EMAIL_PROVIDER_API_KEY
EMAIL_WEBHOOK_SECRET
EMAIL_AUDIT_HASH_SECRET
EMAIL_VERIFIED_SENDER_DOMAIN
```

LINE:

```text
LINE_PROVIDER_MODE=sandbox|http|disabled
```

`LINE_PROVIDER_MODE=http` requires:

```text
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
LINE_AUDIT_HASH_SECRET
```

Payment:

```text
PAYMENT_PROVIDER_MODE=mock|http
```

`PAYMENT_PROVIDER_MODE=http` requires:

```text
PAYMENT_PROVIDER_CHECKOUT_ENDPOINT
PAYMENT_PROVIDER_API_KEY
PAYMENT_WEBHOOK_SECRET
```

Real provider activation flags:

```text
ENABLE_REAL_EMAIL_SENDS=false|true
ENABLE_REAL_LINE_SENDS=false|true
ENABLE_REAL_PAYMENT_PROVIDER=false|true
ENABLE_PROVIDER_DRY_RUN=true|false
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true|false
```

When a provider mode is `http`, environment validation fails closed unless required provider config exists. With `ENABLE_PROVIDER_DRY_RUN=true`, readiness can report sanitized dry-run warnings while keeping provider network calls blocked. With dry-run disabled, real provider mode also requires the matching `ENABLE_REAL_*` flag and `REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true`.

Notification scheduler:

```text
NOTIFICATION_SCHEDULER_MODE=disabled|dry_run|enabled
```

`NOTIFICATION_SCHEDULER_MODE=enabled` in staging or production requires:

```text
NOTIFICATION_SCHEDULER_TOKEN
```

Astro:

```text
ASTRO_ENGINE=mock|swisseph
SWISSEPH_LICENSE_MODE=none|free|professional
ASTRO_EPHEMERIS_PATH=
ASTRO_ALLOW_MOSHIER_EPHEMERIS=false
```

For local or staging calculation validation only, `ASTRO_ALLOW_MOSHIER_EPHEMERIS=true` permits the Swiss Ephemeris built-in Moshier calculation path without mounted ephemeris files. This is not a production activation path.

Swiss Ephemeris production requires:

```text
ASTRO_ENGINE=swisseph
APP_ENV=production
SWISSEPH_LICENSE_MODE=professional
ASTRO_EPHEMERIS_PATH=/mounted/ephemeris/path
```

## Health output

The report contains component names, status, mode, sanitized error codes, and environment variable names.

It must not contain raw values. Safe example:

```json
{
  "status": "error",
  "environment": "staging",
  "service": "web",
  "components": [
    {
      "component": "admin_auth",
      "status": "error",
      "mode": "signed_cookie",
      "errors": [
        {
          "code": "ADMIN_AUTH_CONFIG_MISSING",
          "message": "Admin sessions require a configured signing secret outside local development.",
          "variables": ["ADMIN_SESSION_SECRET"]
        }
      ],
      "warnings": []
    }
  ]
}
```

## Test coverage

`apps/web/tests/environment-validation.test.ts` covers:

- local/mock config without production secrets
- real email mode required config
- real LINE mode required config
- real payment mode required config
- real provider activation flags and dry-run guardrails
- Swiss Ephemeris production license/path guard
- sanitized health/config output
- sanitized missing-config errors
