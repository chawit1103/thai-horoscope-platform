# Codex Automation Runbook

This runbook defines how Codex App, GitHub PR review, and ChatGPT should work together for the Thai Horoscope Platform.

The goal is to reduce repetitive human steps while keeping a human merge gate.

## Operating model

```text
Codex App local = implement / fix / run tests / commit / push
GitHub @codex review = final reviewer / edge-case finder
ChatGPT = prompt strategist / review translator / decision support
Human = merge gate / product-security decision maker
```

## Non-negotiable rules

Codex may automate implementation and fixes, but it must never:

```text
- merge pull requests
- deploy production
- add production secrets
- commit .env files
- commit .codex local config
- send real LINE messages in tests
- send real emails in tests
- call real payment providers in tests
- store card data
- download ephemeris files at runtime
- commit large ephemeris binaries
- enable Swiss Ephemeris in production without explicit professional license configuration
```

## Standard automated PR loop

### 1. Start from clean main

```bash
git checkout main
git pull origin main
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

If Python services are touched:

```bash
cd services/astro-calc
pytest
cd ../..
```

### 2. Create branch

```bash
git checkout -b <target-branch>
```

### 3. Give Codex App the implementation prompt

Use:

```text
local-codex-prompts/IMPLEMENT_ONE_PR.md
```

Codex must:

```text
- read AGENTS.md and relevant docs
- implement only requested scope
- self-review before finishing
- run tests
- check for secrets and local config
- commit and push only after tests pass
- produce PR title, description, and @codex review comment
```

### 4. Human opens PR

Open:

```text
https://github.com/chawit1103/thai-horoscope-platform/compare/main...<target-branch>?expand=1
```

Use the PR title/description produced by Codex.

### 5. Ask Codex for GitHub review

Use a PR-specific review prompt from:

```text
docs/CODEX_REVIEW_PROMPTS.md
```

Generic fallback:

```text
@codex review HEAD of this pull request branch.

Review for security regressions, privacy leaks, idempotency bugs, entitlement bypasses, accidental real provider calls in tests, PII logging, missing tests, and scope creep.
```

### 6. If review finds issues

Copy the review findings into Codex App local and use:

```text
local-codex-prompts/FIX_REVIEW_FINDINGS.md
```

Codex App must:

```text
- classify P0/P1/P2/P3
- fix P0/P1 and critical P2
- add regression tests
- run all tests
- commit and push
- produce next @codex review HEAD comment
```

### 7. Stop-loss rule

If the same PR enters more than 2 review/fix loops:

```text
STOP @codex fix.
STOP narrow patching.
Run a full-module hardening pass with local Codex App or Claude Code.
Use GitHub Codex only as reviewer.
```

Use:

```text
local-codex-prompts/FINAL_HARDENING_PASS.md
```

### 8. Final merge checklist

Before merge:

```text
[ ] GitHub Codex review says no major issues
[ ] pnpm install passed
[ ] pnpm lint passed
[ ] pnpm typecheck passed
[ ] pnpm test passed
[ ] Python tests passed if touched
[ ] git status clean, except ignored local-only files
[ ] no .codex/ in Files changed
[ ] no .env or secrets
[ ] no real provider calls in tests
[ ] no PII logging
[ ] scope matches PR goal
[ ] human has skimmed Files changed
```

Human merges manually.

### 9. After merge

```bash
git checkout main
git pull origin main
git log --oneline --decorate -10

git branch -d <target-branch>
git push origin --delete <target-branch>

pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

## Automation boundary

Codex may run:

```text
- implementation
- tests
- local review
- commit
- push
- PR description generation
```

Human must decide:

```text
- merge
- production deploy
- real payment provider activation
- LINE/email production send enablement
- Swiss Ephemeris license mode
- privacy/legal policy decisions
```
