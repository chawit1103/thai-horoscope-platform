# ROADMAP.md — Product and Engineering Roadmap

## Phase 0 — Foundation

Goal: create repo, docs, CI, and architecture boundaries.

Deliverables:

- Monorepo scaffold
- Agent rules
- CI
- Basic docs
- Environment templates

Exit criteria:

- Repo builds locally
- CI runs
- Hermes/Codex workers have clear instructions

## Phase 1 — Core data and web shell

Goal: create the core data model and mobile-first app shell.

Deliverables:

- User model
- Channel accounts
- Birth profile
- Subscription model
- Chart snapshot model
- Horoscope result model
- Web routes

Exit criteria:

- App can create a user and birth profile in dev mode
- Basic pages render

## Phase 2 — Astro calculation service

Goal: separate deterministic chart calculation from web app.

Deliverables:

- Python service
- Health/version endpoints
- Natal/transit endpoints
- Calculation profile model
- Golden tests

Exit criteria:

- Web app can request a chart snapshot from astro-calc
- Snapshot is stored with calculation hash

## Phase 3 — Horoscope MVP

Goal: show horoscope pages using deterministic mock or validated chart snapshots.

Deliverables:

- Today page
- Weekly page
- Monthly page
- Yearly page
- Rule engine MVP
- Content renderer MVP
- Safety disclaimer

Exit criteria:

- User can read generated horoscope result
- Content is safe and testable

## Phase 4 — Notification MVP

Goal: send notifications through channel-agnostic router.

Deliverables:

- LINE gateway
- Email gateway
- Notification preferences
- Outbound message queue/table
- Delivery attempts
- Fallback logic

Exit criteria:

- Dev/staging can send test notification
- Delivery attempts recorded
- Failed channels handled

## Phase 5 — Subscription MVP

Goal: implement entitlements and payment abstraction.

Deliverables:

- Plan model
- Entitlement checks
- Mock checkout
- Payment webhook abstraction
- Subscription status UI

Exit criteria:

- App gates premium pages by entitlement
- Mock payment can activate subscription

## Phase 6 — Admin and review

Goal: allow safe content approval and operational visibility.

Deliverables:

- Admin dashboard
- Horoscope approval queue
- Delivery attempt viewer
- User/subscription viewer
- Audit logs

Exit criteria:

- Admin can approve/reject content
- Admin can inspect failed delivery

## Phase 7 — Production readiness

Goal: prepare for controlled launch.

Deliverables:

- Privacy policy
- Terms
- Data deletion flow
- Security review
- Ephemeris license decision
- Real payment provider staging
- Monitoring
- Backup/restore plan

Exit criteria:

- Human owner approves production checklist
- No production secret in repo
- CI green
- Payment and notification providers tested in staging

## Future phases

### Telegram adapter

- Account linking through bot start token
- Telegram notification preferences
- Delivery attempts

### Microsoft Teams adapter

- B2B/corporate pilot
- Tenant/admin consent
- Proactive message support

### Advanced astrology

- More validated calculation profiles
- Solar return
- Period scanning for weekly/monthly/yearly
- Expert-authored rule library

### Personalization

- Reading archive
- Reflection journal
- Preference-based tone
- User feedback loop
