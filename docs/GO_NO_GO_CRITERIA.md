# GO_NO_GO_CRITERIA.md - Go/No-Go Criteria

## Goal

Define explicit beta release decision criteria so operators do not mistake staging/beta readiness for production approval.

## Decision roles

```text
Release owner: required
Engineering owner: required
Security/privacy owner: required before production
Payment owner: required before real provider activation
LINE/email owner: required before real provider sends
Astro/license owner: required before Swiss Ephemeris production use
Support owner: required before beta invitations
```

## Go conditions for staging beta

```text
[ ] Required checks pass
[ ] Staging deploy is performed by a human operator
[ ] No production secrets are committed
[ ] No .env file is committed
[ ] No ephemeris binaries are committed
[ ] /api/health returns ok or accepted staging-only warnings
[ ] Local/mock mode still works without production secrets
[ ] Real provider modes fail closed without required secrets
[ ] Mock/sandbox provider modes are visible in health output
[ ] Manual beta smoke tests pass
[ ] Logs, alerts, health, audit metadata, and PR comments do not expose raw PII or secrets
[ ] Payment webhook signature and idempotency behavior are validated in mock or staging/test mode
[ ] Notification duplicate-send prevention and suppression behavior are validated
[ ] Privacy export/delete/unsubscribe/deactivation paths are smoke-tested
[ ] Astro-calc health and known limitations are accepted
[ ] Monitoring events and mock alert provider are validated
[ ] Rollback owner, rollback target, and user communication path are recorded
```

## No-go conditions

```text
[ ] Any required check fails
[ ] Any production secret, .env file, payment credential, provider token, or ephemeris binary is committed
[ ] Raw email address, raw LINE user ID, birth date/time/place, payment payload, card data, API key, webhook secret, or ephemeris path appears in logs/alerts/health output
[ ] Admin route or server action can run without a verified admin session
[ ] Production config allows MOCK_ADMIN_TOKEN
[ ] Real provider mode can start without required provider credentials
[ ] Payment entitlement can change without verified webhook processing
[ ] Webhook idempotency can duplicate subscription, receipt, or audit side effects
[ ] Notification scheduler can send after deletion, deactivation, unsubscribe, block, or bounce
[ ] Tests send real payment, LINE, email, Slack, webhook, or vendor alert traffic
[ ] Swiss Ephemeris production use lacks professional license approval
[ ] ASTRO_ENGINE=swisseph lacks approved ASTRO_EPHEMERIS_PATH and file manifest
[ ] Runtime ephemeris downloads are required
[ ] Beta copy claims guaranteed outcomes, medical/legal/financial advice, unavoidable harm, or 100% accuracy
[ ] Rollback path is unknown
```

## Human approvals needed

Human approval is required before:

- merging PRs
- staging deploy
- production deploy
- production secret changes
- real payment provider activation
- real LINE or email sends
- production alert provider credentials
- Swiss Ephemeris commercial/professional strategy
- production ephemeris file mount or packaging
- privacy, retention, or consent behavior changes

## Production secret readiness

Go only when:

```text
[ ] Required variable names are documented
[ ] Values are configured outside the repository
[ ] Access is least privilege
[ ] Rotation owner is known
[ ] Health output lists variable names only, never raw values
[ ] PR comments and support tickets do not include raw values
```

No-go when:

```text
[ ] Secrets are pasted into code, docs, issues, PR comments, screenshots, logs, or chat
[ ] Production and staging share credentials
[ ] Provider tokens have unnecessary privileges
```

## Swiss Ephemeris license readiness

Go for production only when:

```text
[ ] Human/legal owner approves the production license strategy
[ ] SWISSEPH_LICENSE_MODE=professional is documented for production
[ ] ASTRO_EPHEMERIS_PATH points to approved mounted or packaged files
[ ] File manifest records supported files, sizes, SHA-256 hashes, and combined fingerprint
[ ] No runtime downloads occur
[ ] No ephemeris binaries are committed
[ ] Real-engine golden fixtures are approved after file/license decision
```

No-go when any item is missing.

## Payment provider readiness

Go for real provider activation only when:

```text
[ ] Provider and plan strategy are approved
[ ] Staging/test checkout is validated
[ ] Webhook signature verification is provider-specific or explicitly approved
[ ] Webhook idempotency uses durable storage before production
[ ] Checkout session binding is validated
[ ] Receipt hook behavior is deduplicated
[ ] Refund and cancellation support process is documented
[ ] No card data is stored
```

No-go when payment is still mock-only for production, webhook durability is missing, or support handling is unclear.

## LINE and email provider readiness

Go for real sends only when:

```text
[ ] Provider credentials are staging/test or production as intended
[ ] Webhook secrets are configured where applicable
[ ] Test recipients are approved
[ ] Audit metadata is sanitized
[ ] Blocked/unsubscribed/bounced handling is validated
[ ] Delivery attempts are recorded
[ ] No sends occur after deletion or deactivation
```

No-go when credentials are missing, recipients are not approved, or suppression behavior is unproven.
