# LAUNCH_DISABLE_SWITCHES.md - Launch Disable Switches

## Goal

List the switches operators can use to contain beta launch risk. These are configuration actions performed by a human operator in the deployment platform, not secrets or code changes committed to the repository.

## Global rules

- Do not paste production secrets into code, docs, PR comments, tickets, screenshots, or chat.
- Do not use tests or automation to send real Email, LINE, payment, alert, or webhook calls.
- Preserve logs, audit records, monitoring event IDs, and sanitized provider references before changing modes.
- After any disable action, rerun health and the relevant smoke checks.

## Disable real Email sends

```text
Primary switch:
ENABLE_REAL_EMAIL_SENDS=false

Containment mode:
EMAIL_PROVIDER_MODE=sandbox
ENABLE_PROVIDER_DRY_RUN=true
```

Verify:

```text
[ ] Email gateway reports sandbox or blocked real-provider mode
[ ] No HTTP/SMTP provider send is called
[ ] Delivery attempts remain auditable and sanitized
[ ] Support knows email sends are paused
```

## Disable real LINE sends

```text
Primary switch:
ENABLE_REAL_LINE_SENDS=false

Containment mode:
LINE_PROVIDER_MODE=sandbox or disabled
ENABLE_PROVIDER_DRY_RUN=true
```

Verify:

```text
[ ] LINE gateway reports sandbox/disabled or blocked real-provider mode
[ ] No LINE Messaging API push is called
[ ] Follow/unfollow and blocked status evidence remains sanitized
[ ] Support knows LINE sends are paused
```

## Disable real payment provider

```text
Primary switch:
ENABLE_REAL_PAYMENT_PROVIDER=false

Containment mode:
PAYMENT_PROVIDER_MODE=mock
ENABLE_PROVIDER_DRY_RUN=true
```

Verify:

```text
[ ] Checkout creation does not call a real payment provider
[ ] Client-side success cannot activate entitlement
[ ] Webhook handling remains signature-verified in any staging/test mode
[ ] Receipt hooks remain sandboxed/mocked
[ ] No card data is stored or logged
```

## Disable notification scheduler

```text
Primary switch:
NOTIFICATION_SCHEDULER_MODE=disabled

Safer validation mode:
NOTIFICATION_SCHEDULER_MODE=dry_run
```

Verify:

```text
[ ] No queued message dispatch calls real Email or LINE gateways
[ ] Duplicate-send prevention evidence is preserved
[ ] Deleted, deactivated, unsubscribed, blocked, and bounced users remain suppressed
[ ] Scheduler token is not exposed in output
```

## Switch astro engine to mock/prototype

```text
Containment mode:
ASTRO_ENGINE=mock
SWISSEPH_LICENSE_MODE=none
ASTRO_EPHEMERIS_PATH=
ASTRO_EPHEMERIS_MANIFEST_PATH=
ASTRO_REQUIRE_PINNED_EPHEMERIS=false
```

Verify:

```text
[ ] Mock output is clearly labeled as beta/prototype and not production astrology
[ ] No runtime ephemeris download occurs
[ ] No ephemeris path or license detail appears in health/logs
[ ] Historical chart snapshots and calculation hashes are preserved
```

## Disable beta enrollment

Use the beta invite/content management controls documented in [Beta invite management](BETA_INVITE_MANAGEMENT.md). If a dedicated environment flag is available in the deployed environment, set it through the deployment platform only.

Verify:

```text
[ ] New beta invite redemption is paused
[ ] Existing users retain only the intended beta access
[ ] Support and feedback forms remain available
[ ] Launch communications explain temporary enrollment pause without exposing internal incident details
```

## Disable production alert provider

```text
Containment mode:
Use mock alert provider or remove production alert provider credentials from the deployment platform
```

Verify:

```text
[ ] Tests and smoke checks use mock alert provider only
[ ] No Slack/email/webhook/PagerDuty alert network call occurs from tests
[ ] Critical local events are still visible in operator evidence
```

## Post-disable proof

```text
[ ] /api/health checked
[ ] Astro health checked when astro mode changed
[ ] Relevant smoke tests rerun
[ ] Monitoring event reviewed
[ ] Support owner notified
[ ] Rollback checklist updated if incident-driven
```
