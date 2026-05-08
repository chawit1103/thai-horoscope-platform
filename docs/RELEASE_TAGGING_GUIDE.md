# RELEASE_TAGGING_GUIDE.md - Release Tagging Guide

## Purpose

Document how a human operator can tag a beta release candidate after go approval. This guide does not approve a merge, deploy, production provider activation, real payment charging, production secrets, or Swiss Ephemeris production use.

## Tag prerequisites

```text
[ ] Human go decision recorded in docs/BETA_GO_NO_GO_EXECUTION_RECORD.md
[ ] Launch execution log filled in docs/BETA_LAUNCH_EXECUTION_LOG.md
[ ] Staging dry-run results recorded in docs/STAGING_DRY_RUN_RESULTS.md
[ ] Required checks passed
[ ] Codex review has no unresolved P0/P1 or critical P2 findings
[ ] No .env file committed
[ ] No production secrets committed
[ ] No ephemeris binaries committed
[ ] No real provider calls occurred in tests
[ ] Provider modes and human approvals are recorded
[ ] Rollback owner and rollback target are recorded
```

## Tag format

Use a beta-specific tag that cannot be mistaken for production readiness:

```text
beta-rc-YYYYMMDD-N
```

Examples:

```text
beta-rc-20260508-1
beta-rc-20260508-2
```

Do not use `production`, `prod`, `stable`, or provider-specific wording unless a separate human production approval exists.

## Create a tag

Run only after human go approval:

```bash
git fetch origin
git checkout <approved-branch>
git pull --ff-only origin <approved-branch>
git rev-parse HEAD
git tag -a beta-rc-YYYYMMDD-N -m "Beta RC YYYY-MM-DD N: <short summary>; env=<staging/local>; providers=<sandbox/mock/dry-run>; astro=<mock>; decision=<owner>"
git push origin beta-rc-YYYYMMDD-N
```

The tag message should include:

```text
RC version:
Commit:
Environment:
Provider modes:
Payment mode:
Notification mode:
Astro engine/profile:
Decision owner:
Go/no-go record:
```

Never include secrets, raw provider payloads, raw email addresses, raw LINE user IDs, birth data, payment payloads, ephemeris paths, or license details in the tag message.

## Verify a tag

```bash
git fetch origin --tags
git show --stat beta-rc-YYYYMMDD-N
git rev-list -n 1 beta-rc-YYYYMMDD-N
git tag -n99 beta-rc-YYYYMMDD-N
```

For unsigned annotated tags created with `git tag -a`, verify that `git rev-list -n 1` matches the approved commit and that the tag message contains the expected RC metadata.

If the team uses signed tags, create the tag with `git tag -s` instead of `git tag -a`, then add:

```bash
git tag -v beta-rc-YYYYMMDD-N
```

If signed tags are not configured, record that explicitly in the execution log and verify the tag target commit through GitHub or the commands above instead.

## Roll back a tag or deployment

If a tag points to the wrong commit before deployment:

```bash
git tag -d beta-rc-YYYYMMDD-N
git push origin :refs/tags/beta-rc-YYYYMMDD-N
```

Then create a corrected tag only after the release owner confirms the intended commit.

If a tagged deployment must be rolled back:

```text
[ ] Use docs/ROLLBACK_CHECKLIST.md
[ ] Use docs/LAUNCH_DISABLE_SWITCHES.md
[ ] Disable real provider sends or keep providers sandboxed
[ ] Disable payment checkout and contain webhook ingress if payment risk exists
[ ] Stop scheduler trigger/worker if notification risk exists
[ ] Return ASTRO_ENGINE to mock for non-production validation if astro risk exists
[ ] Restore last known good deployment artifact or commit
[ ] Preserve audit logs and monitoring event IDs
[ ] Notify beta users with approved support wording
```

Do not delete an already-used release tag without recording why. Prefer a new corrective tag if the tag was referenced by deployment, support, or incident notes.

## Tag no-go conditions

Do not tag when:

```text
[ ] Human go approval is missing
[ ] Checks have not passed
[ ] Codex review has unresolved P0/P1 or critical P2 findings
[ ] Production secrets or .env files are present
[ ] Ephemeris binaries are present
[ ] Real provider mode is assumed from partial config
[ ] Rollback owner is unknown
[ ] Payment webhook or scheduler containment is unclear
[ ] Beta enrollment pause limitations are not accepted
```
