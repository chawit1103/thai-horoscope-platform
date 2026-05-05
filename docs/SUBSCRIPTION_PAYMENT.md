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
export type PaymentProvider = "mock" | "line_pay" | "stripe" | "omise" | "other";

export interface PaymentGateway {
  provider: PaymentProvider;

  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>;

  parseWebhook(headers: Headers, rawBody: string): Promise<PaymentWebhookEvent>;

  verifyWebhook(headers: Headers, rawBody: string): Promise<boolean>;
}
```

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

Then implement real provider only after:

- business plan selected
- recurring/subscription support confirmed
- webhook signature verification documented
- refund and cancellation policy drafted
- staging test completed

## Production gate

Human approval required before activating real payment provider.
