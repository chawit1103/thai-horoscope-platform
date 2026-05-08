# OPERATIONS_RUNBOOK.md — Operations Runbook

## Goal

Give operators a safe first-response guide for staging and production incidents without exposing secrets, raw provider payloads, or private birth data.

## First response

1. Confirm the environment: local, staging, or production.
2. Check `/api/health` for the web app.
3. Check the astro-calc health output.
4. Inspect structured monitoring events by type, severity, source, and sanitized metadata.
5. Do not paste secrets, raw webhook payloads, raw email addresses, raw LINE user IDs, or birth data into tickets or PR comments.
6. If production user impact is likely, pause the affected job or provider workflow where safe.
7. Escalate to the human owner before changing production secrets, provider modes, payment activation, or Swiss Ephemeris license strategy.

## Payment webhook failures

Events:

- `payment_webhook_signature_failed`
- `payment_webhook_idempotency_duplicate`
- `payment_webhook_processing_failed`
- `subscription_webhook_anomaly`

Investigation:

1. Confirm `PAYMENT_PROVIDER_MODE`.
2. Confirm the webhook endpoint is configured in the provider dashboard.
3. Confirm signature verification is enabled and the webhook secret exists in the deployment platform.
4. Check event status by sanitized provider event reference.
5. Confirm idempotency records prevent duplicate entitlement, receipt, and audit side effects.
6. Do not log or copy raw payment payloads, card data, webhook secrets, provider API keys, or customer emails.

Escalate immediately if entitlement changes may have been applied without verified webhook processing.

## Email delivery failures

Events:

- `email_delivery_failed`
- `email_bounce_spike_detected`

Investigation:

1. Confirm `EMAIL_PROVIDER_MODE`.
2. In staging, confirm sandbox mode or approved test provider credentials.
3. Confirm `EMAIL_AUDIT_HASH_SECRET` exists outside local development.
4. Check provider status using provider message reference only.
5. Check bounce, complaint, unsubscribe, and suppression rates.
6. Do not log raw email addresses, subject/body content, API keys, or raw provider payloads.

## LINE delivery failures

Events:

- `line_webhook_signature_failed`
- `line_delivery_failed`

Investigation:

1. Confirm `LINE_PROVIDER_MODE`.
2. Confirm webhook signature verification is enabled.
3. Confirm access token and channel secret exist only in the deployment platform.
4. Check whether the account is blocked, unfollowed, inactive, or missing consent.
5. Check delivery attempts by sanitized target reference.
6. Do not log raw LINE user IDs, access tokens, message bodies, or raw webhook payloads.

## Notification scheduler failures

Events:

- `notification_scheduler_failed`
- `duplicate_send_prevented`

Investigation:

1. Confirm `NOTIFICATION_SCHEDULER_MODE`.
2. Confirm `NOTIFICATION_SCHEDULER_TOKEN` exists when mode is `enabled` outside local development.
3. Check queue count, skipped count, deferred count, duplicate count, sent count, and failure count.
4. Confirm idempotency by user, topic, and period.
5. Confirm fallback did not duplicate sends.
6. Keep scheduler in `dry_run` or sandbox mode during staging smoke tests unless a human approves real sends.

## Beta content approval

Events:

- `admin_content_batch_approved`
- `admin_content_batch_rejected`

Investigation:

1. Open `/admin/content-preview` with an authenticated admin session.
2. Confirm the batch shows period type, period key, topic code, content profile,
   safety flags, warnings, rule hits, source calculation hash, and prepared
   delivery channels.
3. Confirm no raw birth date, birth time, birth place, email address, LINE user
   ID, payment identifier, provider payload, API key, token, or secret is visible.
4. Reject content with unsafe flags, overconfident unknown-birth-time wording, or
   medical/legal/financial/death/accident/guaranteed-outcome language.
5. After approval, rerun the scheduler in beta approval mode and confirm existing
   entitlement, deletion, unsubscribe, quiet-hour, and duplicate-send guards still
   apply.
6. Do not use approval as permission for real sends; real Email/LINE delivery
   still requires the normal human provider activation gate.

## Astro-calc failures

Events:

- `astro_calc_health_failed`
- `astro_ephemeris_config_invalid`

Investigation:

1. Confirm `ASTRO_ENGINE`.
2. For production, confirm `ASTRO_ENGINE=swisseph`.
3. Confirm `SWISSEPH_LICENSE_MODE=professional` only after the human license decision.
4. Confirm `ASTRO_EPHEMERIS_PATH` is mounted outside the repository.
5. Confirm no runtime ephemeris download occurs.
6. Confirm health does not expose the raw ephemeris path.
7. Do not log raw birth date, birth time, birth place, ephemeris license data, or ephemeris path.

## Environment validation failures

Event:

- `environment_validation_failed`

Investigation:

1. Check the component name and sanitized error code.
2. Fix missing variables in the deployment platform, not in the repository.
3. Confirm local/mock mode still works without production secrets.
4. Confirm real provider modes require their relevant secrets.
5. Confirm real provider modes require explicit activation flags unless `ENABLE_PROVIDER_DRY_RUN=true`.
6. Confirm health output includes variable names only, never raw values.

## Provider activation dry-run

Use `docs/PROVIDER_DRY_RUN.md` before enabling real Email, LINE, or Payment.

1. Keep `ENABLE_PROVIDER_DRY_RUN=true`.
2. Keep `ENABLE_REAL_EMAIL_SENDS=false`, `ENABLE_REAL_LINE_SENDS=false`, and `ENABLE_REAL_PAYMENT_PROVIDER=false`.
3. Confirm provider activation readiness reports `dry_run`.
4. Confirm `networkCallsAllowed=false` and `networkCallsAttempted=false` with provider/fetch network telemetry supplied to the safety harness.
5. Do not paste API keys, access tokens, webhook secrets, raw provider payloads, raw emails, raw LINE user IDs, payment identifiers, or birth data into operational notes.

## Admin auth security events

Event:

- `admin_auth_denied`

Investigation:

1. Confirm admin session secret is configured outside local development.
2. Confirm production does not configure `MOCK_ADMIN_TOKEN`.
3. Check denial counts by sanitized subject reference.
4. If repeated attempts occur, rotate staging-only mock credentials and review access logs.

## Privacy and deletion events

Events:

- `privacy_export_requested`
- `account_deletion_requested`

Investigation:

1. Confirm the request source is authenticated.
2. Confirm export and deletion workflows do not include unrelated user data.
3. Confirm queued notifications for deleted/deactivated users are removed or suppressed.
4. Do not log raw exported data, birth profiles, email addresses, LINE user IDs, or birth locations.

## Staging smoke checks

Before human staging deploy, run:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
(cd services/astro-calc && python3 -m pytest)
(cd services/astro-calc && python3 -m ruff check .)
(cd services/astro-calc && python3 -m mypy .)
git diff --check
```

After human staging deploy:

1. Open `/api/health`.
2. Confirm status is `ok` or warnings are explicitly accepted for sandbox/mock modes.
3. Confirm the PR32 release candidate packet is filled: `docs/BETA_RELEASE_CANDIDATE.md`, `docs/E2E_BETA_SMOKE_TEST_MATRIX.md`, and `docs/FINAL_GO_NO_GO_CHECKLIST.md`.
4. Confirm PR29 and PR31 are merged or explicitly marked pending before any real provider activation or beta invite decision.
5. Trigger only mock or sandbox payment, email, LINE, and scheduler flows.
6. Confirm structured monitoring events are emitted with sanitized metadata.
7. Confirm mock alert hooks record alerts without network calls in tests.
8. Confirm no real payment, email, LINE, or alert provider calls occur.

## Production prerequisites

Before production alerting:

- human approval for provider selection
- alert destination credentials stored outside the repository
- escalation owner and schedule documented
- production secrets configured in the deployment platform
- health and smoke tests pass
- no raw PII, secrets, payment payloads, or birth data in logs
- rollback plan is known

## Manual escalation checklist

```text
[ ] Impacted environment identified
[ ] Event type and severity recorded
[ ] Affected component identified
[ ] Raw secrets and PII excluded from notes
[ ] User impact estimated
[ ] Mitigation or rollback option identified
[ ] Human owner notified
[ ] Follow-up issue or PR opened if code/config changes are needed
```
