# POST_LAUNCH_MONITORING_CHECKLIST.md - Post-Launch Monitoring Checklist

## Goal

Give operators a concise watch plan for the first beta window after a human-approved staging/beta launch. This checklist does not approve production deploy, real provider sends, real payment charging, production alert providers, or Swiss Ephemeris production activation.

## Monitoring header

```text
RC version:
Commit:
Environment:
Launch time:
Monitoring owner:
Support owner:
Rollback owner:
Review window:
Provider modes:
Astro engine/profile:
```

## First-hour watchpoints

```text
[ ] /api/health is ok or expected staging warnings are accepted
[ ] Astro-calc health is ok for the selected beta engine mode
[ ] Operator console is admin-protected and available
[ ] No logs, alerts, health output, audit metadata, PR comments, or support tickets expose secrets or raw PII
[ ] No real Email, LINE, payment, alert, or webhook provider call occurs unless explicitly approved for staging/test
[ ] Notification scheduler trigger/worker remains stopped unless explicitly approved
[ ] NOTIFICATION_SCHEDULER_MODE remains disabled or dry_run as validation/status evidence unless explicitly approved
[ ] Payment checkout remains mock or staging/test only; client return never activates entitlement
[ ] Content approval gate holds unapproved beta content
[ ] Privacy export/delete/unsubscribe/deactivation paths remain available
```

## Daily beta watchpoints

```text
[ ] Payment webhook signature failures and idempotency events are reviewed
[ ] Email delivery failures and bounce/suppression events are reviewed
[ ] LINE webhook signature failures, follow/unfollow, blocked, and delivery failures are reviewed
[ ] Notification duplicate-send prevention is reviewed for queued periods
[ ] Astro health/config failures and ephemeris guard errors are reviewed
[ ] Admin auth denied events are reviewed
[ ] Privacy export/delete/account deletion events are reviewed
[ ] Environment validation failures are reviewed
[ ] Subscription lifecycle anomalies are reviewed
[ ] Content safety flags and rejection reasons are reviewed
```

## Redaction proof

Monitoring output must not include:

```text
[ ] Raw email addresses
[ ] Raw LINE user IDs
[ ] Birth date, birth time, birth place, or location
[ ] Payment provider raw payloads
[ ] Card data, PAN, CVC, or CVV
[ ] Webhook secrets, API keys, bearer tokens, or provider credentials
[ ] Ephemeris license data or sensitive local ephemeris paths
[ ] Horoscope body text unless explicitly needed and sanitized for support
```

## Alert severity guide

```text
Critical: secret/PII leak, real provider call without approval, payment entitlement bypass, privacy delete/export failure, admin auth bypass
High: duplicate sends, provider mode unexpectedly real, webhook signature uncertainty, Swiss Ephemeris production guard failure
Medium: elevated delivery failures, scheduler dry_run drift, support queue growth, content approval backlog
Low: expected staging warning, known mock/sandbox limitation, documentation follow-up
```

## Escalation checklist

```text
[ ] Assign incident owner
[ ] Preserve sanitized event IDs and audit references
[ ] Do not paste secrets, raw provider payloads, raw LINE IDs, email addresses, or birth data
[ ] Use LAUNCH_DISABLE_SWITCHES.md for containment
[ ] Use ROLLBACK_CHECKLIST.md if rollback is needed
[ ] Notify support with approved beta wording
[ ] Reset FINAL_GO_NO_GO_CHECKLIST.md to pending after rollback or critical incident
```

## Exit criteria

```text
[ ] First monitoring window completed
[ ] No P0/P1 or release-blocking P2 remains unresolved
[ ] Support owner confirms known issues and user communication status
[ ] Rollback owner confirms rollback target is still available
[ ] Human owner records continue / pause / rollback decision
```
