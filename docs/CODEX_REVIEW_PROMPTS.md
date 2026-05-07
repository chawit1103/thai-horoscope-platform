# Codex Review Prompts

Use these in GitHub Pull Request comments.

## Generic critical review

```text
@codex review HEAD of this pull request branch.

Review for security regressions, privacy leaks, idempotency bugs, entitlement bypasses, accidental real provider calls in tests, PII logging, missing tests, and scope creep.
```

## Auth/Admin

```text
@codex review for admin authorization bypasses, server action auth gaps, insecure cookie/session handling, caller-controlled roles, missing audit logs, PII logging, accidental secrets, and missing tests.
```

## Privacy/Delete/Export

```text
@codex review for privacy leaks, cross-user data export bugs, incomplete deletion, notification after deletion, PII logging, consent tracking gaps, accidental secrets, missing tests, and scope creep.
```

## Email Gateway

```text
@codex review for accidental real email sends, unsubscribe gaps, bounce/complaint handling, webhook verification fail-open paths, email verification bypasses, token expiry bugs, PII logging, secret handling, missing tests, privacy risks, and scope creep.
```

## LINE Gateway

```text
@codex review for LINE webhook signature verification, retry-key/idempotency bugs, secret handling, LINE userId privacy, blocked/unfollow handling, duplicate-send risks, accidental real sends in tests, missing tests, and scope creep.
```

## Subscription Lifecycle

```text
@codex review for subscription entitlement bypass, webhook idempotency bugs, invalid lifecycle transitions, stale/out-of-order webhook handling, canceled/expired state bugs, past_due ambiguity, audit log gaps, accidental real payment/email calls, PII logging, missing tests, and scope creep.
```

## Payment Provider

```text
@codex review for payment webhook signature bypass, client-side payment trust, stored checkout binding gaps, webhook idempotency bugs, entitlement bypass, card data storage, raw payment payload logging, duplicate receipt hooks, accidental real payment/email calls in tests, missing tests, audit log gaps, and scope creep.
```

## Notification Scheduler

```text
@codex review for duplicate notification sends, entitlement bypass, notification after deletion/deactivation, source artifact identity bugs, unsubscribe bypass, quiet-hours bugs, timezone bugs, fallback channel bugs, accidental real LINE/email sends in tests, PII logging, missing tests, and scope creep.
```

## Astro Calculation Engine

```text
@codex review for ephemeris license guard failures, production swisseph enablement without professional license mode, hidden runtime ephemeris downloads, large binary artifacts, calculation_hash instability, missing ayanamsa metadata, missing engine/profile metadata, unknown birth-time overconfidence, incorrect house/ascendant reliability, transit-to-natal aspect bugs, solar return convergence issues, hourly timing duplicate windows, PII logging, missing golden tests, and scope creep.
```

## Review after fix

```text
@codex review HEAD of this pull request branch.

Verify that the previous P1/P2 findings are fully fixed and that the fix did not introduce adjacent regressions. Also check for accidental secrets, PII logging, real provider calls in tests, missing tests, and scope creep.
```
