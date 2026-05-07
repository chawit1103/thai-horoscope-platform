# BETA_SMOKE_TESTS.md - Beta Smoke Tests

## Goal

Provide a manual beta smoke test checklist that validates staging/beta behavior without sending real production traffic, exposing secrets, or claiming production astrology readiness.

Run this after a human staging deploy and after `/api/health` is checked.

## Evidence header

```text
Commit:
Environment:
Tester:
Test date:
Health status:
Provider modes:
Astro engine/profile:
PR29 dependency:
PR31 dependency:
Accepted warnings:
Result:
```

## Release candidate cross-check

```text
[ ] `docs/BETA_RELEASE_CANDIDATE.md` is filled for this RC
[ ] `docs/E2E_BETA_SMOKE_TEST_MATRIX.md` has evidence for every row
[ ] `docs/BETA_RELEASE_NOTES_TEMPLATE.md` is prepared without raw PII or secrets
[ ] `docs/FINAL_GO_NO_GO_CHECKLIST.md` is ready for human decision
[ ] PR29 real provider activation guardrails are merged or marked pending
[ ] PR31 beta launch content and invite management is merged or marked pending
```

## Health and configuration

```text
[ ] GET /api/health returns 200, or 503 only during intentional negative config testing
[ ] Health output lists service, environment, components, statuses, modes, errors, and warnings
[ ] Health output does not include raw secrets, tokens, provider credentials, email addresses, LINE user IDs, birth data, payment payloads, ephemeris paths, or license data
[ ] Missing config errors list variable names only
[ ] Mock/sandbox modes are visible as warnings in staging where expected
```

## Signup and onboarding

```text
[ ] Home page renders
[ ] Onboarding page renders
[ ] User can start the mock/beta onboarding flow
[ ] Required inputs are validated
[ ] Consent prompts are present where required by the current MVP scope
[ ] No LINE-specific business logic is required to complete web onboarding
```

## Birth profile creation

```text
[ ] Birth date can be captured
[ ] Birth time can be captured or marked unknown
[ ] Birth place/location can be captured or omitted with degraded warnings
[ ] Unknown birth time produces warning-aware behavior
[ ] Birth data is not printed in logs, alerts, health output, or public test notes
[ ] Birth profile can be deleted
```

## Horoscope generation and access

```text
[ ] Daily page renders
[ ] Weekly page renders
[ ] Monthly page renders
[ ] Yearly page renders
[ ] Free/basic/premium entitlement boundaries behave as expected
[ ] Content is framed as entertainment and self-reflection
[ ] No claim guarantees outcomes, diagnoses, legal/financial instruction, unavoidable harm, or 100% accuracy
[ ] Astro calculation service returns structures only, not horoscope interpretation prose
```

## Subscription entitlement

```text
[ ] Mock checkout session can be created without real payment
[ ] Client return alone does not activate entitlement
[ ] Verified mock webhook can activate the expected subscription state
[ ] Duplicate webhook does not duplicate subscription, receipt, or audit side effects
[ ] Past due, canceled, expired, and cancel-at-period-end behavior matches documented lifecycle rules
```

## Payment webhook mock

```text
[ ] Invalid signature fails closed
[ ] Missing webhook secret fails closed where required
[ ] Unknown checkout session is rejected before entitlement changes
[ ] Provider/user/plan mismatch is rejected
[ ] Raw payment payload is not logged or emitted in monitoring metadata
[ ] Card data is not stored
```

## Email verification and delivery

Sandbox mode:

```text
[ ] EMAIL_PROVIDER_MODE=sandbox
[ ] No real email provider API call occurs
[ ] Audit metadata excludes raw email address, body content, provider API key, and webhook secret
```

Real staging/test mode, only after approval:

```text
[ ] EMAIL_PROVIDER_MODE=http
[ ] EMAIL_PROVIDER_ENDPOINT points to staging/test provider
[ ] EMAIL_PROVIDER_API_KEY is staging/test only
[ ] EMAIL_WEBHOOK_SECRET is configured
[ ] Valid test webhook signature passes
[ ] Invalid webhook signature fails closed
```

## LINE follow and unfollow

Sandbox mode:

```text
[ ] LINE_PROVIDER_MODE=sandbox
[ ] No real LINE push call occurs
[ ] Audit metadata excludes raw LINE user IDs and tokens
```

Real staging/test mode, only after approval:

```text
[ ] LINE_PROVIDER_MODE=http
[ ] LINE_CHANNEL_SECRET is staging/test only
[ ] LINE_CHANNEL_ACCESS_TOKEN is staging/test only
[ ] Invalid webhook signature fails closed
[ ] Test account follow/unfollow behavior is reflected without exposing raw LINE user ID in logs
```

## Notification schedule

```text
[ ] NOTIFICATION_SCHEDULER_MODE=disabled or dry_run unless human approved
[ ] Scheduler does not send real LINE/email in smoke tests
[ ] Queue output is idempotent by user/topic/period
[ ] Quiet hours are respected for the selected user timezone
[ ] Fallback channel does not duplicate messages
[ ] Blocked/unsubscribed/bounced/deleted/deactivated users are suppressed
[ ] Delivery attempts are recorded without PII or secrets
```

## Privacy export and delete

```text
[ ] User can request export for their own data only
[ ] Export excludes unrelated user data
[ ] User can delete birth profile
[ ] User can request account deletion
[ ] Deleted or deactivated users stop receiving scheduled sends
[ ] Audit metadata avoids direct PII and raw birth data
```

## Admin approve/reject

```text
[ ] Admin sign-in uses staging-only credentials
[ ] Missing or invalid admin session is rejected
[ ] Admin session cookie is HttpOnly and secure when served over HTTPS
[ ] Admin approve/reject actions require server-verified admin session
[ ] Admin actions are audited without raw PII
```

## Astro calculation health

Mock/default mode:

```text
[ ] ASTRO_ENGINE=mock
[ ] No ephemeris path is required
[ ] No runtime ephemeris download occurs
[ ] Mock output is not presented as production-approved astrology
```

Swiss Ephemeris staging/test validation, only after approval:

```text
[ ] ASTRO_ENGINE=swisseph
[ ] SWISSEPH_LICENSE_MODE=free or professional for non-production validation
[ ] ASTRO_EPHEMERIS_PATH points outside the repository
[ ] Health output reports whether a path is configured without exposing the raw path
[ ] Ephemeris files are not committed
[ ] Engine/profile/fingerprint are recorded in validation notes
```

## Monitoring event redaction

```text
[ ] Payment webhook failure event omits raw payload and card data
[ ] Email delivery failure event omits raw email address
[ ] LINE delivery failure event omits raw LINE user ID
[ ] Astro-calc failure event omits raw birth date, time, place, ephemeris path, and license data
[ ] Environment validation failure event lists sanitized error codes and variable names only
[ ] Mock alert provider records sanitized alerts only
[ ] No real alert network request occurs
```

## Final operator checklist

```text
[ ] All failed smoke items have owners
[ ] Accepted warnings are listed
[ ] Known limitations are linked
[ ] Rollback target is known
[ ] Support owner is available
[ ] Human owner records go/no-go decision
```
