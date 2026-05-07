# BETA_CONTENT_APPROVAL.md - Beta Content Preview and Approval

## Goal

PR27 adds a beta approval gate for generated horoscope content before scheduled
delivery. The gate is for operator review during beta and must not weaken the
existing entitlement, privacy, unsubscribe, deletion, duplicate-send, or content
safety checks.

## Beta approval mode

When beta approval mode is enabled, the notification scheduler prepares a
sanitized content preview batch for each generated horoscope period and holds
delivery until an admin approves that batch.

Pending batches are retained as queued/deferred delivery holds so an admin can
approve after the original notification window without dropping the same-period
send. Rejected batches must not be dispatched. If a queued message is checked
again and contains beta approval metadata, or dispatch is explicitly run in beta
approval mode, the approval record is rechecked. Missing, pending, or rejected
approval suppresses or defers dispatch before any provider gateway is called.

## Who can approve or reject

Only an authenticated admin can approve or reject a content preview batch.
Server actions must validate the admin session server-side before mutating the
approval state. UI forms are only a convenience layer and are not trusted.

Admin actions emit sanitized audit events:

```text
admin_content_batch_approved
admin_content_batch_rejected
```

Audit metadata must not include raw birth data, email addresses, LINE user IDs,
payment identifiers, provider payloads, API keys, tokens, or secrets.

## What operators inspect

The admin preview should show only delivery-safe and audit-safe fields:

- `periodType`
- `periodKey`
- `topicCode`
- `contentProfileCode`
- `safetyFlags`
- `warnings`
- `ruleHits`
- `calculationHash` or another non-PII source reference
- prepared delivery channels

Operators should confirm:

- the tone remains advisory, reflective, and entertainment-oriented
- unknown birth time warnings are visible and soften the copy
- no house-specific claims appear when houses are unreliable
- `safetyFlags` is empty before approval
- rule hits are explainable and sourced from structured calculation data
- preview content contains no raw PII or provider identifiers

## Rejection behavior

Rejected content must not be dispatched. The current policy is conservative:
approval after rejection is blocked and requires regeneration or an explicit
future reset flow. Duplicate approval and duplicate rejection calls are
idempotent.

## Delivery queue effect

Approval does not bypass existing delivery rules. Pending approval holds may
exist in the queue, but dispatch can proceed only after approval and only when
all existing guards still pass:

- user is active and not deleted
- birth profile and source horoscope artifact are active
- entitlement covers the period
- channel preference allows delivery
- unsubscribe, bounce, block, and quiet-hour rules are respected
- duplicate queue and dispatch keys do not already exist

## No-real-send test guarantee

Tests for this flow must use mock or sandbox gateways only. They must not send
real LINE messages, real emails, payment requests, alerts, or network calls.

The expected test proof includes:

- non-admin approval/rejection is rejected
- admin approval and rejection work
- rejected and unapproved beta content is not dispatched
- approved content dispatches only through mock/sandbox gateways
- duplicate approve/reject calls are idempotent
- approve-after-reject is blocked
- preview and audit output redact raw PII and secrets
- rule hits, safety flags, warnings, and source metadata remain visible
