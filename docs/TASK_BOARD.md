# TASK_BOARD.md — Initial Hermes/Codex Task Board

## Backlog format

```text
Task ID:
Title:
Owner role:
Priority:
Scope:
Done when:
Blocked by:
```

## Now

### TASK-001 — Repo scaffold

Owner role: Foundation Builder
Priority: P0

Scope:

- Create monorepo layout
- Add `/apps/web`
- Add `/services/astro-calc`
- Add `/packages/contracts`
- Add basic package scripts
- Add `.env.example`

Done when:

- Repo installs dependencies
- Basic app/service placeholders run
- README updated

### TASK-002 — CI and quality gates

Owner role: Foundation Builder / QA
Priority: P0

Scope:

- Add lint/typecheck/test scripts
- Add CI workflow
- Add Python test workflow

Done when:

- CI runs on pull request
- Commands documented

### TASK-003 — Prisma core schema

Owner role: Foundation Builder
Priority: P0

Scope:

- users
- channel_accounts
- birth_profiles
- subscriptions
- payment_transactions
- calculation_profiles
- chart_snapshots
- horoscope_results
- notification tables
- audit_logs

Done when:

- Schema validates
- Migration generated
- Data model docs updated if needed

### TASK-004 — Contracts package

Owner role: Contract Worker
Priority: P0

Scope:

- JSON schema or OpenAPI for astro-calc
- TypeScript generated types or manually typed contracts

Done when:

- Web app and Python service can share request/response definitions

## Next

### TASK-005 — Astro service scaffold

Owner role: Astro Calculation Builder
Priority: P1

Scope:

- FastAPI app
- health endpoint
- engine version endpoint
- natal/transit endpoint placeholders
- deterministic mock engine

Done when:

- Python tests pass
- Returns calculation_hash

### TASK-006 — Birth profile onboarding

Owner role: Web Builder
Priority: P1

Scope:

- `/onboarding`
- birth date/time/place form
- unknown birth time checkbox
- consent checkbox
- Zod validation

Done when:

- User can save birth profile in dev mode

### TASK-007 — Notification gateway interface

Owner role: Notification Builder
Priority: P1

Scope:

- NotificationGateway interface
- LineGateway placeholder
- EmailGateway placeholder
- TelegramGateway placeholder
- TeamsGateway placeholder

Done when:

- Router can call mock gateway in tests

### TASK-008 — Horoscope pages shell

Owner role: Web Builder
Priority: P1

Scope:

- `/today`
- `/weekly`
- `/monthly`
- `/yearly`
- disclaimer
- entitlement placeholder

Done when:

- Pages render mobile-first layout

## Later

### TASK-009 — LINE profile sync

Owner role: Integration Builder
Priority: P2

Scope:

- Optional LIFF initialization
- profile sync endpoint
- line channel account creation

Done when:

- Test profile sync works in dev/staging

### TASK-010 — LINE webhook

Owner role: Integration Builder
Priority: P2

Scope:

- signature verification
- follow/unfollow/message/postback handling
- inbound_events table

Done when:

- Webhook tests pass

### TASK-011 — Email gateway sandbox

Owner role: Notification Builder
Priority: P2

Scope:

- Email gateway in sandbox/log mode
- transactional templates
- delivery attempt records

Done when:

- Test email event produces delivery attempt

### TASK-012 — Subscription entitlement

Owner role: Subscription Builder
Priority: P2

Scope:

- entitlement helper
- plan mapping
- protect premium pages

Done when:

- Tests cover free/basic/premium access

### TASK-013 — Mock payment provider

Owner role: Payment Builder
Priority: P2

Scope:

- create checkout mock
- webhook mock
- activate subscription in dev

Done when:

- Mock flow can activate Basic/Premium

### TASK-014 — Rule engine MVP

Owner role: Horoscope Builder
Priority: P2

Scope:

- deterministic rule hits from mock chart snapshots
- safe content renderer
- content JSON output

Done when:

- Daily result generated and rendered

### TASK-015 — Admin approval queue

Owner role: Admin Builder
Priority: P3

Scope:

- list draft horoscope results
- approve/reject
- show safety flags

Done when:

- Admin can approve a result in dev

## Blocked decisions

### DECISION-001 — Production ephemeris strategy

Owner: Human

Options:

- Swiss Ephemeris with approved commercial/professional license
- Skyfield/Astropy/jplephem strategy
- Other approved engine

Must be decided before paid production launch.

### DECISION-002 — Payment provider

Owner: Human

Options:

- LINE Pay
- Omise
- Stripe where available
- Other recurring-capable provider

Must be decided before real checkout implementation.
