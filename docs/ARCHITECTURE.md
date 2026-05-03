# ARCHITECTURE.md — System Architecture

## Architecture decision

Use a monorepo with a TypeScript web platform and a Python astro calculation service.

```text
/apps/web
  Next.js + TypeScript
  user/account/subscription/payment/notification/admin/UI

/services/astro-calc
  Python service
  ephemeris, natal chart, transit chart, houses, aspects

/packages/contracts
  JSON Schema, OpenAPI, generated TypeScript types

/docs
  system docs, security docs, review docs, swarm docs
```

## High-level diagram

```text
                        ┌──────────────────────┐
                        │       User           │
                        └──────────┬───────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                │                  │                  │
                ▼                  ▼                  ▼
          LINE OA / LIFF         Email             Future Bot
                │                  │                  │
                └──────────────────┼──────────────────┘
                                   ▼
                        ┌──────────────────────┐
                        │ Next.js Web Platform │
                        │ /apps/web            │
                        └──────────┬───────────┘
                                   │
                         API / contract calls
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │ Python Astro Service │
                        │ /services/astro-calc │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │ PostgreSQL           │
                        │ snapshots/results    │
                        └──────────────────────┘
```

## Main components

### Web platform

Owns:

- Account and identity
- Birth profile collection
- Subscription state
- Payment provider abstraction
- Notification preference
- Notification routing
- Horoscope result pages
- Admin review queue
- Audit logs

Does not own:

- Planetary position calculation
- Ephemeris file management
- House calculation
- Ayanamsha calculation

### Astro calculation service

Owns deterministic chart calculation:

- Natal chart
- Transit chart
- Calculation profiles
- Ephemeris source metadata
- Calculation hashes
- Golden-file regression tests

Does not own:

- User subscription logic
- Payment logic
- Notification delivery
- Content copywriting

### Horoscope interpretation engine

Consumes chart snapshots and returns:

- Rule hits
- Scores by category
- Safe interpretation notes
- Content JSON for rendering

Interpretation may live in `/apps/web` initially or become a separate service later. It must never invent chart data.

## Data flow — onboarding

```text
1. User submits birth profile.
2. Web app validates input.
3. Web app calls astro-calc /v1/charts/natal.
4. Astro-calc returns chart snapshot JSON.
5. Web app stores birth profile and chart snapshot.
6. User can proceed to subscription or horoscope page.
```

## Data flow — daily generation

```text
1. Scheduled job selects active subscribers.
2. Job loads natal chart snapshot.
3. Job requests transit snapshot for period/date.
4. Rule engine computes rule hits.
5. Content renderer creates horoscope result.
6. Admin approval may be required.
7. Notification router sends through preferred channel.
8. Delivery attempts are stored.
```

## Data flow — notification

```text
1. Outbound message is created.
2. Router loads notification preferences.
3. Router selects first active channel account by priority.
4. Gateway sends message.
5. Delivery attempt is recorded.
6. If blocked/bounced/unsubscribed, channel is marked inactive.
7. Fallback channel is tried if configured.
```

## API boundaries

The web app must communicate with astro-calc only through documented contracts.

Recommended endpoints:

```text
GET  /v1/health
GET  /v1/engine/version
POST /v1/charts/natal
POST /v1/charts/transit
POST /v1/aspects
```

Contracts belong in `/packages/contracts`.

## Deployment model

MVP deployment may use:

- Web app: Vercel, Render, Fly.io, or similar
- Astro service: containerized Python service
- Database: managed PostgreSQL, such as Supabase or RDS
- Jobs: Vercel Cron, GitHub Actions, Cloud Scheduler, or a worker service

Production requirements:

- No runtime download of ephemeris files
- Health checks
- Structured logs
- Environment-specific secrets
- Separate staging and production
- CI before deploy

## Scalability considerations

The system should cache and store chart snapshots. Avoid recalculating natal charts on every page load.

Recommended caching:

- Natal chart: calculate once per birth profile version
- Daily transit: precompute per date and calculation profile where possible
- Horoscope result: generate once per user/period/profile version

## Failure handling

The platform must handle:

- Astro service unavailable
- Notification provider unavailable
- Payment webhook retry
- Duplicate webhook events
- User blocked LINE OA
- Email bounce or complaint
- Unknown birth time
- Invalid timezone or geocoding uncertainty

## Key design principle

Separate these layers:

```text
Astronomical calculation → Astrological rules → Safe content rendering → Delivery channel
```
