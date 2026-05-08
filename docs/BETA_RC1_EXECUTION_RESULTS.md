# BETA_RC1_EXECUTION_RESULTS.md - Beta RC1 Execution Results

## Purpose

Record the beta-rc-1 execution evidence packet for human staging or beta launch review.
This document is an execution record, not a production approval. It does not deploy,
activate real providers, add secrets, charge users, send real Email or LINE messages,
or approve Swiss Ephemeris production use.

## Release tag

| Field | Value |
| --- | --- |
| Release tag | [beta-rc-1](https://github.com/chawit1103/thai-horoscope-platform/tree/beta-rc-1) |
| Tag target commit | `92bbeb7af02f75c35ed8a73785d0360968ab5ce3` |
| Tagged commit summary | `Merge pull request #29 from chawit1103/pr40-beta-release-candidate` |
| Tagged at | `2026-05-08 14:23:28 +0700` |
| Execution date/time |  |
| Operator |  |
| Environment | local / staging |
| Decision status | pending / go / no-go |

## Execution boundary

```text
[ ] This record is for beta-rc-1 only
[ ] Production deploy is not approved by this record
[ ] Real Email sends are not approved by this record
[ ] Real LINE sends are not approved by this record
[ ] Real payment provider activation is not approved by this record
[ ] Production Swiss Ephemeris use is not approved by this record
[ ] Production secrets and .env files are not committed
[ ] Ephemeris binaries are not committed
```

## Commands run

Record command proof summaries only. Do not paste secrets, raw provider payloads,
raw birth data, raw payment payloads, or full user identifiers.

| Command | Result | Evidence notes |
| --- | --- | --- |
| `pnpm install` | pending |  |
| `pnpm lint` | pending |  |
| `pnpm typecheck` | pending |  |
| `pnpm test` | pending |  |
| `cd services/astro-calc && python3 -m pytest` | pending |  |
| `cd services/astro-calc && python3 -m ruff check .` | pending |  |
| `cd services/astro-calc && python3 -m mypy .` | pending |  |
| `git diff --check` | pending |  |

## Environment status

| Area | Expected RC1 status | Observed status | Result | Notes |
| --- | --- | --- | --- | --- |
| Local/mock | Works without production secrets |  | pending |  |
| Staging | Uses sandbox/mock/dry-run modes unless human-approved |  | pending |  |
| Production | Not enabled by accident |  | pending |  |
| Real provider flags | Disabled unless explicitly approved |  | pending |  |
| Dry-run flags | Enabled for readiness validation unless approved test calls are planned |  | pending |  |
| Scheduler execution | Trigger/cron/worker/manual runner stopped unless explicitly approved |  | pending |  |
| Health output | Sanitized, mode-oriented, no secrets or PII |  | pending |  |

## Provider activation status

| Provider area | RC1 expected status | Observed status | Result | No-go trigger |
| --- | --- | --- | --- | --- |
| Email real sends | Disabled unless explicitly approved |  | pending | Real send path enabled without approval/config |
| LINE real sends | Disabled unless explicitly approved |  | pending | Real LINE push enabled without approval/config |
| Payment real provider | Disabled unless explicitly approved |  | pending | Real payment enabled or client success activates entitlement |
| Provider dry-run | Does not call real provider APIs |  | pending | Network call occurs during dry-run or tests |
| Swiss Ephemeris production | Disabled unless professional license/path/manifest are approved |  | pending | Production swisseph enabled without all guards |
| Alert provider | Mock unless explicitly approved |  | pending | Real alert network call occurs without approval |

## Monitoring and redaction result

| Check | Expected result | Observed status | Result | Notes |
| --- | --- | --- | --- | --- |
| Structured logs | Event type, severity, source, timestamp, safe refs, sanitized metadata |  | pending |  |
| PII redaction | No raw email, LINE user ID, birth date/time/place, or account identifiers |  | pending |  |
| Secret redaction | No API keys, webhook secrets, tokens, provider credentials, or license data |  | pending |  |
| Payment payload redaction | No raw payment payloads, card data, customer identifiers, or webhook bodies |  | pending |  |
| Birth data redaction | No raw birth date, birth time, birth place, or precise private chart input |  | pending |  |
| Alert events | Mock/sanitized unless a human approves staging/test provider |  | pending |  |

## Smoke test result summary

Detailed RC1 smoke evidence belongs in
[BETA_RC1_SMOKE_TEST_RESULTS.md](BETA_RC1_SMOKE_TEST_RESULTS.md).

| Smoke area | Result | Evidence link or note |
| --- | --- | --- |
| Onboarding | pending |  |
| Birth profile | pending |  |
| Unknown birth time warning | pending |  |
| Horoscope content generation | pending |  |
| Content preview and approval | pending |  |
| Notification scheduling dry run | pending |  |
| Email dry run | pending |  |
| LINE dry run | pending |  |
| Payment webhook mock | pending |  |
| Privacy export | pending |  |
| Birth profile deletion | pending |  |
| Account deletion/deactivation | pending |  |
| Monitoring redaction | pending |  |
| Rollback rehearsal | pending |  |

## Go/no-go record

The RC1 launch decision belongs in
[BETA_RC1_GO_NO_GO_DECISION.md](BETA_RC1_GO_NO_GO_DECISION.md).

```text
Go conditions met:
No-go conditions present:
Human approvals recorded:
Accepted risks:
Blockers:
Decision: pending / go / no-go
Decision owner:
Timestamp:
```

## Rollback readiness

| Rollback action | Owner | Status | Evidence |
| --- | --- | --- | --- |
| Disable real Email sends or keep sandboxed |  | pending |  |
| Disable real LINE sends or keep sandboxed |  | pending |  |
| Disable payment provider or keep mock |  | pending |  |
| Block payment webhook ingress or rotate/remove webhook signing secret if signed retries may still reach the app |  | pending |  |
| Disable scheduler trigger/cron/worker/manual runner |  | pending |  |
| Set scheduler mode to disabled or dry_run for status evidence |  | pending |  |
| Switch astro engine to mock/prototype for non-production validation |  | pending |  |
| Disable or pause beta enrollment where supported |  | pending |  |
| Preserve audit logs and monitoring event IDs |  | pending |  |
| Notify beta users with approved support wording |  | pending |  |

## Remaining blockers and risks

```text
Blockers:
Accepted risks:
Required follow-up issues:
Human decisions still needed:
Rollback owner:
Support owner:
```
