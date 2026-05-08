# BETA_INVITE_MANAGEMENT.md - Beta Invite Management

## Goal

Define a mock-safe invite and allowlist foundation for controlled beta access.
This does not activate real identity, Email, LINE, or payment providers.

The implementation lives in:

```text
apps/web/src/mvp/beta-launch.ts
apps/web/src/mvp/admin-auth.ts
apps/web/app/admin/beta/page.tsx
apps/web/tests/beta-launch.test.ts
```

## Invite policy

Supported invite shapes:

- invite code
- allowlisted email
- allowlisted mock user ID
- beta enrollment status

Invite codes and allowlisted emails are hashed before storage in a shared
mock beta invite scope. User enrollments remain scoped to the user's mock
session so invite records can be created by an operator and redeemed from a
different tester browser/session. The admin page lists invite IDs, kind, status,
and timestamps only. It must not display raw invite codes or raw email
addresses.

Email allowlists are a policy foundation only until a verified session email is
available. The public beta page does not accept a typed email as proof of
identity; email-based enrollment must be called only from a trusted flow that
has already verified the email address.

The helper is local/mock-safe and does not send real invite emails or LINE
messages.

## Enrollment states

```text
not_invited
invited
enrolled
waitlisted
revoked
disabled
```

State behavior:

- `not_invited`: no beta-only access
- `invited`: allowlisted for beta-only entry
- `enrolled`: accepted invite and beta-only entry allowed
- `waitlisted`: no beta-only access
- `revoked`: no beta-only access
- `disabled`: no beta-only access, used when account deletion/deactivation applies

## Access rules

Beta users can access:

- `/beta` landing content
- beta-only onboarding entry when invited or enrolled
- invite-code redemption through the beta page
- allowlisted-email redemption only from a trusted verified-email flow
- content previews that are otherwise allowed by subscription entitlement
- privacy/export/delete/unsubscribe controls
- notification preference controls

Beta users cannot access:

- premium subscription content without an active entitlement
- deleted or deactivated account flows
- suppressed notification delivery after unsubscribe
- raw invite secrets, raw provider IDs, raw LINE IDs, raw payment IDs, webhook payloads, or calculation hashes
- real provider sends or real payments

## Admin/operator controls

`/admin/beta` is protected by the existing signed admin session. Server actions
call `createBetaInviteWithAdminCookie(...)` and
`revokeBetaInviteWithAdminCookie(...)`, which validate admin auth server-side
before mutating invite state.

Admin audit metadata records sanitized invite kind and status only. It does not
record raw invite codes or raw email addresses.

## Pause beta enrollment

This release does not include a global beta-enrollment pause flag. To pause new
enrollment with the current implementation, an operator must:

1. Stop creating new invite codes.
2. Revoke every unredeemed shared invite code.
3. Revoke or remove every allowlisted email or mock user entry that can still
   enroll.
4. Confirm launch/support communications no longer expose an active invite code.
5. Verify a previously valid but revoked invite code is rejected with a
   sanitized error.
6. Keep already enrolled users governed by normal entitlement, deletion,
   deactivation, unsubscribe, and privacy controls.

Shared invite-code caveat: an active shared invite code that has already been
redeemed cannot be used as a safe pause switch in this release. Revoking the
shared code can remove existing linked users' beta access, while leaving it
active can allow new enrollments from anyone with the code. If any active shared
invite code has prior redemptions, or if operators cannot prove that it has no
prior redemptions, beta launch is no-go until a separate PR adds a real global
enrollment pause or a per-user migration path.

If operators require a one-step global pause switch, the beta launch is no-go
until that switch is implemented and tested in a separate PR.

## Safety boundaries

- Valid invite code can enroll a mock beta user.
- Invalid invite code returns a sanitized error.
- Revoked and waitlisted users cannot enter beta-only flows.
- Beta enrollment must not bypass subscription entitlement.
- Beta enrollment must not bypass privacy deletion, account deletion, or unsubscribe controls.
- Tests must not call real Email, LINE, payment, webhook, or provider APIs.

## Real provider activation

No real Email, LINE, or payment provider activation is part of this PR. If a
future beta launch needs PR29 provider guardrails, treat that as pending and do
not assume implementation details here.

## Feedback collection

Collect feedback about:

- onboarding clarity
- beta limitation clarity
- horoscope usefulness
- notification preferences
- privacy/export/delete clarity
- support response quality

Do not collect raw secrets, full invite codes, full birth data, payment payloads,
provider payloads, raw LINE user IDs, or full email addresses in public tickets.
