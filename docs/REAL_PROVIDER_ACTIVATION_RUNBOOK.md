# REAL_PROVIDER_ACTIVATION_RUNBOOK.md - Real Provider Activation Runbook

## Goal

Define the safe operator path for enabling real Email, LINE, or Payment providers after human approval. PR30 wires real Email and LINE construction through the provider activation guardrails; it does not add production secrets, deploy, send real messages, or call real payment APIs.

## Approval gates

Human approval is required before:

- enabling `ENABLE_REAL_EMAIL_SENDS=true`
- enabling `ENABLE_REAL_LINE_SENDS=true`
- enabling `ENABLE_REAL_PAYMENT_PROVIDER=true`
- setting `REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true` for real activation
- changing production secrets or provider dashboard configuration
- sending real Email or LINE campaigns
- activating a payment provider

## Shared guardrails

Real provider mode must be explicit. Partial credentials must not activate a provider.

```text
ENABLE_PROVIDER_DRY_RUN=false
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
```

Dry-run may use real provider configuration to validate readiness, but it must keep:

```text
ENABLE_PROVIDER_DRY_RUN=true
```

Dry-run must not send real email, push LINE messages, create checkout sessions, call payment APIs, mutate real subscription/payment state, or log raw provider payloads.

The Email and LINE gateway environment factories fail closed when provider mode is `http` but the matching PR29 readiness component does not allow network calls. With `ENABLE_PROVIDER_DRY_RUN=true`, the factories must not construct live HTTP gateways. Scheduler dispatches that pass provider activation environment must record `email_provider_activation_blocked` or `line_provider_activation_blocked` before calling a gateway.

## Enable real email safely

Required variables:

```text
EMAIL_PROVIDER_MODE=http
EMAIL_FROM_ADDRESS
EMAIL_VERIFIED_SENDER_DOMAIN
EMAIL_PROVIDER_ENDPOINT
EMAIL_PROVIDER_API_KEY
EMAIL_WEBHOOK_SECRET
EMAIL_AUDIT_HASH_SECRET
ENABLE_REAL_EMAIL_SENDS=true
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
ENABLE_PROVIDER_DRY_RUN=false
```

Verify sender/domain ownership in the email provider dashboard before disabling dry-run. Do not log raw email addresses, subjects, bodies, API keys, webhook secrets, or raw provider payloads.

## Enable real LINE safely

Required variables:

```text
LINE_PROVIDER_MODE=http
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
LINE_AUDIT_HASH_SECRET
ENABLE_REAL_LINE_SENDS=true
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
ENABLE_PROVIDER_DRY_RUN=false
```

Use only approved LINE Official Account credentials. Do not log raw LINE user IDs, channel secrets, access tokens, message bodies, or webhook payloads.

## Enable real payment safely

Required variables:

```text
PAYMENT_PROVIDER_MODE=http
PAYMENT_PROVIDER_CHECKOUT_ENDPOINT
PAYMENT_PROVIDER_API_KEY
PAYMENT_WEBHOOK_SECRET
ENABLE_REAL_PAYMENT_PROVIDER=true
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
ENABLE_PROVIDER_DRY_RUN=false
```

Payment webhook signature verification and idempotency must be verified before activation. Client-side checkout success must never activate a subscription; only verified server-side webhooks may mutate entitlement state.

## Staging verification

Run before any human staging activation:

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

Then run the provider dry-run checklist in `docs/PROVIDER_DRY_RUN.md` and confirm `/api/health` plus the provider activation safety harness return sanitized output only.

## Rollback

1. Set the relevant real enable flag back to `false`.
2. Set `ENABLE_PROVIDER_DRY_RUN=true` or return provider modes to `sandbox`/`mock`.
3. Pause scheduler jobs if delivery safety is uncertain.
4. Re-check `/api/health` and provider activation readiness.
5. Record sanitized error codes only. Do not paste secrets, raw payloads, emails, LINE user IDs, payment identifiers, or birth data into tickets.

## Out of scope

PR30 does not choose vendors, add secrets, deploy, send real messages, call real payment APIs, change payment provider behavior, change astrology calculation behavior, alter subscription lifecycle behavior, or approve production launch.
