# HERMES_SWARM.md — Hermes Workspace Swarm Operating Model

## Goal

Use Hermes Workspace as the orchestration layer for a swarm of specialized workers. Workers may use Hermes Agent, Codex, or other approved coding agents depending on local setup.

## Recommended roles

### Orchestrator

Responsibilities:

- Read product and architecture docs
- Break mission into bounded tasks
- Assign tasks to workers
- Read checkpoints
- Route work to reviewer/QA
- Escalate human decisions

Must not:

- Merge PRs
- Deploy production
- Approve license/payment/security decisions alone

### Foundation Builder

Responsibilities:

- Monorepo scaffold
- CI
- Tooling
- Package scripts
- Environment templates

### Web Builder

Responsibilities:

- Next.js pages
- UI components
- Onboarding
- Account/settings
- Horoscope pages

### Astro Calculation Builder

Responsibilities:

- Python astro service
- Calculation profiles
- Ephemeris integration
- Golden tests

### Notification Builder

Responsibilities:

- NotificationGateway interface
- LINE/Email adapters
- Delivery router
- Delivery attempts

### Subscription/Payment Builder

Responsibilities:

- Plans
- Entitlements
- Payment abstraction
- Webhook idempotency

### Horoscope Builder

Responsibilities:

- Rule engine
- Content renderer
- Safety flags
- Admin approval integration

### Reviewer

Responsibilities:

- Review diffs
- Check architecture boundaries
- Check security/privacy risks
- Return verdict

### QA

Responsibilities:

- Run tests
- Add regression tests
- Smoke test user flows
- Validate golden files

### Scribe

Responsibilities:

- Update docs
- Prepare handoff notes
- Keep task board current

## Branch/worktree discipline

Rules:

```text
1 worker = 1 branch or worktree
1 PR = 1 bounded feature slice
No multiple workers on same schema migration unless coordinated
No force-push without explicit approval
No merge by agents
```

Suggested branch names:

```text
feat/repo-scaffold
feat/astro-service-scaffold
feat/notification-gateway
feat/birth-profile-onboarding
feat/subscription-entitlements
```

## Mission prompt template

```text
Mission:
<desired outcome>

Context:
Read AGENTS.md, PLANS.md, and relevant docs.

Constraints:
- Do not build LINE MINI App.
- Do not access production secrets.
- Do not merge or deploy.
- Keep calculation separate from interpretation.
- Keep notification channel-agnostic.

Deliverables:
<files/features/docs/tests>

Done when:
<objective checks>

Checkpoint required:
Worker, task, branch, files changed, commands run, tests/proof, risks, blockers, human decisions, next action.
```

## Worker task prompt template

```text
You are <role>.

Task:
<bounded task>

Allowed scope:
<paths>

Do not modify:
<paths>

Acceptance criteria:
<criteria>

Run:
<commands>

Return checkpoint.
```

## Review prompt template

```text
You are Reviewer.

Review this branch/PR against:
- AGENTS.md
- CODE_REVIEW.md
- relevant architecture docs

Return:
Verdict: APPROVED | CHANGES_REQUESTED | BLOCKED
Critical issues:
Major issues:
Minor issues:
Tests reviewed:
Recommended next action:
```

## Human decision queue

The orchestrator must escalate:

- Payment provider selection
- Ephemeris production license/strategy
- Production deploy
- Secret creation/change
- Major product pricing
- Privacy/retention policy
- Merge approval

## Suggested first swarm mission

```text
Build MVP foundation only.

Deliver:
- monorepo scaffold
- docs copied into repo
- core schema draft
- astro-calc mock service
- notification gateway interface
- CI

Do not implement real payment, real ephemeris, or production notifications.
```

## Anti-patterns

Avoid:

- “Build the whole app” as one task
- Multiple agents editing one branch
- Agents deciding production payment provider
- Agents downloading license-sensitive ephemeris files into repo
- Agents sending real LINE messages during tests
- Agents silently updating golden fixtures
