# LINE_FIRST_UX.md - LINE-first beta user experience

## Purpose

End users primarily interact with the Thai Horoscope Platform through LINE Messaging. The responsive web app remains available for onboarding forms, account settings, privacy controls, subscription status, admin/operator work, and chart validation.

This is not a LINE MINI App. LINE is a messaging entry point and must not own core business logic.

## Supported user intents

The LINE command router recognizes these intents:

```text
follow / welcome
help
today
weekly
monthly
yearly
onboarding
profile
subscription
notification_settings
privacy
unknown
```

Supported Thai message examples:

```text
ดวงวันนี้
ดูดวงวันนี้
ดวงสัปดาห์
ดวงเดือน
ดวงปี
สมัครสมาชิก
ตั้งค่า
แก้ข้อมูลเกิด
ข้อมูลส่วนตัว
ช่วยเหลือ
```

Unknown messages return a safe help response instead of attempting free-form interpretation.

## User flow

1. User follows the LINE Official Account.
2. Bot replies with a Thai welcome message and available actions.
3. If the user requests horoscope content without a birth profile, the bot sends the LINE web/LIFF onboarding link.
4. If the user has a birth profile and entitlement, the bot can send a LINE Flex Message preview.
5. If the user lacks entitlement, the bot explains the plan limitation and links to subscription status.
6. If the user is unsubscribed, deactivated, deleted, blocked, or unfollowed, horoscope content is suppressed.

## LINE horoscope preview

Flex previews may include:

```text
period label
short overview
work / money / relationship / wellness summaries
advice
caution
safety disclaimer
CTA: ดูรายละเอียด
CTA: แก้ข้อมูลเกิด
CTA: ตั้งค่าการแจ้งเตือน
```

The user-facing payload must not expose raw birth date, birth time, birth place, email, LINE user ID, payment IDs, provider payloads, secrets, internal audit IDs, calculation hashes, or debug metadata.

## Safety copy

Use calm Thai wording:

```text
เพื่อความบันเทิงและการสะท้อนตนเอง
โปรดใช้วิจารณญาณ
หากไม่ทราบเวลาเกิด ผลบางส่วนจะเป็นค่าประมาณ
```

Do not include claims about guaranteed outcomes, death, accidents, serious illness, medical diagnosis, investment instruction, legal advice, lottery wins, or fear-based urgency.

## Source modes

Internally, LINE replies can track content source mode:

```text
live_chart_based
prototype_rules
mock_rules
```

Debug source details are not shown to end users. If live chart content is unavailable, LINE should not silently present Mock MVP content as real horoscope output.

## Provider safety

PR49 does not activate real LINE sends by default. Tests use pure command routing and sandbox-safe helpers. Real LINE reply or push behavior remains governed by existing provider activation guardrails:

```text
ENABLE_REAL_LINE_SENDS=true
LINE_CHANNEL_SECRET
LINE_CHANNEL_ACCESS_TOKEN
LINE_AUDIT_HASH_SECRET
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
```

No test should call the LINE Messaging API.

## PR50 LINE web onboarding

Structured birth profile entry uses web routes opened from LINE:

```text
/line/onboarding
/line/profile
/line/settings
/line/onboarding/saved
```

If `LINE_LIFF_URL` is configured, LINE command links preserve the full LIFF app URL and pass the target form path through the allowlisted `line_route` query parameter. If it is not configured, local/dev links fall back to `NEXT_PUBLIC_APP_BASE_URL` or the configured base URL used by tests. Links must never include raw LINE user IDs, payment IDs, secrets, or internal audit IDs.
