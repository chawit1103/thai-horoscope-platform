# AGENTS.md — Instructions for Hermes/Codex Workers

## Project

Build a Thai astrology subscription platform with multi-channel delivery.

This is **not** a LINE MINI App. The system is a normal responsive web app that can be opened from a LINE Official Account Rich Menu and can optionally use LIFF for LINE profile sync.

## Core stack

- Web app: Next.js + TypeScript
- Database: PostgreSQL
- ORM: Prisma or Drizzle, with preference for Prisma for initial MVP
- Validation: Zod
- Styling: Tailwind CSS
- Astro calculation service: Python, preferably FastAPI for HTTP service mode
- Contracts: OpenAPI and/or JSON Schema, with generated TypeScript types
- Notifications: channel-agnostic gateway abstraction
- Initial channels: LINE and Email
- Future channels: Telegram and Microsoft Teams

## Non-negotiable architecture rules

1. Do not build a LINE MINI App.
2. Do not make business logic depend on LINE.
3. Do not calculate planetary positions inside the Next.js web app.
4. Do not let LLMs invent planetary positions.
5. Do not mix ephemeris calculation with horoscope interpretation text.
6. Do not send production messages, production emails, or payment requests from tests.
7. Do not merge PRs, force-push, deploy, publish, or modify production secrets without explicit human approval.
8. Do not introduce new dependencies without explaining why they are needed.
9. Do not perform opportunistic refactors outside the task scope.
10. Do not store unencrypted or unnecessary sensitive user data beyond the documented schema.

## Product positioning

Horoscope content must be framed as entertainment, reflection, and lifestyle guidance.

Forbidden content patterns:

- Predicting death, serious illness, accidents, or unavoidable harm
- Claiming medical diagnosis or cure
- Giving specific investment, legal, or financial instruction
- Claiming guaranteed outcomes
- Fear-based upsell or ritual/merchandise pressure
- Saying the service is 100% accurate
- Using private birth data for unrelated marketing without consent

Preferred phrasing:

- “แนวโน้มวันนี้...”
- “พลังงานช่วงนี้เหมาะกับ...”
- “ควรใช้วิจารณญาณ...”
- “ใช้เป็นแนวทางทบทวนตัวเอง...”
- “เพื่อความบันเทิงและการสะท้อนตนเอง...”

## Repository boundaries

Expected layout:

```text
/apps/web
/services/astro-calc
/packages/contracts
/docs
```

Worker ownership guideline:

- Platform workers may modify `/apps/web`, `/packages/contracts`, and relevant docs.
- Astro calculation workers may modify `/services/astro-calc`, `/packages/contracts`, and astro docs.
- Notification workers may modify notification-related code, schemas, and docs.
- Security/review workers should not implement large features; they inspect and propose fixes.

## Branch and worktree rules

- One worker, one branch or worktree.
- One PR, one bounded feature slice.
- Avoid multiple workers modifying schema migrations at the same time.
- Schema-changing PRs should be small and reviewed before dependent PRs proceed.
- Always include a checkpoint before handing off.

## Required checkpoint format

Every worker must report:

```text
Worker:
Task:
Branch:
Files changed:
Commands run:
Tests/proof:
Risks:
Blockers:
Decisions needed from human:
Next recommended action:
```

## Required proof before PR handoff

Run what exists in the project:

```bash
npm run lint
npm run typecheck
npm test
```

For Python astro service, also run:

```bash
python -m pytest
python -m ruff check .
python -m mypy .
```

If commands do not exist yet, the worker must either add them or explicitly report that they are not yet defined.

## Security rules

- Never log secrets.
- Never commit `.env` files.
- Use `.env.example` for placeholders only.
- Webhooks must verify signatures where supported.
- Payment webhooks must be idempotent.
- Notification delivery must record every attempt.
- Data deletion must be implemented before production launch.
- Use least-privilege tokens for GitHub, email provider, LINE, and payment provider.

## Human approval gates

Human approval is required before:

- Merge to main
- Production deploy
- Payment provider activation
- Sending real LINE or Email campaigns
- Adding or changing production secrets
- Choosing Swiss Ephemeris commercial/AGPL strategy
- Changing privacy, retention, or consent behavior
- Disabling security checks or tests

## Coding principles

- Prefer simple, explicit code.
- Use typed boundaries between services.
- Validate all user input with Zod or Pydantic.
- Store provider raw payloads where useful, but avoid storing unnecessary sensitive data.
- Use deterministic tests for horoscope calculation and content generation.
- Do not hide calculation changes; version them.

## Definition of done

A task is done only when:

1. It meets the written scope.
2. It has validation and tests where applicable.
3. It has docs updated if it changes architecture or behavior.
4. It has a checkpoint with proof.
5. It does not require unapproved production access.
