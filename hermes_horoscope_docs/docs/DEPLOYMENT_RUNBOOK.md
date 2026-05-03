# DEPLOYMENT_RUNBOOK.md — Deployment and Operations

## Environments

Recommended:

```text
local
staging
production
```

Production must have separate secrets and database from staging.

## Services

```text
web app: /apps/web
astro calculation service: /services/astro-calc
database: PostgreSQL
notification providers: LINE, Email
payment provider: selected later
```

## Local development

Expected commands after scaffold:

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
```

Python service:

```bash
cd services/astro-calc
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
python -m pytest
```

## Environment variables

Use `.env.example` with placeholder names only.

Suggested variables:

```text
DATABASE_URL=
APP_BASE_URL=
SESSION_SECRET=
ASTRO_CALC_BASE_URL=
ASTRO_CALC_INTERNAL_TOKEN=
LINE_CHANNEL_SECRET=
LINE_CHANNEL_ACCESS_TOKEN=
EMAIL_PROVIDER=
EMAIL_API_KEY=
PAYMENT_PROVIDER=
PAYMENT_WEBHOOK_SECRET=
```

Do not commit actual values.

## Pre-deploy checklist

```text
[ ] CI green
[ ] Database migration reviewed
[ ] No secrets in repo
[ ] Environment variables configured
[ ] Webhook URLs configured
[ ] Health checks pass
[ ] Astro service reachable by web app
[ ] Notification provider in correct mode
[ ] Payment provider in correct mode
[ ] Rollback plan known
```

## Astro service deployment notes

Production requirements:

- Ephemeris files must be packaged or mounted intentionally.
- No runtime download during request handling.
- Engine version endpoint must return version/fingerprint.
- Health endpoint must not expose secrets.

## Notification deployment notes

Before enabling real sends:

- Send to test users only.
- Verify delivery attempts are recorded.
- Verify blocked/unsubscribed handling.
- Verify fallback logic does not duplicate messages.

## Payment deployment notes

Before enabling real payments:

- Use staging/test provider.
- Verify webhook signature.
- Verify idempotency.
- Verify subscription status transitions.
- Verify receipts.
- Verify cancellation flow.

## Rollback

Rollback plan must include:

- app version rollback
- database migration rollback or forward fix
- notification job pause
- payment webhook pause strategy if possible
- manual support note for affected users

## Incident examples

### Duplicate daily notifications

Actions:

1. Pause notification job.
2. Check `outbound_messages` uniqueness.
3. Check `delivery_attempts`.
4. Patch idempotency bug.
5. Send apology only if appropriate and approved.

### Astro calculation changed unexpectedly

Actions:

1. Stop generation job.
2. Compare golden tests.
3. Check engine version and ephemeris fingerprint.
4. Revert calculation profile or engine deploy.
5. Do not overwrite historical chart snapshots.

### Payment webhook duplicate processing

Actions:

1. Disable affected webhook handler if necessary.
2. Check idempotency records.
3. Correct subscription state manually with audit log.
4. Add regression test.

## Monitoring

Track:

- web app errors
- astro service errors
- notification send failures
- email bounce/complaint rate
- payment webhook failures
- job duration
- queue length
- active subscribers
- churn/cancellation rate
