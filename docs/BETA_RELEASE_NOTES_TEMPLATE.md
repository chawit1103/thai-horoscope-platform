# BETA_RELEASE_NOTES_TEMPLATE.md - Beta Release Notes Template

## Header

```text
Beta release:
RC version:
Release date:
Commit:
Environment:
Release owner:
Support owner:
Rollback owner:
Decision: pending / go / no-go
```

## Summary

State what changed in user-facing terms. Keep wording clear that horoscope content is for entertainment, lifestyle guidance, and self-reflection.

## Included scope

```text
[ ] Web onboarding
[ ] Birth profile creation and unknown birth time warning
[ ] Daily/weekly/monthly/yearly horoscope access
[ ] Content safety and admin approval
[ ] Subscription entitlement foundation
[ ] Notification preference and dry-run scheduling
[ ] Email sandbox/mock path
[ ] LINE sandbox/mock path
[ ] Payment mock/webhook foundation
[ ] Privacy export/delete/deactivation
[ ] Operator console, monitoring, rollback, and go/no-go evidence
```

## Excluded scope

```text
[ ] Production provider activation
[ ] Real payment launch
[ ] Real LINE or Email campaigns
[ ] Production Swiss Ephemeris use
[ ] Telegram or Microsoft Teams delivery
[ ] LINE MINI App functionality
```

## Provider modes

```text
Email:
LINE:
Payment:
Notification scheduler:
Astro engine:
Alert provider:
```

## Pending dependencies

```text
PR29 real provider activation guardrails: merged / pending / not applicable
PR31 beta launch content and invite management: merged / pending / not applicable
Notes:
```

If PR29 is pending, real provider activation remains pending and must not be described as ready. If PR31 is pending, beta invite/enrollment readiness remains pending unless the branch already includes approved implementation.

## Known limitations

- Mock or sandbox modes validate flows, not production provider readiness.
- Mock astro output must not be described as production-approved astrology.
- Swiss Ephemeris production use remains blocked until the human license and ephemeris manifest decision is recorded.
- Payment durability and provider-specific activation remain human-gated.
- Beta support and rollback owners must be named before inviting users.

## Validation evidence

```text
pnpm install:
pnpm lint:
pnpm typecheck:
pnpm test:
python3 -m pytest:
python3 -m ruff check .:
python3 -m mypy .:
git diff --check:
pnpm beta:dry-run:
Manual smoke matrix:
```

## Rollback note

Use `docs/ROLLBACK_CHECKLIST.md`. Record the rollback target, owner, provider modes, user impact, and communication path before beta invite.

## Support and feedback note

```text
Support channel:
Feedback channel:
Escalation owner:
Privacy/payment/deletion escalation:
```

Do not include raw birth data, full email addresses, raw LINE user IDs, provider payloads, tokens, secrets, or payment details in release notes.
