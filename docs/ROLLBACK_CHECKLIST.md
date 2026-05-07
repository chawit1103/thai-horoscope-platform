# ROLLBACK_CHECKLIST.md - Rollback Checklist

## Goal

Give operators a concise rollback path for staging/beta without merging, deploying, changing production secrets, or sending real provider traffic from automation.

## Rollback evidence header

```text
Incident:
Detected at:
Environment:
Current commit:
Rollback target:
Owner:
User impact:
Provider modes:
Decision:
```

## Immediate containment

```text
[ ] Confirm environment: local, staging, or production
[ ] Preserve logs, audit records, and monitoring event IDs
[ ] Do not paste secrets, raw payment payloads, raw LINE user IDs, raw email addresses, or birth data into tickets
[ ] Assign an owner
[ ] Pause risky workflows before making config changes
```

## Disable real sends

```text
[ ] Set EMAIL_PROVIDER_MODE=sandbox or disable the email path according to the deployment platform controls
[ ] Set LINE_PROVIDER_MODE=sandbox or disabled where allowed
[ ] Confirm no queued real provider sends are still running
[ ] Confirm delivery attempts remain auditable
[ ] Notify support that sends are paused
```

## Disable payment checkout

```text
[ ] Set PAYMENT_PROVIDER_MODE=mock or disable checkout entry points according to approved controls
[ ] Pause or disable provider webhook processing if duplicate or unsafe processing is suspected
[ ] Preserve webhook idempotency and audit records
[ ] Do not mark users paid manually unless an approved human support procedure requires it
[ ] Document affected provider event references using sanitized IDs only
```

## Disable scheduler

```text
[ ] Set NOTIFICATION_SCHEDULER_MODE=disabled or dry_run
[ ] Confirm no real LINE/email sends occur from scheduled jobs
[ ] Preserve queue and delivery attempt evidence
[ ] Verify deleted/deactivated/unsubscribed users remain suppressed
```

## Astro rollback

```text
[ ] If real-engine validation is unsafe, stop generation jobs
[ ] Switch ASTRO_ENGINE to mock/prototype only for non-production validation
[ ] Do not present mock output as paid production astrology
[ ] Preserve historical chart snapshots
[ ] Record engine, calculation profile, ayanamsa, and ephemeris fingerprint from the affected release
[ ] Confirm no runtime ephemeris download occurred
[ ] Confirm no ephemeris binaries were committed
```

## Restore last known good deployment

```text
[ ] Identify last known good commit
[ ] Confirm database migration rollback or forward-fix strategy
[ ] Human operator performs deployment rollback
[ ] Re-run /api/health
[ ] Re-run critical smoke tests from docs/BETA_SMOKE_TESTS.md
[ ] Confirm monitoring events return to expected level
```

## Notify beta users

```text
[ ] Use approved beta support wording
[ ] State that beta functionality is temporarily limited
[ ] Avoid exposing incident-sensitive details
[ ] Do not include raw provider payloads, internal tokens, or private user data
[ ] Provide support contact and expected follow-up window
```

## Preserve audit logs

```text
[ ] Keep audit logs for payment, admin, notification, privacy, deletion, and account state changes
[ ] Keep monitoring event references
[ ] Do not overwrite historical chart snapshots
[ ] Do not delete evidence needed for privacy, payment, or security review
```

## Recovery exit criteria

```text
[ ] Health status is ok or known warnings are accepted
[ ] Real sends remain disabled or approved
[ ] Payment checkout remains disabled/mock or approved
[ ] Scheduler remains disabled/dry_run or approved
[ ] Astro engine mode matches the accepted beta scope
[ ] Support owner confirms user communication is complete
[ ] Follow-up issue or PR is opened for the root cause
```
