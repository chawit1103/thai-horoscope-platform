# PR Workflow

This document is the default pull request workflow for the Thai Horoscope Platform.

## PR categories

### Type A — Critical PRs

Must be reviewed before merge.

```text
Auth
Privacy
Payment
Subscription
Email
LINE
Webhook
Notification
Audit log
Token/session/signature
Ephemeris/license/calculation integrity
```

Rules:

```text
- Full test suite required
- Codex GitHub review required
- P0/P1 must be fixed before merge
- Critical P2 should be fixed before merge
- Stop-loss after 2 loops
```

### Type B — Product PRs

Examples:

```text
UI pages
Admin display
Copy/layout
Non-critical refactor
Mock content
```

Rules:

```text
- Full test suite required
- Codex review recommended
- P2/P3 may become follow-up tasks
```

### Type C — Docs/Internal PRs

Examples:

```text
README
Runbooks
Prompt templates
Documentation
Known limitations
```

Rules:

```text
- Manual review acceptable
- Codex review optional
```

## Standard commands

Before commit:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

If Python service touched:

```bash
cd services/astro-calc
pytest
cd ../..
```

Before merge:

```bash
git status
git diff --stat main...HEAD
```

## PR branch naming

Use:

```text
prNN-short-topic
```

Examples:

```text
pr13-real-email-provider
pr14-line-messaging-api
pr15-subscription-lifecycle
pr16-real-payment-provider
pr17-notification-scheduling-jobs
pr18-astro-core-engine
```

## PR description template

```md
## Summary

<What this PR implements>

## Scope

- <scope item>
- <scope item>

## Tests

- <test area>
- <test area>

## Commands run

- pnpm install
- pnpm lint
- pnpm typecheck
- pnpm test
- Python tests if applicable

## Out of scope

- No production secrets
- No real provider calls in tests
- No unrelated behavior changes
```

## GitHub review loop

1. Open PR.
2. Comment with the PR-specific `@codex review` prompt.
3. If findings appear, paste them into Codex App using `FIX_REVIEW_FINDINGS.md`.
4. Push fixes.
5. Comment `@codex review HEAD of this pull request branch`.
6. Stop after 2 loops and switch to full hardening pass.

## Merge rules

Never merge if:

```text
- P0/P1 is unresolved
- tests fail
- branch has accidental secrets
- branch contains .codex/
- branch contains .env
- PR includes real provider calls in tests
- PR scope has expanded without decision
```
