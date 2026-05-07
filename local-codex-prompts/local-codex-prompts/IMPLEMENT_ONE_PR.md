# Prompt: Implement One PR End-to-End

You are the local Codex automation agent for this repository.

## Goal

Implement one PR from start to finish, but do not merge.

## Target PR

```text
PR: <TARGET_PR_NUMBER_AND_NAME>
Branch: <TARGET_BRANCH>
Scope: <TARGET_SCOPE>
```

## Required workflow

1. Confirm current branch and working tree.
2. If not on the target branch, switch/create it from updated main.
3. Read:
   - AGENTS.md
   - docs/CODEX_AUTOMATION_RUNBOOK.md
   - docs/PR_WORKFLOW.md
   - docs/STOP_LOSS_RULES.md
   - docs/HIGH_RISK_PR_CHECKLIST.md
   - all PR-relevant domain docs
4. Implement only the requested PR scope.
5. Before finishing, self-review against:
   - security bypass
   - privacy leak
   - idempotency
   - duplicate sends
   - token/session/signature handling
   - hardcoded secrets
   - PII logging
   - real provider calls in tests
   - scope creep
6. Add regression tests for all new behavior.
7. Run:
   - pnpm install
   - pnpm lint
   - pnpm typecheck
   - pnpm test
   - Python tests if relevant
   - git diff --check
8. Check that no local-only files or secrets are committed.
9. Commit and push only after tests pass.
10. Produce:
   - PR title
   - PR description
   - @codex review comment
   - files changed summary
   - commands run
   - risks and follow-ups

## Never do these

- Do not merge.
- Do not deploy.
- Do not add production secrets.
- Do not commit .env.
- Do not commit .codex/.
- Do not send real LINE/email/payment calls in tests.
- Do not add unrelated refactors.

## Output format

```text
Summary:
- ...

Files changed:
- ...

Tests/commands run:
- ...

PR title:
...

PR description:
...

GitHub review comment:
@codex review ...

Risks/follow-ups:
- ...
```
