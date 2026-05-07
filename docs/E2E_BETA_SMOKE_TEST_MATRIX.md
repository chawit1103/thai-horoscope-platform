# E2E_BETA_SMOKE_TEST_MATRIX.md - End-to-End Beta Smoke Test Matrix

## Purpose

This matrix ties the beta smoke path together across web, astro-calc, content safety, admin approval, subscription/payment, notification, privacy, monitoring, rollback, and final decision evidence. Run it only in mock or staging-safe mode unless a human explicitly approves a provider-specific staging/test step.

## Evidence header

```text
RC version:
Commit:
Environment:
Tester:
Test date:
Provider modes:
Astro engine/profile:
Accepted warnings:
Pending PR29 dependency:
Pending PR31 dependency:
Result:
```

## Safety preflight

```text
[ ] No `.env` file or production secret is present in the repository
[ ] No real payment, Email, LINE, alert, webhook, or campaign send will be triggered
[ ] No external network is required for the automated smoke helper
[ ] No ephemeris binary or runtime ephemeris download is required
[ ] Test notes avoid raw birth data, raw email addresses, raw LINE user IDs, payment payloads, and secrets
```

## Matrix

| ID | Smoke area | Expected mock/staging-safe proof | Evidence | Status |
| --- | --- | --- | --- | --- |
| E2E-01 | User onboarding | Web onboarding accepts valid fields with consent and rejects missing required fields. | `apps/web/tests/beta-user-ux.test.ts`, manual `/onboarding` check | pending |
| E2E-02 | Birth profile creation | Birth profile saves with sanitized audit metadata. | Mock MVP or beta UX test evidence | pending |
| E2E-03 | Unknown birth time warning path | Unknown time is accepted, chart warning is present, and copy confidence is softened. | `UNKNOWN_BIRTH_TIME` and content warning evidence | pending |
| E2E-04 | Astro calculation health | Mock or approved configured engine health passes without production ephemeris files. | `/api/health`, `pnpm beta:dry-run`, astro pytest | pending |
| E2E-05 | Horoscope content generation | Content is generated from chart structures and not from invented planetary positions. | Content engine test evidence | pending |
| E2E-06 | Content safety check | Safety flags are empty for approved copy and unsafe patterns are blocked. | Content safety test evidence | pending |
| E2E-07 | Admin content preview and approval | Sanitized preview is created, admin approval is required, rejection blocks dispatch. | `/admin/content-preview`, approval tests | pending |
| E2E-08 | Subscription entitlement state | Free/basic/premium access matches lifecycle state; client return alone does not activate access. | Subscription/payment tests | pending |
| E2E-09 | Notification preference setup | Disabled topics/channels suppress delivery. | Scheduler or beta UX test evidence | pending |
| E2E-10 | Notification scheduling dry run | Scheduler queues/defer/skips deterministically and remains `dry_run` or disabled unless approved. | Scheduler tests and dry-run report | pending |
| E2E-11 | Email mock delivery path | Sandbox Email sends record attempts without network calls or raw email in audit metadata. | Email gateway/scheduler evidence | pending |
| E2E-12 | LINE mock delivery path | Sandbox LINE sends record attempts without network calls or raw LINE ID in audit metadata. | LINE gateway/scheduler evidence | pending |
| E2E-13 | Payment provider mock/webhook foundation | Mock checkout is created, invalid signature fails closed, valid webhook is idempotent. | Payment provider test evidence | pending |
| E2E-14 | Privacy export | Export returns only the current user's scoped data. | Privacy test evidence | pending |
| E2E-15 | Birth profile deletion | Deletion removes dependent chart/result/queued delivery artifacts and blocks future chart generation. | Mock MVP privacy tests | pending |
| E2E-16 | Account deletion/deactivation | Deactivated/deleted users are suppressed from entitlement and notification sends. | Mock MVP/scheduler tests | pending |
| E2E-17 | Monitoring/alert redaction | Logs, health, operator status, and mock alerts omit raw PII, secrets, payment payloads, and birth data. | Observability/operator tests | pending |
| E2E-18 | Operator console readiness | Operator console is admin-protected and links to release, smoke, operations, staging, and rollback docs. | Operator status tests and manual `/admin/operator` check | pending |
| E2E-19 | Rollback checklist | Rollback owner, target, provider fallback modes, and user communication path are recorded. | `docs/ROLLBACK_CHECKLIST.md` | pending |
| E2E-20 | Final go/no-go decision | Human owner records go/no-go with PR29/PR31 dependencies clearly marked. | `docs/FINAL_GO_NO_GO_CHECKLIST.md` | pending |

## Automated helper

`apps/web/tests/beta-e2e-smoke.test.ts` covers a deterministic mock-safe slice of the matrix. It must remain lightweight:

- no production secrets
- no real Email or LINE messages
- no real payment provider API calls
- no production Swiss Ephemeris files
- no external network
- no raw PII in audit/operator output
- failure when mock safety guards are bypassed

Manual staging evidence is still required for rendered pages, `/api/health`, and human operator decisions.
