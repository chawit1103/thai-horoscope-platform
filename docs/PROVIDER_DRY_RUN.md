# PROVIDER_DRY_RUN.md - Provider Dry Run

## Goal

Validate real provider readiness without sending real email, pushing LINE messages, creating checkout sessions, calling payment APIs, or mutating real subscription/payment/channel state.

## Dry-run environment

Use staging or a local operator shell with secrets supplied by the deployment platform, not committed files.

```text
APP_ENV=staging
ENABLE_PROVIDER_DRY_RUN=true
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=false
```

For each provider under review, set its provider mode to `http` and provide the required config. Keep the real enable flag disabled during dry-run:

```text
ENABLE_REAL_EMAIL_SENDS=false
ENABLE_REAL_LINE_SENDS=false
ENABLE_REAL_PAYMENT_PROVIDER=false
```

## Expected behavior

- Required provider config is checked.
- Missing or partial config fails closed.
- Network calls remain blocked.
- Status output contains component names, modes, status, error codes, warning codes, and variable names only.
- Status output must not contain API keys, access tokens, webhook secrets, email credentials, raw emails, raw LINE user IDs, raw payment payloads, card data, private birth data, ephemeris paths, or license strings.

## Procedure

1. Configure only the provider being evaluated.
2. Run `pnpm test`. For a focused local pre-check, run `cd apps/web && node --import tsx --test --test-name-pattern "provider activation guardrails" tests/provider-activation-guardrails.test.ts`.
3. Run the provider activation safety harness through the web test suite with provider/fetch network telemetry supplied.
4. Open `/api/health` in staging after human deployment.
5. Confirm dry-run warnings are expected and sanitized.
6. Confirm provider dashboards show no real send, push, checkout, payment, or webhook side effect from the dry-run.

## Passing dry-run

Dry-run passes when:

```text
[ ] Missing config fails closed
[ ] Full config reports dry_run, not activated
[ ] networkCallsAllowed=false for Email, LINE, and Payment
[ ] networkCallsAttempted=false in the safety harness when provider/fetch telemetry counters are supplied
[ ] Output is safe for admin/operator console display
```

## Rollback

Return provider modes to mock-safe values:

```text
EMAIL_PROVIDER_MODE=sandbox
LINE_PROVIDER_MODE=sandbox
PAYMENT_PROVIDER_MODE=mock
ENABLE_PROVIDER_DRY_RUN=true
ENABLE_REAL_EMAIL_SENDS=false
ENABLE_REAL_LINE_SENDS=false
ENABLE_REAL_PAYMENT_PROVIDER=false
```

## Out of scope

Dry-run is not permission to send real messages, activate payment, deploy production, add production secrets, or alter subscription lifecycle behavior.
