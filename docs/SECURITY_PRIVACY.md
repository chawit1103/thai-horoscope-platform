# SECURITY_PRIVACY.md — Security, Privacy, and Compliance

## Data sensitivity

This platform stores sensitive personal context:

- Birth date
- Birth time
- Birth place
- Timezone/location
- LINE user ID or other channel identifiers
- Email address
- Payment/subscription metadata

Treat birth data as sensitive personal data for product and security purposes, even if legal classification varies by jurisdiction.

## Privacy principles

- Collect only what is needed.
- Explain why birth data is collected.
- Ask explicit consent for birth data usage.
- Separate marketing consent from service notification consent.
- Allow users to delete birth profile data.
- Do not sell or share birth data with third parties for unrelated marketing.

## Required user controls

Users must be able to:

- View their profile data
- Edit birth profile
- Delete birth profile
- Delete account or request deletion
- Disable notifications by topic
- Change delivery channel
- Unsubscribe from marketing

## Consent types

Recommended:

```text
terms
privacy
birth_data
service_notification
marketing_notification
payment_terms
```

Each consent record should store:

```text
version
accepted/revoked
accepted_at
revoked_at
source
```

## Secrets

Never commit:

- LINE channel secret
- LINE channel access token
- Email provider API key
- Payment provider secret
- Database URL
- JWT/session secret
- Astro service internal token

Use `.env.example` only for placeholder names.

## Webhook security

Required:

- Verify LINE webhook signatures.
- Verify payment webhook signatures.
- Verify email provider webhook signatures if available.
- Store raw payloads carefully.
- Do not log secrets or full payment credentials.
- Use idempotency keys for webhooks.

## Authentication

Initial MVP options:

- LINE profile sync when opened from LINE
- Email magic link or passwordless login
- Session cookies with secure settings

Requirements:

- Secure cookies in production
- CSRF protection where relevant
- Rate limit sensitive endpoints
- Do not trust client-supplied user IDs

## Authorization

Use role-based checks:

```text
user
admin
super_admin
system
```

Admin actions must be audited.

Current MVP admin access:

- `/admin` must only render for a server-verified session carrying `role=admin`.
- Admin sessions are signed with `ADMIN_SESSION_SECRET` and stored in an HttpOnly, SameSite=Lax cookie.
- The mock admin token is checked against `MOCK_ADMIN_TOKEN` on the server only; it must never be rendered into HTML or hidden inputs.
- Mock admin sign-in is development-only and must fail closed in production.
- Production must configure `ADMIN_SESSION_SECRET`; missing or invalid sessions fail closed.
- Do not authorize production admins from a hardcoded email address.

## Audit logs

Audit these events:

- consent accepted/revoked
- birth profile created/updated/deleted
- subscription status changes
- payment webhook received
- admin approval/rejection of content
- notification resend
- account deletion
- calculation profile changes

Audit log metadata must not include direct PII, birth date/time/place, email, phone, horoscope body text, or derived birth-data hashes.

## Data retention

Define retention policy before production.

Recommended:

- Birth profile: retained while account active, deleted on user request
- Chart snapshots: delete or anonymize when birth profile/account deleted unless legally retained
- Payment records: retain according to accounting/legal requirements
- Delivery attempts: retain limited duration, e.g. 6–12 months
- Audit logs: retain but avoid storing sensitive payloads

## Threat model

Key threats:

- Account takeover
- Webhook spoofing
- Unauthorized admin access
- Exposure of birth data
- Notification sent to wrong user/channel
- Duplicate payment processing
- Unsafe horoscope content causing harm
- Agent accidentally commits secrets

## Agent security rules

Agents must not:

- access production secrets
- deploy production
- disable tests
- bypass webhook verification
- add public unauthenticated admin endpoints
- log raw sensitive data unnecessarily

## Production readiness checklist

- Privacy Policy published
- Terms of Service published
- Data deletion path implemented
- Webhook signature verification implemented
- Secrets managed outside repo
- Admin routes protected
- Payment webhook idempotent
- Delivery attempts audited
- Content safety review flow implemented
- Backups configured
- Staging tested
