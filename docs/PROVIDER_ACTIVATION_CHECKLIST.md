# PROVIDER_ACTIVATION_CHECKLIST.md - Provider Activation Checklist

## Status

PR33 status: Email, LINE, and Payment environment wiring is guarded by PR29 activation readiness. Real provider calls still require explicit human approval, complete config, matching enable flags, and `ENABLE_PROVIDER_DRY_RUN=false`.

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
[ ] Scheduler dispatch passes provider activation env in real-provider environments
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
[ ] Environment gateway factory constructs HTTP Email gateway only after readiness reports `networkCallsAllowed=true`
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
[ ] Environment gateway factory constructs HTTP LINE gateway only after readiness reports `networkCallsAllowed=true`
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
[ ] Environment payment provider factory constructs HTTP provider only after readiness reports `networkCallsAllowed=true`
[ ] Checkout creation returns a provider session reference only and does not activate subscription
[ ] Verified webhook processing is the only entitlement activation path
[ ] Webhook signature verification tested
[ ] Webhook idempotency tested
[ ] Client return confirmed not to activate subscription
[ ] Duplicate payment succeeded events do not duplicate receipt hooks
[ ] Unknown checkout session, provider mismatch, user mismatch, and plan mismatch reject without granting entitlement
```

Never log card data, payment API keys, webhook secrets, raw payment payloads, or raw customer identifiers.

## No-go conditions

```text
[ ] Missing required provider config
[ ] Partial env vars only
[ ] Dry-run output exposes secrets or PII
[ ] Any test requires a real provider credential
[ ] Any test sends email, LINE, payment, webhook, or vendor traffic
[ ] Scheduler can dispatch Email or LINE without provider activation checks in real-provider environments
[ ] Payment entitlement depends on client-side success
[ ] Rollback owner is unknown
```
