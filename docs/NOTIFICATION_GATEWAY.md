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

Current PR14 LINE environment:

```text
LINE_CHANNEL_SECRET=               # LINE Messaging API channel secret, never committed
LINE_CHANNEL_ACCESS_TOKEN=         # LINE Messaging API channel access token, never committed
LINE_AUDIT_HASH_SECRET=            # runtime HMAC secret for non-PII LINE audit target IDs
```

Tests must use sandbox mode or injected providers and must never send real LINE messages. LINE delivery logs must avoid raw LINE user IDs, webhook bodies, channel secrets, access tokens, authorization headers, and provider credentials.

PR30 activation wiring:

```text
LINE_PROVIDER_MODE=sandbox   # creates a sandbox gateway
LINE_PROVIDER_MODE=http      # creates an HTTP gateway only when provider activation readiness allows network calls
LINE_PROVIDER_MODE=disabled  # no LINE gateway should be constructed
```

When `ENABLE_PROVIDER_DRY_RUN=true` or required LINE config/flags are missing, the environment gateway factory fails closed before constructing a live HTTP gateway.

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
EMAIL_AUDIT_HASH_SECRET=           # runtime HMAC secret for non-PII email audit target IDs
EMAIL_VERIFICATION_TOKEN_TTL_MS=86400000
```

Tests must use sandbox mode or injected providers and must never send real email. Email delivery logs must avoid raw email addresses, message bodies, provider API keys, authorization headers, and verification tokens.

PR30 activation wiring:

```text
EMAIL_PROVIDER_MODE=sandbox  # creates a sandbox gateway
EMAIL_PROVIDER_MODE=http     # creates an HTTP gateway only when provider activation readiness allows network calls
```

When `ENABLE_PROVIDER_DRY_RUN=true` or required Email config/flags are missing, the environment gateway factory fails closed before constructing a live HTTP gateway.

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

Scheduler dispatch in real-provider environments must pass provider activation environment into dispatch. If Email or LINE readiness is dry-run or blocked, dispatch records an activation-blocked attempt and does not call the gateway.

## PR17 scheduling foundation

PR17 adds an in-process scheduler foundation for horoscope topics:

```text
daily_horoscope
weekly_horoscope
monthly_horoscope
yearly_horoscope
```

Scheduling uses the user's timezone and preferred notification time. The MVP dispatch window is a small window around the preferred local time; if a job runs outside that window, the message is deferred and can be retried by a later job run. Quiet hours use the same defer policy: do not queue or send during quiet hours, and allow a later retry outside the quiet-hours window.

Queue idempotency is:

```text
user_id + topic_code + period_key
```

Dispatch idempotency is:

```text
outbound_message_id + channel
```

The scheduler checks active/deactivated account state, deleted birth-profile-derived horoscope artifacts, topic/channel preferences, subscription entitlement, channel unsubscribe/bounce/block state, and fallback channel policy before sending. Tests use sandbox Email and LINE gateways only.

## PR26 horoscope delivery integration

PR26 connects the deterministic horoscope content engine to scheduled delivery.
When a horoscope topic is due, the scheduler:

1. Verifies user/account activity, entitlement, preferences, unsubscribe state,
   and preferred-time/quiet-hours policy.
2. Loads the approved horoscope result for the topic period.
3. Loads the matching active chart snapshot and birth-profile-derived source
   artifact.
4. Generates delivery-ready Thai content through the content rules engine.
5. Applies the final content safety pass before queueing provider payloads.
6. Stores only sanitized delivery metadata on the queued message.

Email delivery receives escaped HTML and plain text. LINE delivery receives a
safe preview body rendered by the existing Flex preview helper. Both channels
share the same content output and metadata.

Internal delivery metadata may include period, topic, content profile, content
hash, calculation hash, chart snapshot ID, safety flags, warning codes, and
rule-hit IDs. Provider-facing Email and LINE metadata must omit stable
birth-data-derived identifiers such as calculation hash, chart snapshot ID, and
content hash. It must not include raw email addresses, LINE user IDs, birth
date/time, birth place/location, payment IDs, provider raw payloads, API keys,
webhook secrets, or tokens.

If the birth time is unknown or houses are unreliable, delivered content keeps
the softened warning from the content engine and avoids house/ascendant-specific
claims.

Tests cover Email and LINE payload conversion, entitlement gating, deleted and
deactivated account suppression, unsubscribe suppression, duplicate dispatch
prevention, no raw private data in delivery content/metadata, unsafe content
blocking, and no real provider or network calls.

## PR49 LINE-first user experience

PR49 adds a LINE-first command router and safe reply builder for common beta
user intents:

```text
ดวงวันนี้
ดวงสัปดาห์
ดวงเดือน
ดวงปี
กรอกข้อมูลเกิด
สมัครสมาชิก
ตั้งค่า
ข้อมูลส่วนตัว
ช่วยเหลือ
```

The router is a pure helper and does not call the LINE API. It can produce
welcome/help text, onboarding links, subscription/privacy/settings links, and
horoscope Flex preview payloads. Horoscope previews still rely on existing
entitlement checks, birth-profile availability, unsubscribe/deactivation
suppression, content safety wording, and provider guardrails.

PR50 routes LINE onboarding/profile/settings links through `/line/onboarding`,
`/line/profile`, and `/line/settings`. If `LINE_LIFF_URL` is configured, links
preserve the full LIFF app URL and carry the requested form route in a safe
`line_route` query parameter. These links are web form entry points only; they do
not create a real LIFF app, activate real LINE sends, or put raw LINE user IDs in
query strings.

PR51 adds a local-safe Rich Menu config/template for LINE navigation. The menu
maps message buttons to the same command-router phrases and URI buttons to the
LINE web/LIFF onboarding/settings routes. It does not call the LINE Rich Menu
API, upload assets, activate real LINE sends, or embed provider credentials.

Mock MVP diagnostic content must not be silently presented as real Thai
horoscope output in LINE. When live chart content is unavailable, LINE replies
should show a clear unavailable/onboarding/settings path instead of sending
mock horoscope content.

## Observability

Track:

- queue count
- sent count
- failure count
- provider error codes
- bounce/blocked/unsubscribed rates
- average send latency
- fallback usage rate
