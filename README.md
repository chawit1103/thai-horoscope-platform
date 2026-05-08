# Thai Horoscope Subscription Platform — Documentation Pack

This documentation pack is designed to be copied into the root of a new repository and used by Hermes Workspace, Hermes Agent Swarm, Codex, or a human engineering team.

The product is a Thai astrology subscription platform. It is **not** a LINE MINI App. LINE is treated as one delivery channel among several, alongside Email, Telegram, Microsoft Teams, and future adapters.

## Recommended repository layout

```text
/apps
  /web                  # Next.js + TypeScript web app
/services
  /astro-calc           # Python ephemeris/chart calculation service
/packages
  /contracts            # JSON Schema / OpenAPI / generated TypeScript types
/docs                   # Product, architecture, security, review docs
AGENTS.md               # Rules for Codex/Hermes agents
PLANS.md                # Initial project execution plan
```

## How to use this pack

1. Copy all files into the root of the target repo.
2. Ask Hermes Orchestrator to read `AGENTS.md`, `PLANS.md`, and `docs/TASK_BOARD.md` first.
3. Create one branch/worktree per worker or per PR slice.
4. Use CI as the objective quality gate.
5. Require human approval before merge, production deploy, payment integration, secret changes, or license-sensitive ephemeris decisions.

## Key decisions already encoded

- Use Next.js + TypeScript for the platform app.
- Use Python for deterministic astronomical/astrological calculation.
- Store versioned chart snapshots rather than recalculating silently.
- Keep horoscope interpretation separate from ephemeris calculation.
- Build a channel-agnostic notification system.
- Implement LINE and Email first; add Telegram and Teams as adapters later.
- Treat horoscope content as entertainment and self-reflection, not medical, legal, or financial advice.

## PR10 mock MVP flow

This branch includes a development-only mock end-to-end flow in `/apps/web`.

Run it locally:

```bash
pnpm install
pnpm dev
```

Open:

- `/onboarding` to save a mock birth profile.
- `/today`, `/weekly`, `/monthly`, `/yearly` to view entitlement-gated mock horoscope results.
- `/admin` to approve a mock draft, queue a mock outbound message, and record a mock delivery attempt.

The flow is intentionally non-production:

- No real payment provider is used.
- No real notification is sent.
- No LINE credentials or production secrets are required.
- No real ephemeris or Swiss Ephemeris dependency is used.
- The astro calculation step is a deterministic mock adapter.

Quality checks:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

## File map

```text
AGENTS.md
PLANS.md
docs/PRODUCT_SPEC.md
docs/ARCHITECTURE.md
docs/DATA_MODEL.md
docs/NOTIFICATION_GATEWAY.md
docs/ASTRO_CALCULATION.md
docs/HOROSCOPE_RULES.md
docs/EPHEMERIS_POLICY.md
docs/VALIDATION_CASES.md
docs/SUBSCRIPTION_PAYMENT.md
docs/SECURITY_PRIVACY.md
docs/CONTENT_SAFETY.md
docs/ROADMAP.md
docs/TASK_BOARD.md
docs/CODE_REVIEW.md
docs/HERMES_SWARM.md
docs/DEPLOYMENT_RUNBOOK.md
docs/BETA_RELEASE_CANDIDATE.md
docs/E2E_BETA_SMOKE_TEST_MATRIX.md
docs/BETA_RELEASE_NOTES.md
docs/BETA_RELEASE_NOTES_TEMPLATE.md
docs/FINAL_GO_NO_GO_CHECKLIST.md
docs/POST_LAUNCH_MONITORING_CHECKLIST.md
docs/BETA_SUPPORT_AND_FEEDBACK.md
docs/LAUNCH_DISABLE_SWITCHES.md
.hermes/MISSION_MVP.md
```
