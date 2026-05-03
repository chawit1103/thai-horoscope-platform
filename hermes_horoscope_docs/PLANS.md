# PLANS.md — Initial Execution Plan

## Mission

Build the MVP foundation for a Thai horoscope subscription platform with multi-channel delivery and a separate Python astro calculation service.

## Product summary

Users subscribe to receive and read Thai horoscope content by period:

- Daily
- Weekly
- Monthly
- Yearly

Users can receive notifications through multiple delivery channels:

- LINE, first-class MVP channel
- Email, first-class MVP channel and account/payment fallback
- Telegram, future adapter
- Microsoft Teams, future adapter for B2B use cases

The platform should not depend on LINE as the core product identity.

## Technical strategy

Use a monorepo:

```text
/apps/web                # Next.js web app
/services/astro-calc     # Python chart calculation service
/packages/contracts      # shared schemas and generated types
/docs                    # documents for humans and agents
```

The web app owns:

- Users
- Profiles
- Subscription plans
- Payments
- Notification routing
- Horoscope result pages
- Admin review

The Python service owns:

- Ephemeris integration
- Natal chart calculation
- Transit chart calculation
- House and aspect calculation
- Calculation profile versioning
- Golden-file regression tests

## Phase 0 — Repo foundation

Deliverables:

- Monorepo scaffold
- `AGENTS.md`
- CI scripts
- TypeScript lint/typecheck/test setup
- Python lint/test setup
- `.env.example`
- Basic docs under `/docs`

Suggested PRs:

```text
PR-001 repo-scaffold
PR-002 docs-and-agent-rules
PR-003 ci-and-quality-gates
```

## Phase 1 — Data model and contracts

Deliverables:

- PostgreSQL schema
- Prisma schema
- Core enums
- JSON schema/OpenAPI contracts between web app and astro service
- Initial migration

Suggested PRs:

```text
PR-004 core-data-model
PR-005 notification-data-model
PR-006 astro-contracts
```

## Phase 2 — Astro calculation MVP

Deliverables:

- `/services/astro-calc`
- Health endpoint
- Natal chart endpoint
- Transit chart endpoint
- Deterministic mock mode if ephemeris dependency is not finalized
- Golden tests
- Ephemeris policy documented

Suggested PRs:

```text
PR-007 astro-service-scaffold
PR-008 calculation-profile-and-snapshots
PR-009 golden-tests
```

Important decision gate:

```text
Before paid production launch, decide:
- Swiss Ephemeris professional license, or
- Skyfield/Astropy/jplephem stack, or
- another approved calculation strategy
```

## Phase 3 — Web app MVP

Deliverables:

- Mobile-first web app
- User profile
- Birth profile onboarding
- Daily/weekly/monthly/yearly pages
- Subscribe page
- Account page
- Notification settings page
- Admin placeholder

Suggested PRs:

```text
PR-010 web-app-shell
PR-011 onboarding-and-birth-profile
PR-012 horoscope-pages
PR-013 account-and-settings
```

## Phase 4 — Notification gateway

Deliverables:

- Channel account model
- Notification preference model
- Outbound message model
- Delivery attempt model
- LINE gateway
- Email gateway placeholder or sandbox implementation
- Telegram and Teams placeholders
- Notification router

Suggested PRs:

```text
PR-014 gateway-interface
PR-015 line-gateway
PR-016 email-gateway
PR-017 notification-router
```

## Phase 5 — Subscription and payment abstraction

Deliverables:

- Plan model
- Subscription status model
- Entitlement checks
- Payment provider interface
- Webhook placeholder
- Idempotency and audit logging

Suggested PRs:

```text
PR-018 subscription-model
PR-019 entitlement-middleware
PR-020 payment-provider-abstraction
```

## Phase 6 — Horoscope interpretation and admin approval

Deliverables:

- Rule engine consuming chart snapshots
- Content JSON output
- Admin approval queue
- Content safety checklist
- Manual review for monthly/yearly content

Suggested PRs:

```text
PR-021 rule-engine
PR-022 content-renderer
PR-023 admin-approval
```

## Phase 7 — MVP hardening

Deliverables:

- Security review
- Privacy/data deletion flow
- Webhook signature verification
- Delivery retry logic
- End-to-end smoke tests
- Production runbook

Suggested PRs:

```text
PR-024 security-hardening
PR-025 data-deletion
PR-026 smoke-tests
PR-027 deployment-runbook
```

## Operating model for Hermes Swarm

Recommended roles:

- Orchestrator
- Foundation Builder
- Web Builder
- Astro Calculation Builder
- Notification Builder
- Subscription/Payment Builder
- Reviewer
- QA
- Scribe

Each role must produce checkpoints. The human owner approves merge, production, secrets, payment, and license decisions.
