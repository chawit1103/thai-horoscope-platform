# MISSION_MVP.md — First Hermes Swarm Mission

## Mission

Build the MVP foundation for the Thai Horoscope Subscription Platform.

## Required reading

Workers must read:

- `AGENTS.md`
- `PLANS.md`
- `docs/ARCHITECTURE.md`
- `docs/TASK_BOARD.md`
- `docs/CODE_REVIEW.md`

## Goal

Create a working foundation, not the complete product.

## Deliverables

1. Monorepo scaffold
2. Next.js app placeholder under `/apps/web`
3. Python astro-calc service placeholder under `/services/astro-calc`
4. Contracts package under `/packages/contracts`
5. Database schema draft
6. Notification gateway interface
7. Deterministic mock astro calculation endpoint
8. CI with lint/typecheck/test placeholders
9. Updated README and docs

## Constraints

- Do not build LINE MINI App.
- Do not implement real payment provider.
- Do not use production secrets.
- Do not send real notifications.
- Do not merge PRs.
- Do not deploy production.
- Do not download license-sensitive ephemeris files into the repo.

## Worker allocation

```text
Foundation Builder → repo scaffold, CI, package scripts
Astro Builder → Python service mock engine
Notification Builder → gateway interface and router skeleton
Web Builder → web app shell and initial routes
Scribe → docs updates
Reviewer → review all branches
QA → run tests and smoke checks
```

## Acceptance criteria

- All scaffolds exist.
- CI passes.
- Mock astro endpoint returns deterministic response with calculation_hash.
- Notification router can send through a mock gateway in tests.
- Web app has placeholder routes for onboarding, today, weekly, monthly, yearly, subscribe, account, settings, admin.
- No production-only dependency or secret is required.

## Checkpoint format

```text
Worker:
Task:
Branch:
Files changed:
Commands run:
Tests/proof:
Risks:
Blockers:
Human decisions needed:
Next recommended action:
```
