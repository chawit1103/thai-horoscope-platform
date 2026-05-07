# MONITORING_ALERTING.md — Monitoring and Alerting

## Goal

Define the PR21 monitoring, logging, and alerting foundation without adding a real vendor dependency or sending real alerts from tests.

## Structured events

Monitoring events are structured objects with:

```text
type
severity
source
createdAt
subjectRef
dedupeKey
metadata
```

`subjectRef` and `dedupeKey` are safe references, not raw user identifiers.

## Monitored event types

Payment:

- `payment_webhook_signature_failed`
- `payment_webhook_idempotency_duplicate`
- `payment_webhook_processing_failed`

Email:

- `email_delivery_failed`
- `email_bounce_spike_detected`

LINE:

- `line_webhook_signature_failed`
- `line_delivery_failed`

Notification scheduler:

- `notification_scheduler_failed`
- `duplicate_send_prevented`

Privacy and admin:

- `privacy_export_requested`
- `account_deletion_requested`
- `admin_auth_denied`

Astro and environment:

- `astro_calc_health_failed`
- `astro_ephemeris_config_invalid`
- `environment_validation_failed`

Subscription:

- `subscription_webhook_anomaly`

## Severity levels

```text
info      expected operational event, no alert
warning   unusual but bounded behavior, usually no page
error     failed user-facing or provider workflow, alert during business hours
critical  production launch blocker, security-sensitive failure, or paid-flow risk
```

Critical examples:

- production payment webhook processing failure
- production astro-calc health failure
- invalid Swiss Ephemeris production license or ephemeris path
- production environment validation failure for payment or astro
- repeated admin auth denials from a suspicious source

## Never log

Logs, alerts, health reports, PR comments, and audit metadata must not contain:

- email addresses
- raw LINE user IDs
- birth date
- birth time
- birth place or location
- payment provider raw payloads
- card numbers, PAN, CVC, or CVV
- webhook secrets
- API keys or bearer tokens
- ephemeris license data
- raw ephemeris paths
- email body, LINE body, or horoscope interpretation text when not required for debugging

Redaction must happen before storing or emitting logs or alerts.

## Alert providers

PR21 includes a mock alert provider for tests and local validation. It records sanitized alerts in memory and does not perform network calls.

Production alerting may later connect Slack, email, PagerDuty, or another provider only after human approval and staging validation. Provider credentials must stay outside the repository.

## Alert suppression

Repeated non-critical alerts should use a stable sanitized `dedupeKey`. The mock provider suppresses duplicate events within its configured window.

Do not suppress critical payment, security, or astro production guard failures until a durable alerting backend and escalation policy are approved.

## Health and status

Operational status helpers may expose:

- service name
- environment
- component name
- status
- mode
- sanitized error codes
- sanitized warning codes

They must not expose raw values, secrets, PII, birth data, provider payloads, ephemeris paths, or license strings beyond approved public modes.

## Test expectations

Tests must use mock providers only.

Required proof:

- redaction removes email addresses
- redaction removes LINE user IDs
- redaction removes birth date, time, and place
- redaction removes API keys, secrets, and card-like values
- payment webhook failure events omit raw payloads
- email and LINE failure events omit raw identifiers
- astro-calc error events omit raw birth data
- mock alert provider records sanitized alerts only
- mock alert provider does not send network requests
- health/status output omits secrets
- duplicate alert suppression works when configured

