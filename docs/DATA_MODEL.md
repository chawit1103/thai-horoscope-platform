# DATA_MODEL.md — Database Model

## Goals

The data model must support:

- Multiple user identities and delivery channels
- Birth profile and consent tracking
- Versioned calculation profiles
- Reproducible chart snapshots
- Subscription and payment state
- Horoscope result generation and approval
- Notification routing and delivery audit
- Data deletion and compliance workflows

## Core enums

```text
DeliveryChannel = line | email | telegram | teams
ChannelStatus = active | pending_verification | blocked | bounced | unsubscribed | disabled
SubscriptionStatus = trialing | active | past_due | canceled | expired
PeriodType = daily | weekly | monthly | yearly
HoroscopeStatus = draft | approved | rejected | sent | archived
PaymentStatus = pending | succeeded | failed | refunded | canceled
ChartType = natal | transit | solar_return | progressed
```

## users

```text
id
primary_email
display_name
locale
timezone
status
created_at
updated_at
last_seen_at
```

Notes:

- Do not assume every user starts with email.
- LINE-only users may later add email.
- Email should be verified before using for account recovery.

## channel_accounts

```text
id
user_id
channel                  -- line, email, telegram, teams
provider_user_id          -- LINE userId, Telegram user id, Teams user id
address                   -- email, chat_id, conversation_id, etc.
display_name
status
verified_at
last_seen_at
metadata_json
created_at
updated_at
```

Indexes:

```text
unique(channel, provider_user_id)
index(user_id, channel)
index(status)
```

## birth_profiles

```text
id
user_id
birth_date
birth_time
birth_time_unknown
birth_time_accuracy_minutes
birth_place_text
birth_lat
birth_lng
birth_elevation_m
timezone
timezone_source
geocoding_confidence
calendar_system
active
created_at
updated_at
```

Notes:

- If `birth_time_unknown = true`, do not produce high-confidence ascendant/house interpretations.
- Preserve profile history if changing birth data would affect past generated results.

## user_consents

```text
id
user_id
consent_type              -- terms, privacy, birth_data, marketing, notification
version
accepted
accepted_at
revoked_at
source
metadata_json
```

## calculation_profiles

```text
id
code                      -- TH_NIRAYANA_V1
engine                    -- swisseph, skyfield, mock
engine_version
ephemeris_source           -- swiss_compressed, jpl_bsp, mock
ephemeris_file
zodiac_type                -- tropical, sidereal
ayanamsha
house_system
node_type                  -- true_node, mean_node
position_type              -- apparent, mean
observer_mode              -- geocentric, topocentric
coordinate_system
notes
active
created_at
updated_at
```

## chart_snapshots

```text
id
user_id
birth_profile_id
calculation_profile_id
chart_type
subject_datetime_local
subject_datetime_utc
julian_day_ut
location_lat
location_lng
timezone
planets_json
houses_json
aspects_json
derived_points_json
warnings_json
engine_version
ephemeris_fingerprint
calculation_hash
created_at
```

Indexes:

```text
unique(calculation_hash)
index(user_id, chart_type)
index(birth_profile_id)
index(calculation_profile_id)
```

## subscriptions

```text
id
user_id
plan_code
status
current_period_start
current_period_end
cancel_at_period_end
canceled_at
expired_at
payment_provider
provider_customer_id
provider_subscription_id
metadata_json
created_at
updated_at
```

## payment_transactions

```text
id
user_id
subscription_id
provider
provider_transaction_id
provider_checkout_session_id
idempotency_key
amount
currency
status
raw_payload_json
created_at
updated_at
```

PR16 payment-provider state must store provider references only. Do not store card numbers, CVC/CVV values, provider API keys, webhook secrets, or raw sensitive payment payloads.

Indexes:

```text
unique(provider, provider_transaction_id)
unique(idempotency_key)
```

## horoscope_results

```text
id
user_id
period_type
period_key
natal_chart_snapshot_id
transit_chart_snapshot_id
rule_hits_json
content_json
safety_flags_json
status
generated_at
approved_at
approved_by
sent_at
```

Indexes:

```text
unique(user_id, period_type, period_key)
index(status)
index(period_type, period_key)
```

## notification_topics

```text
id
code                      -- daily_horoscope, weekly_horoscope, payment, system
name_th
required
created_at
updated_at
```

## notification_preferences

```text
id
user_id
topic_code
channel_account_id
enabled
priority                  -- 1 = primary, 2 = fallback
multi_channel_enabled
preferred_time
timezone
quiet_hours_json
created_at
updated_at
```

## outbound_messages

```text
id
user_id
topic_code
period_type
period_key
title
body
cta_url
payload_json
status                    -- queued, sending, sent, failed, canceled
scheduled_at
created_at
updated_at
```

## delivery_attempts

```text
id
outbound_message_id
channel_account_id
channel
provider_message_id
status                    -- sent, failed, bounced, blocked, rate_limited, unsubscribed
error_code
error_message
attempted_at
raw_response_json
```

## inbound_events

```text
id
channel
provider_event_id
provider_user_id
event_type
payload_json
received_at
```

## audit_logs

```text
id
actor_type                -- user, admin, system, agent
actor_id
action
target_type
target_id
metadata_json
created_at
```

## Data deletion principles

When a user deletes their account:

- Remove or anonymize personal identifiers.
- Delete birth profile data unless retention is legally required.
- Retain payment records only where required for accounting/legal reasons.
- Retain aggregate analytics without personal identifiers.
- Record deletion event in audit log without exposing sensitive data.
