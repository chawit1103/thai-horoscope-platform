# BETA_LAUNCH_PLAN.md - Beta Launch Plan

## Goal

Provide a staged beta launch plan for the Thai horoscope platform that validates the end-to-end product while keeping production provider activation, payment activation, and Swiss Ephemeris production use behind human approval gates.

## Beta scope

The beta may validate:

- responsive web onboarding
- beta invite codes and allowlist enrollment in mock mode
- birth profile creation and update
- daily, weekly, monthly, and yearly horoscope access paths
- entitlement-gated access behavior
- mock or staging/test payment webhook behavior
- sandbox or staging/test email delivery behavior
- sandbox or staging/test LINE behavior
- notification scheduling in disabled or dry_run mode unless explicitly approved
- admin approval/rejection path
- privacy export and deletion workflows
- sanitized health checks, logs, monitoring events, and mock alerts
- astro-calc health and mock or approved test-engine validation

The beta must not present mock calculation output as approved production astrology.

## Allowed users

```text
[ ] Internal owner
[ ] Internal operators
[ ] Approved QA users
[ ] Approved beta testers who understand the service is pre-production
[ ] Test LINE Official Account users only when LINE staging/test mode is approved
[ ] Test email recipients only when email staging/test mode is approved
```

Do not invite broad public traffic until production privacy, payment, support, provider, and Swiss Ephemeris decisions are approved.

Invite management is documented in [Beta invite management](BETA_INVITE_MANAGEMENT.md).
Launch copy is documented in [Beta launch content](BETA_LAUNCH_CONTENT.md).

## Supported channels

```text
[ ] Web app
[ ] Email sandbox or staging/test provider
[ ] LINE sandbox or staging/test provider
```

Unsupported for beta unless separately approved:

```text
[ ] Telegram
[ ] Microsoft Teams
[ ] Production LINE campaigns
[ ] Production email campaigns
```

## Supported horoscope periods

```text
[ ] Daily
[ ] Weekly
[ ] Monthly
[ ] Yearly
```

All horoscope content remains entertainment and self-reflection. Do not claim guaranteed outcomes, medical diagnosis, legal or investment advice, unavoidable harm, or 100% accuracy.

## Disabled features

```text
[ ] Real production payment activation
[ ] Real production LINE or email campaigns
[ ] Production Swiss Ephemeris calculations until professional license and ephemeris manifest are approved
[ ] Runtime ephemeris downloads
[ ] Committed ephemeris binaries
[ ] Telegram and Microsoft Teams delivery
[ ] Fully automated production alert provider
[ ] Broad public launch
```

## Manual review points

```text
[ ] Admin approval/rejection path for generated content
[ ] Payment webhook mock or staging/test event results
[ ] Email and LINE test delivery metadata
[ ] Notification scheduler dry_run queue output
[ ] Privacy export/delete evidence
[ ] Astro engine/profile/fingerprint evidence
[ ] Monitoring event redaction evidence
[ ] Any support issue involving payment, birth data, deletion, or message delivery
```

## Support process

1. Assign a beta support owner before inviting users.
2. Create a beta issue template that excludes raw secrets, raw provider payloads, full email addresses, raw LINE user IDs, and private birth data.
3. Record user-impacting issues with sanitized references only.
4. Escalate payment, privacy, account deletion, admin access, and Swiss Ephemeris issues to the human owner.
5. Pause affected sends, scheduler jobs, or provider modes before attempting risky fixes.
6. Link each support issue to the relevant smoke test or monitoring event when possible.

## Feedback collection

Collect:

- onboarding friction
- clarity of beta limitations
- horoscope period usefulness
- channel preference
- notification timing preference
- unsubscribe/delete/export clarity
- support response quality

Do not collect:

- unrelated marketing use of private birth data
- raw provider payloads
- payment card details
- production secrets
- unredacted LINE user IDs or email addresses in public tickets

## Beta launch sequence

1. Confirm PR22 readiness docs and the PR32 release candidate packet are merged by a human.
2. Run required checks on the release candidate.
3. Confirm no `.env`, production secrets, or ephemeris binaries are committed.
4. Confirm PR29 real provider activation guardrails are merged or marked pending, with real provider activation blocked while pending.
5. Confirm PR31 beta launch content and invite management is merged or marked pending, with invite readiness blocked while pending.
6. Confirm staging environment variables are configured outside the repository.
7. Human operator deploys staging.
8. Open `/api/health` and confirm status is `ok` or warnings are explicitly accepted.
9. Run `docs/BETA_SMOKE_TESTS.md` and `docs/E2E_BETA_SMOKE_TEST_MATRIX.md`.
10. Confirm `docs/FINAL_GO_NO_GO_CHECKLIST.md` is satisfied.
11. Capture beta evidence:

```text
Commit:
Environment:
Health status:
Provider modes:
Astro engine/profile:
Smoke test result:
Known accepted limitations:
Rollback target:
Support owner:
PR29 dependency:
PR31 dependency:
Decision:
```

12. Invite approved beta users only.

## Launch communication checklist

```text
[ ] Explain beta scope and limitations
[ ] Confirm invite/allowlist states are ready for approved beta users only
[ ] State horoscope content is entertainment and self-reflection
[ ] State payment, LINE, email, and astro production readiness gates plainly
[ ] Include support contact/process
[ ] Include unsubscribe and account deletion guidance
[ ] Include feedback channel
[ ] Avoid guaranteed outcomes, fear-based upsell, medical/legal/financial advice, and claims of 100% accuracy
```

## Rollback plan

Use `docs/ROLLBACK_CHECKLIST.md`.

Minimum beta rollback actions:

1. Disable real sends or keep providers in sandbox.
2. Disable payment checkout or return payment provider to mock mode.
3. Disable the scheduler trigger/cron/worker/manual runner; keep scheduler status mode disabled or dry-run for evidence.
4. Switch astro engine to mock/prototype for non-production validation only.
5. Restore last known good deployment.
6. Notify beta users with approved support wording.
7. Preserve audit logs and monitoring evidence.
