# PROVIDER_ACTIVATION_CHECKLIST.md - Provider Activation Checklist

## Status

PR29 status: guardrails and dry-run harness only. Real providers are not activated.

## Shared checklist

```text
[ ] Human owner approved the specific provider activation
[ ] Secrets are stored only in the deployment platform
[ ] No .env file or production credential is committed
[ ] ENABLE_PROVIDER_DRY_RUN=true was tested first
[ ] Dry-run readiness output is sanitized
[ ] /api/health output is sanitized
[ ] No tests call real provider networks
[ ] Rollback owner and rollback steps are recorded
[ ] Scheduler behavior is understood before real sends
```

## Email

```text
[ ] EMAIL_PROVIDER_MODE=http
[ ] EMAIL_FROM_ADDRESS configured
[ ] EMAIL_VERIFIED_SENDER_DOMAIN configured and verified
[ ] EMAIL_PROVIDER_ENDPOINT configured for the intended environment
[ ] EMAIL_PROVIDER_API_KEY configured outside the repo
[ ] EMAIL_WEBHOOK_SECRET configured outside the repo
[ ] EMAIL_AUDIT_HASH_SECRET configured outside the repo
[ ] ENABLE_REAL_EMAIL_SENDS=true only after approval
[ ] REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
[ ] ENABLE_PROVIDER_DRY_RUN=false only after dry-run passes
```

Never log raw emails, email credentials, webhook secrets, subject/body content, or raw provider payloads.

## LINE

```text
[ ] LINE_PROVIDER_MODE=http
[ ] LINE_CHANNEL_SECRET configured outside the repo
[ ] LINE_CHANNEL_ACCESS_TOKEN configured outside the repo
[ ] LINE_AUDIT_HASH_SECRET configured outside the repo
[ ] ENABLE_REAL_LINE_SENDS=true only after approval
[ ] REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
[ ] ENABLE_PROVIDER_DRY_RUN=false only after dry-run passes
```

Never log raw LINE user IDs, channel secrets, access tokens, message bodies, or raw webhook payloads.

## Payment

```text
[ ] PAYMENT_PROVIDER_MODE=http
[ ] PAYMENT_PROVIDER_CHECKOUT_ENDPOINT configured for the intended environment
[ ] PAYMENT_PROVIDER_API_KEY configured outside the repo
[ ] PAYMENT_WEBHOOK_SECRET configured outside the repo
[ ] ENABLE_REAL_PAYMENT_PROVIDER=true only after approval
[ ] REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
[ ] ENABLE_PROVIDER_DRY_RUN=false only after dry-run passes
[ ] Webhook signature verification tested
[ ] Webhook idempotency tested
[ ] Client return confirmed not to activate subscription
```

Never log card data, payment API keys, webhook secrets, raw payment payloads, or raw customer identifiers.

## No-go conditions

```text
[ ] Missing required provider config
[ ] Partial env vars only
[ ] Dry-run output exposes secrets or PII
[ ] Any test requires a real provider credential
[ ] Any test sends email, LINE, payment, webhook, or vendor traffic
[ ] Payment entitlement depends on client-side success
[ ] Rollback owner is unknown
```
