# SUBSCRIPTION_PAYMENT.md — Subscription and Payment Architecture

## Goal

Implement subscription and payment logic independently from notification channels.

Payment provider can be changed without rewriting horoscope, notification, or user logic.

## Plans

Recommended initial plan codes:

```text
free
basic_monthly
premium_monthly
premium_yearly
```

## Entitlements

Example:

```text
free:
  daily_preview: true
  daily_full: false
  weekly: false
  monthly: false
  yearly: false

basic_monthly:
  daily_full: true
  weekly: true
  monthly: false
  yearly: false

premium_monthly:
  daily_full: true
  weekly: true
  monthly: true
  yearly: true
  archive: true
```

## Subscription statuses

```text
trialing
active
past_due
canceled
expired
```

PR15 lifecycle behavior:

- `active` grants plan entitlement only during `current_period_start <= now < current_period_end`.
- `trialing` grants plan entitlement until `current_period_end`.
- `past_due` does not grant entitlement in this MVP; no grace period is implemented yet.
- `canceled` with `cancel_at_period_end = true` grants entitlement until `current_period_end`.
- immediate `canceled` and `expired` subscriptions do not grant entitlement.

Subscription period fields:

```text
current_period_start
current_period_end
cancel_at_period_end
canceled_at
expired_at
```

## Payment provider abstraction

```ts
export type PaymentProvider = "mock" | "http";

export interface PaymentGateway {
  provider: PaymentProvider;

  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>;

  parseWebhook(headers: Headers, rawBody: string): Promise<PaymentWebhookEvent>;

  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
}
```

PR16 adds the first provider adapter foundation:

- `MockPaymentProvider` is for tests and local development only.
- `HttpPaymentProvider` is a configurable real-provider adapter skeleton.
- checkout session creation returns a provider session reference and checkout URL, but never activates entitlement.
- subscription activation and renewal can only happen after a verified webhook is processed.
- provider customer, checkout, payment, and subscription identifiers are stored only as provider references.
- card data, raw payment payloads, webhook secrets, and provider credentials must not be stored in application state or audit logs.

## Checkout flow

```text
1. User selects plan.
2. Web app creates checkout session.
3. User pays through provider.
4. Provider sends webhook.
5. Webhook is verified.
6. Idempotency key is checked.
7. Subscription status is updated.
8. Payment transaction is stored.
9. Receipt/confirmation email is sent.
```

## Webhook rules

Payment webhooks must be:

- signature-verified
- idempotent
- logged in audit table
- stored as raw payload where useful
- safe against duplicate events
- safe against out-of-order events

PR16 webhook signature verification uses a generic HMAC-SHA256 scheme for the provider skeleton:

```text
x-payment-timestamp: unix epoch milliseconds
x-payment-signature: hmac_sha256_base64url("${timestamp}.${rawBody}", PAYMENT_WEBHOOK_SECRET)
```

The default webhook route fails closed when `PAYMENT_WEBHOOK_SECRET` is missing, when the signature is missing or invalid, or when the timestamp is stale/future outside the accepted tolerance. Provider-specific signature schemes can replace this skeleton when the final payment provider is selected.

## Idempotency

Each provider event should map to a unique idempotency key:

```text
provider + provider_event_id
```

Never apply the same payment event twice.

## Entitlement checks

Implement entitlement middleware/helper:

```ts
canAccess(userId, "daily_full")
canAccess(userId, "weekly")
canAccess(userId, "monthly")
canAccess(userId, "yearly")
```

Do not check plan names directly in UI pages. Use entitlement functions.

## Payment/system notifications

Recommended:

- Email confirmation for payment success
- Email reminder for failed renewal
- Optional LINE short notification
- Do not rely only on LINE for receipts

## Admin controls

Admin should be able to:

- view subscription status
- view payment transaction list
- view webhook raw status
- manually mark payment as reviewed, not arbitrarily paid unless super-admin
- trigger receipt resend where safe

## MVP payment approach

Start with `mock` provider in development.

PR15 mock webhook event types:

```text
subscription.created
subscription.renewed
subscription.renewal_failed
subscription.canceled
subscription.expired
subscription.reactivated
```

The PR15 mock webhook processor is idempotent by provider event id, audits every applied state change, ignores invalid or stale transitions safely, and can invoke sandboxed notification hooks without sending real email.

PR16 payment webhook event types:

```text
checkout.session.created
checkout.session.completed
payment.succeeded
payment.failed
subscription.created
subscription.renewed
subscription.renewal_failed
subscription.canceled
subscription.expired
refund.created
refund.succeeded
```

Verified payment webhooks are mapped into PR15 subscription lifecycle events where appropriate:

- `checkout.session.completed` and `subscription.created` map to `subscription.created`.
- `subscription.renewed` maps to `subscription.renewed`.
- `payment.failed` and `subscription.renewal_failed` map to `subscription.renewal_failed`.
- `subscription.canceled` maps to `subscription.canceled`.
- `subscription.expired` maps to `subscription.expired`.
- `payment.succeeded` can trigger a sandboxed payment receipt email hook, but does not activate entitlement by itself.
- refund events are placeholders in PR16 and do not change subscription state.

Environment placeholders:

```text
PAYMENT_PROVIDER_MODE=mock
PAYMENT_PROVIDER_CHECKOUT_ENDPOINT=
PAYMENT_PROVIDER_API_KEY=
PAYMENT_WEBHOOK_SECRET=
```

Then implement real provider only after:

- business plan selected
- recurring/subscription support confirmed
- webhook signature verification documented
- refund and cancellation policy drafted
- staging test completed

## Production gate

Human approval required before activating real payment provider.
