# CODE_REVIEW.md — Review and Merge Policy

## Goal

Ensure agent-generated code is safe, scoped, testable, and suitable for production evolution.

## PR rules

Each PR must include:

- Clear title
- Summary of changes
- Scope boundaries
- Tests run
- Screenshots for UI changes where relevant
- Migration notes for schema changes
- Security/privacy notes for sensitive changes
- Known limitations

## Required PR checklist

```text
[ ] Scope matches assigned task
[ ] No unrelated refactor
[ ] No production secrets committed
[ ] No new dependency without explanation
[ ] Input validation added where needed
[ ] Tests added or updated
[ ] Docs updated if behavior/architecture changed
[ ] Lint passes
[ ] Typecheck passes
[ ] Tests pass
[ ] Migration reviewed if schema changed
[ ] Webhook signatures verified if webhook code changed
[ ] Payment changes are idempotent if payment code changed
[ ] Content safety considered if horoscope text changed
```

## Human approval required

Human approval is required before:

- Merge to main
- Production deploy
- Payment provider activation
- Secret changes
- License-sensitive ephemeris strategy
- Major schema migration
- Data retention/privacy behavior changes
- Sending real notifications to users

## Reviewer focus areas

### Architecture

- Does this keep business logic independent from delivery channels?
- Does this keep ephemeris calculation separate from interpretation?
- Does this avoid hidden coupling to LINE?

### Security

- Are secrets protected?
- Are webhooks verified?
- Are admin routes protected?
- Is sensitive user data minimized?

### Data model

- Are relationships clear?
- Are uniqueness constraints present where needed?
- Are status enums explicit?
- Are raw payloads stored safely?

### Payment

- Is webhook handling idempotent?
- Are out-of-order events considered?
- Is entitlement logic centralized?

### Notification

- Are delivery attempts recorded?
- Are blocked/bounced/unsubscribed states handled?
- Is fallback logic safe from duplicate sends?

### Astro calculation

- Is output deterministic?
- Is calculation profile included?
- Is ephemeris fingerprint included?
- Are unknown birth time warnings handled?

### Content safety

- Is disclaimer present?
- Are high-risk claims avoided?
- Are safety flags handled?

## Merge gate

A PR can be merged only when:

- CI is green
- Required reviewer approves
- Human approval exists for gated areas
- No unresolved critical security/privacy issues
- No unapproved production behavior

## Agent review output format

Reviewer must produce:

```text
Verdict: APPROVED | CHANGES_REQUESTED | BLOCKED
Summary:
Critical issues:
Major issues:
Minor issues:
Tests reviewed:
Files inspected:
Recommended next action:
```

## No-go examples

Reject PR if:

- It bypasses webhook verification.
- It commits secrets.
- It sends messages to real users in tests.
- It stores birth data without consent path.
- It changes payment status without idempotency.
- It calculates planets in the UI layer.
- It adds LINE MINI App scope.
- It merges unrelated refactors into feature work.
