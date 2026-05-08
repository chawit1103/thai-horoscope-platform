# FINAL_GO_NO_GO_CHECKLIST.md - Final Go/No-Go Checklist

## Purpose

Use this as the last human decision record before beta invite or release-candidate handoff. It summarizes the stricter gates from `docs/GO_NO_GO_CRITERIA.md` without turning beta readiness into production approval.

## Decision header

```text
RC version:
Commit:
Environment:
Decision date:
Release owner:
Engineering owner:
Security/privacy owner:
Payment owner:
LINE/email owner:
Astro/license owner:
Support owner:
Rollback owner:
Decision: go / no-go
Launch tag candidate:
```

## Go only if

```text
[ ] All local tests pass
[ ] pnpm install, lint, typecheck, and test evidence is recorded
[ ] Astro pytest, ruff, and mypy evidence is recorded
[ ] Codex review reports no major issues or only explicitly accepted non-blocking findings
[ ] No open P0/P1 security, privacy, payment, notification, content safety, or release-blocking findings remain
[ ] Provider modes are mock/sandbox/dry-run unless a human explicitly approves staging/test provider mode
[ ] No production secrets are committed
[ ] No `.env` file is committed
[ ] No ephemeris binaries are committed
[ ] Runtime ephemeris downloads are not required
[ ] Release readiness checklist is complete
[ ] Rollback checklist is complete
[ ] Launch disable switches are documented
[ ] Operator console is available and admin-protected
[ ] Monitoring redaction is verified
[ ] Post-launch monitoring owner and watch window are recorded
[ ] Beta invite/enrollment plan is ready; if PR31 is not merged, the beta invite decision is pending/no-go
[ ] Real provider activation guardrails are ready or marked pending if PR29 is not merged
[ ] Provider activation flags are documented and default to disabled
[ ] Swiss Ephemeris production license decision is documented or production Swiss Ephemeris is disabled
[ ] No real payment is enabled unless explicitly approved
[ ] Payment webhook signature validation and idempotency are validated in mock/staging-safe mode
[ ] Payment rollback includes both checkout disablement and webhook ingress/secret containment
[ ] Notification duplicate-send prevention and suppression are validated
[ ] Scheduler trigger/cron/worker disablement is documented; `NOTIFICATION_SCHEDULER_MODE` alone is not treated as a kill switch
[ ] Privacy export/delete/deactivation flows are working
[ ] Content safety checks and unknown birth time warnings are visible
[ ] Support and feedback plan is ready
[ ] Beta release notes are prepared without PII, secrets, or overclaimed readiness
[ ] Beta enrollment pause evidence is recorded: unredeemed invite codes and allowlist entries can be revoked, and any active shared invite code with prior redemptions or unknown redemption history is marked no-go until a global pause or per-user migration exists
```

## No-go if

```text
[ ] Real provider activation guardrails are missing and real provider mode is requested
[ ] Payment webhook signature validation is incomplete
[ ] Payment rollback only disables checkout/provider mode but leaves signed provider webhook retries able to mutate state
[ ] Notification duplicate-send risk is unresolved
[ ] Scheduler rollback relies only on `NOTIFICATION_SCHEDULER_MODE` without stopping the actual trigger, cron job, worker, or manual runner
[ ] Privacy delete/export flow is broken
[ ] Content safety checks are missing
[ ] Unknown birth time warnings are not surfaced
[ ] Any real provider call happens in tests
[ ] Codex review reports unresolved P0/P1 or critical P2 findings
[ ] Production secrets are required but unavailable
[ ] Rollback owner or process is unclear
[ ] Raw PII, birth data, payment payloads, ephemeris paths, or secrets appear in health/logs/alerts/audit/PR notes
[ ] Mock astro output is presented as production astrology
[ ] Swiss Ephemeris production use is enabled without license and file-manifest approval
[ ] PR29 dependency is pending but real provider activation is marked ready
[ ] PR31 dependency is pending but invite/enrollment readiness is overclaimed or beta invite is marked go
[ ] Rollback or disable-switch owner/process is unclear
[ ] Swiss Ephemeris license, ephemeris path, manifest, or active profile approval is unclear while production swisseph is enabled
[ ] Beta enrollment pause is described as a switch but only unrevoked active invite codes or allowlist entries exist
[ ] Any active shared invite code with prior redemptions or unknown redemption history is treated as safely pausable
```

## Pending dependency record

| Dependency | Status | Beta impact | Owner | Notes |
| --- | --- | --- | --- | --- |
| PR29 real provider activation guardrails | pending / merged / not applicable | pending if real provider activation is needed |  |  |
| PR31 beta launch content and invite management | pending / merged / not applicable | no-go for beta invite while pending |  |  |

## Decision table

| Area | Go / No-go / Pending | Evidence link or command | Owner | Notes |
| --- | --- | --- | --- | --- |
| Local checks | pending |  |  |  |
| Python astro checks | pending |  |  |  |
| Dry run | pending |  |  |  |
| Manual smoke matrix | pending |  |  |  |
| Provider modes | pending |  |  |  |
| Payment/webhook | pending |  |  |  |
| Notification scheduling | pending |  |  |  |
| Privacy/delete/export | pending |  |  |  |
| Content safety/admin approval | pending |  |  |  |
| Monitoring redaction | pending |  |  |  |
| Operator console | pending |  |  |  |
| Rollback | pending |  |  |  |
| Support/feedback | pending |  |  |  |
| Release notes | pending |  |  |  |
| Disable switches | pending |  |  |  |
| Post-launch monitoring | pending |  |  |  |
| Launch tag readiness | pending |  |  |  |
| Final decision | pending |  |  |  |

For `beta-rc-1`, the final decision should link the RC1-specific evidence
records:

- [Beta RC1 execution results](BETA_RC1_EXECUTION_RESULTS.md)
- [Beta RC1 smoke test results](BETA_RC1_SMOKE_TEST_RESULTS.md)
- [Beta RC1 go/no-go decision](BETA_RC1_GO_NO_GO_DECISION.md)

## Human sign-off

```text
Decision:
Approved beta audience:
Provider modes accepted:
Known limitations accepted:
Rollback target:
Support contact:
Signed by:
Timestamp:
```
