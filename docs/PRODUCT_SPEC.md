# PRODUCT_SPEC.md — Thai Horoscope Subscription Platform

## Product name

Working name: Thai Horoscope Subscription Platform

## One-line description

A subscription platform that delivers Thai astrology-based daily, weekly, monthly, and yearly horoscope content through LINE, Email, and future messaging channels.

## Product stance

This product is not positioned as medical, legal, financial, or deterministic prediction. It is positioned as:

- Entertainment
- Self-reflection
- Lifestyle guidance
- Personal ritual and journaling support

Required disclaimer example:

```text
เนื้อหานี้จัดทำเพื่อความบันเทิงและการทบทวนตนเองเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์ การเงิน กฎหมาย หรือการตัดสินใจที่มีความเสี่ยงสูง
```

## Target users

Primary:

- Thai-speaking consumers who already use LINE daily
- Users interested in horoscope, auspicious timing, relationship and work guidance
- Users who prefer short, personalized, mobile-friendly content

Secondary:

- Users who prefer email digest
- Tech-savvy users who may prefer Telegram
- B2B/corporate wellness use cases via Microsoft Teams in the future

## Channels

MVP channels:

- LINE Official Account + Messaging API
- Email

Future channels:

- Telegram Bot
- Microsoft Teams Bot
- Slack or Discord if community product direction emerges

The product must be channel-agnostic. LINE is a delivery channel, not the core architecture.

## Core user journey

```text
1. User opens link from LINE Rich Menu, email, or website.
2. User creates or links account.
3. User enters birth profile:
   - birth date
   - birth time, optional
   - unknown birth time checkbox
   - birth place
   - timezone
4. User consents to data usage.
5. User chooses subscription plan.
6. User reads daily/weekly/monthly/yearly horoscope.
7. User configures notification preferences.
8. System sends notifications through preferred channel.
```

## Subscription plans

Initial recommended plans:

### Free

- Daily preview only
- Limited personalization
- No archive

### Basic

- Daily horoscope
- Weekly horoscope
- LINE or Email notification

### Premium

- Daily horoscope
- Weekly horoscope
- Monthly horoscope
- Yearly horoscope
- Archive/history
- More personalized analysis using birth profile and chart snapshot

## Content categories

Each horoscope result may include:

- Overview
- Work or study
- Money
- Love and relationships
- Wellness, non-medical
- Reflection prompt
- Color or number, entertainment-only
- Good timing window, entertainment-only

## Personalization levels

### Level 0 — Generic

No birth data required. Content based on general period.

### Level 1 — Birth date

Uses date of birth and zodiac/rasi grouping.

### Level 2 — Birth date + approximate time

May use moon/sign-level information, but warns if time confidence is low.

### Level 3 — Full birth date, time, place

Uses natal chart, transit chart, houses, aspects, and calculation profile.

## User controls

Users must be able to:

- Edit birth profile
- Mark birth time as unknown
- Change notification channel
- Change notification time
- Disable daily/weekly/monthly/yearly notifications
- Delete account or birth profile data
- Unsubscribe from marketing messages

## Admin controls

Admins must be able to:

- View users and subscription status
- View generated horoscope results
- Approve or reject content
- View rule hits and chart snapshot IDs
- View outbound message delivery attempts
- Resend failed messages, where appropriate
- Disable unsafe content templates

## Success metrics

MVP metrics:

- Account creation conversion
- Birth profile completion rate
- Subscription conversion
- Daily open rate
- Weekly open rate
- Notification opt-out rate
- Failed delivery rate
- Payment success rate
- Churn rate

## Out of scope for MVP

- LINE MINI App
- Telegram Mini App
- Microsoft Teams full B2B tenant onboarding
- Fully automated yearly readings without human review
- Medical predictions
- Financial/investment advice
- Ritual sales or fear-based upsells
