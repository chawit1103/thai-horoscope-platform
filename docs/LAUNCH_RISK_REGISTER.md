# LAUNCH_RISK_REGISTER.md - Launch Risk Register

## Goal

Track known beta and production launch risks with clear mitigations, owners, and go/no-go impact.

## Risk levels

```text
Low       monitored but not release-blocking
Medium    requires owner acceptance before beta
High      blocks beta unless mitigated or explicitly accepted
Critical  blocks production and usually blocks beta
```

## Register

| ID | Area | Risk | Level | Mitigation | Beta impact | Production impact |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Security | Production secrets or `.env` files are committed. | Critical | Use `.env.example` only; scan PR diff; configure secrets in deployment platform. | No-go | No-go |
| R-002 | Security | Admin route or server action runs without a server-verified admin session. | Critical | Keep signed session checks; production requires `ADMIN_SESSION_SECRET`; production forbids `MOCK_ADMIN_TOKEN`. | No-go | No-go |
| R-003 | Privacy | Logs, alerts, health reports, PR comments, or audit metadata expose PII or birth data. | Critical | Use observability redaction before emission; smoke-test health and alert output. | No-go | No-go |
| R-004 | Payment | Entitlements change without verified webhook processing. | Critical | Require signature verification, stored checkout binding, and idempotency. | No-go for payment beta | No-go |
| R-005 | Payment | In-memory webhook idempotency is mistaken for production durability. | High | Document durable storage requirement before production provider activation. | Accept only for mock/staging test | No-go |
| R-006 | Notification | Deleted, deactivated, unsubscribed, blocked, or bounced users receive messages. | Critical | Smoke-test suppression and scheduler dry_run output; record delivery attempts. | No-go | No-go |
| R-007 | Notification | Duplicate sends occur for the same user/topic/period. | High | Verify idempotency key and duplicate-send prevention before beta. | No-go unless explicitly accepted for dry_run only | No-go |
| R-008 | Astro | Mock astro output is presented as paid production astrology. | Critical | Health blocks production mock mode; communication states beta/prototype limitations. | No-go for paid claims | No-go |
| R-009 | Astro | Swiss Ephemeris production use lacks professional license approval. | Critical | Keep production blocked until human/legal approval. | Accept only when not production | No-go |
| R-010 | Astro | Ephemeris files are unpinned, downloaded at runtime, or committed. | Critical | Require mounted/packaged file manifest and repository binary scan. | No-go for real-engine beta | No-go |
| R-011 | Astro | Unknown birth time or missing location drives high-confidence house/timing claims. | High | Use warning-aware downstream behavior; avoid high-confidence timing prose. | Must be disclosed | No-go for unsupported claims |
| R-012 | Environment | Real provider modes start without required credentials. | Critical | Environment validation fails closed. | No-go | No-go |
| R-013 | Monitoring | Real alert provider sends during tests. | High | Tests use mock alert provider only; no vendor dependency in PR21 foundation. | No-go | No-go |
| R-014 | Content safety | Horoscope copy claims guaranteed harm, medical/legal/financial advice, fear-based upsell, or 100% accuracy. | Critical | Keep entertainment/self-reflection framing and admin review. | No-go | No-go |
| R-015 | Support | Beta support owner or escalation path is missing. | Medium | Assign owner and sanitized issue process before invitations. | No-go unless owner accepts limited internal beta | No-go |
| R-016 | Rollback | Rollback target or owner is unknown. | High | Complete rollback checklist before beta invite. | No-go | No-go |
| R-017 | Dependency | PR29 real provider activation guardrails are pending but provider activation is treated as ready. | High | Mark PR29 pending and keep real provider activation blocked until merged and approved. | No-go for real provider activation | No-go |
| R-018 | Dependency | PR31 beta invite/content management is pending but beta enrollment readiness is overclaimed. | High | Mark PR31 pending and keep invite/enrollment launch blocked unless already implemented in the candidate. | No-go for beta invite | No-go |
| R-019 | Release candidate | E2E smoke evidence is partial but final go is recorded. | High | Complete E2E matrix and final go/no-go checklist before invite. | No-go | No-go |
| R-020 | Test safety | Automated smoke helper bypasses mock guards or requires network/production secrets. | Critical | Keep smoke helper deterministic, no-network, mock/sandbox only, and fail on unsafe provider modes. | No-go | No-go |

## Risk review checklist

```text
[ ] Every high or critical risk has an owner
[ ] Every accepted beta risk has a written reason and expiry/revisit date
[ ] No critical production risk is treated as production-ready
[ ] Support and rollback owners know the beta scope
[ ] Known limitations are reflected in launch communication
```

## Escalation triggers

Escalate immediately to the human owner when:

- a secret or `.env` file is committed
- raw PII, payment payloads, card data, LINE user IDs, or birth data appear in logs/alerts/health output
- a payment entitlement changes without verified webhook processing
- real provider sends occur unintentionally
- production provider credentials are used in staging
- Swiss Ephemeris license or ephemeris file decisions are unclear
- users report deletion, unsubscribe, or deactivation not being honored
