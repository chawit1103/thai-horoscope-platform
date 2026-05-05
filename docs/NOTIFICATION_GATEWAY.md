# NOTIFICATION_GATEWAY.md — Multi-Channel Delivery Architecture

## Goal

Build a channel-agnostic notification system where LINE, Email, Telegram, Microsoft Teams, and future channels are adapters.

The core product must not depend on any single provider.

## Core principle

```text
Business logic decides what to send.
Notification router decides where to send.
Gateway adapter knows how to send for one provider.
```

## Initial channels

MVP:

- LINE
- Email

Future:

- Telegram
- Microsoft Teams

## TypeScript interface

```ts
export type DeliveryChannel = "line" | "email" | "telegram" | "teams";

export type DeliveryStatus =
  | "sent"
  | "failed"
  | "blocked"
  | "bounced"
  | "unsubscribed"
  | "rate_limited";

export type OutboundMessage = {
  userId: string;
  topicCode:
    | "daily_horoscope"
    | "weekly_horoscope"
    | "monthly_horoscope"
    | "yearly_horoscope"
    | "payment"
    | "system";
  title: string;
  body: string;
  ctaUrl?: string;
  imageUrl?: string;
  metadata?: Record<string, unknown>;
};

export type DeliveryResult = {
  status: DeliveryStatus;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  raw?: unknown;
};

export interface NotificationGateway {
  channel: DeliveryChannel;

  send(
    channelAccount: ChannelAccount,
    message: OutboundMessage
  ): Promise<DeliveryResult>;

  verifyWebhook?(headers: Headers, body: string): Promise<boolean>;

  normalizeInboundEvent?(body: unknown): Promise<NormalizedInboundEvent[]>;
}
```

## Router behavior

Input:

```text
user_id
topic_code
outbound message payload
```

Behavior:

1. Load enabled notification preferences for the topic.
2. Sort preferences by priority.
3. Select the first active channel account.
4. Send through that gateway.
5. Record delivery attempt.
6. If status is blocked, bounced, or unsubscribed, mark channel account inactive.
7. Try fallback channel if configured.
8. Return final status.
9. Never send to more than one channel unless `multi_channel_enabled = true`.

## Default routing rules

### Daily horoscope

Recommended default:

```text
primary: LINE
fallback: Email
preferred_time: 07:30 local time
```

### Weekly horoscope

Recommended default:

```text
primary: LINE or Email depending on user preference
fallback: Email
preferred_time: Monday 08:00 local time
```

### Payment and system messages

Recommended default:

```text
email: required if verified
line: optional short notification
```

## LINE gateway requirements

- Verify webhook signature.
- Store inbound follow/unfollow/message/postback events.
- Send push or multicast messages only to users who have a valid channel account.
- Handle blocked/unfollow status.
- Never log channel access token.
- Use Flex Message for rich horoscope preview where appropriate.

## Email gateway requirements

- Support sandbox mode for development.
- Support verified sender/domain in production.
- Track delivery, bounce, complaint, unsubscribe where provider supports it.
- Include unsubscribe link for marketing/promotional messages.
- Payment/system emails may be required transactional messages.

Current PR13 email environment:

```text
EMAIL_PROVIDER_MODE=sandbox        # sandbox | http
EMAIL_FROM_ADDRESS=                # verified sender/from address outside tests
EMAIL_PROVIDER_ENDPOINT=           # provider HTTP endpoint when mode=http
EMAIL_PROVIDER_API_KEY=            # provider API key, never committed
EMAIL_WEBHOOK_SECRET=              # provider webhook verification secret, never committed
```

Tests must use sandbox mode or injected providers and must never send real email. Email delivery logs must avoid raw email addresses, message bodies, provider API keys, authorization headers, and verification tokens.

## Telegram gateway future requirements

- Users must start the bot before receiving private messages.
- Use start parameter token to link account:

```text
https://t.me/<bot_name>?start=link_<token>
```

- Store Telegram user id and chat id.
- Do not rely on username as stable identity.
- Treat Telegram payment/digital goods rules separately from delivery.

## Microsoft Teams gateway future requirements

- Likely B2B/corporate feature.
- Store conversation reference or installation context.
- Support proactive messages only after proper bot installation/context exists.
- Keep tenant/admin consent separate from individual user consent.

## Retry policy

Recommended:

```text
rate_limited: retry with backoff
temporary provider failure: retry with backoff
blocked: mark inactive, do not retry that channel
bounced: mark inactive, do not retry that channel
unsubscribed: mark inactive for the topic or channel
```

## Idempotency

Every generated outbound message should have a natural uniqueness key:

```text
user_id + topic_code + period_type + period_key
```

Do not send duplicate daily horoscope messages unless explicitly requested.

## Observability

Track:

- queue count
- sent count
- failure count
- provider error codes
- bounce/blocked/unsubscribed rates
- average send latency
- fallback usage rate
