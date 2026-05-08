# BETA_RC1_SMOKE_TEST_RESULTS.md - Beta RC1 Smoke Test Results

## Purpose

Record manual and automated smoke evidence for the `beta-rc-1` release tag.
This record is staging/beta evidence only. It must not be used to approve
production deploy, real provider sends, real payment charging, production
secrets, or Swiss Ephemeris production use.

## Evidence header

```text
Release tag: beta-rc-1
Tag target commit: 92bbeb7af02f75c35ed8a73785d0360968ab5ce3
Environment: local / staging
Tester:
Test date/time:
Provider modes:
Notification scheduler mode:
Astro engine/profile:
Payment mode:
Accepted warnings:
Overall result: pending / pass / fail
```

## Safety preflight

Stop and mark no-go if any preflight item fails.

```text
[ ] No .env file is committed
[ ] No production secret is committed
[ ] No ephemeris binary is committed
[ ] No runtime ephemeris download is required
[ ] No real Email, LINE, payment, alert, or webhook provider call will run
[ ] Test notes exclude raw birth data, full email addresses, raw LINE user IDs, payment payloads, provider payloads, invite codes, tokens, and secrets
[ ] Scheduler trigger/cron/worker/manual runner is stopped unless a human explicitly approves staging execution
[ ] Provider flags are disabled unless a human explicitly approves provider-specific staging/test calls
```

## Automated checks

| Check | Expected proof | Status | Evidence |
| --- | --- | --- | --- |
| Web install | `pnpm install` completes | pending |  |
| Web lint | `pnpm lint` completes | pending |  |
| Web typecheck | `pnpm typecheck` completes | pending |  |
| Web tests | `pnpm test` completes | pending |  |
| Astro tests | `cd services/astro-calc && python3 -m pytest` completes | pending |  |
| Astro lint | `cd services/astro-calc && python3 -m ruff check .` completes | pending |  |
| Astro types | `cd services/astro-calc && python3 -m mypy .` completes | pending |  |
| Whitespace diff | `git diff --check` completes | pending |  |

## Smoke matrix

| ID | Smoke area | Expected RC1 evidence | Status | Evidence notes |
| --- | --- | --- | --- | --- |
| RC1-01 | User onboarding | User can complete onboarding in mock/staging-safe mode | pending |  |
| RC1-02 | Birth profile creation | Birth profile can be created or updated with validation | pending |  |
| RC1-03 | Unknown birth time warning | Unknown birth time path is explicit and lowers confidence where applicable | pending |  |
| RC1-04 | Horoscope content generation | Daily/weekly/monthly/yearly content is generated from structured chart data only | pending |  |
| RC1-05 | Content preview and approval | Admin can preview rule hits, safety flags, warnings, and source refs without PII | pending |  |
| RC1-06 | Approval gate | Unapproved or rejected beta content is not dispatched | pending |  |
| RC1-07 | Subscription entitlement | Free/basic/premium/trialing/active/past_due/canceled/expired states gate access correctly | pending |  |
| RC1-08 | Notification scheduling dry run | Scheduler can evaluate jobs without real provider sends | pending |  |
| RC1-09 | Email dry run | Email payload generation is safe and no real email provider call occurs | pending |  |
| RC1-10 | LINE dry run | LINE payload generation is safe and no real LINE push call occurs | pending |  |
| RC1-11 | Payment webhook mock | Mock signed webhook activates entitlement only through verified webhook handling | pending |  |
| RC1-12 | Payment safety | Client-side success does not activate subscription; duplicate webhook is idempotent | pending |  |
| RC1-13 | Privacy export | Export path returns scoped user data only and avoids unrelated data | pending |  |
| RC1-14 | Birth profile deletion | Deleted birth profile suppresses future content generation and delivery | pending |  |
| RC1-15 | Account deletion/deactivation | Deleted/deactivated users do not receive delivery or entitlement access | pending |  |
| RC1-16 | Monitoring redaction | Logs, alerts, health, audit notes, and support notes omit raw PII and secrets | pending |  |
| RC1-17 | Provider flags | Real Email, LINE, and Payment remain disabled unless explicitly approved | pending |  |
| RC1-18 | Astro guardrails | Production Swiss Ephemeris remains disabled unless license/path/manifest are approved | pending |  |
| RC1-19 | Rollback rehearsal | Disable switches, payment webhook ingress containment, rollback owner, rollback target, and support wording are recorded | pending |  |
| RC1-20 | Beta enrollment | Enrollment/invite scope is limited to approved beta users or marked no-go | pending |  |

## Smoke no-go conditions

```text
[ ] A required smoke path is missing evidence without explicit human waiver
[ ] Any raw email, LINE user ID, birth date, birth time, birth place, payment payload, card data, provider payload, token, or secret appears in evidence
[ ] Any real provider send or payment call occurs without explicit human approval
[ ] Payment webhook signature verification or idempotency is uncertain
[ ] Client-side payment success can activate entitlement
[ ] Content approval can be bypassed in beta approval mode
[ ] Deleted/deactivated/unsubscribed users can receive delivery
[ ] Scheduler rollback relies only on NOTIFICATION_SCHEDULER_MODE
[ ] Production Swiss Ephemeris is enabled without professional license, approved path, and manifest
```

## Result notes

```text
Passed smoke areas:
Failed smoke areas:
Waived or scoped-out areas:
Accepted warnings:
Blockers:
Follow-up issues:
Tester:
Timestamp:
```
