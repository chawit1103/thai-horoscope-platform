# PERSONAL_LINE_PILOT_RUNBOOK.md - Personal LINE Pilot Runbook

## Goal

Run a one-person LINE pilot for the project owner before inviting beta users. This runbook validates the owner journey, webhook connectivity, LINE web onboarding, chart preview, horoscope commands, entitlement boundaries, settings, privacy, and help copy.

This is not a public beta launch. It must not enable real LINE sends by default, add LINE credentials to the repository, deploy production, charge users, or change astro calculation behavior.

## Pilot modes

Use the modes in this order:

| Mode | Purpose | Real LINE API calls | Who can run it |
| --- | --- | --- | --- |
| Dry-run/mock | Validate command routing, Rich Menu actions, onboarding links, entitlement limits, suppression, and safe copy | none | any developer/operator |
| Local tunnel webhook check | Confirm LINE Developers can reach the local or staging webhook and signatures verify | inbound webhook only | project owner |
| Owner-only LINE OA pilot | Send real owner account messages to the approved test LINE OA | only after explicit approval | project owner only |

Do not skip directly to owner-only LINE OA testing. A clean dry run and a clean tunnel/webhook check should be recorded first.

## Prerequisites

Required local services:

```bash
cd services/astro-calc
python3 -m uvicorn app.main:app --reload --port 8000
```

```bash
pnpm install
pnpm dev
```

Required local/staging environment placeholders:

```text
APP_ENV=local
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
ASTRO_CALC_SERVICE_URL=http://localhost:8000
LINE_PROVIDER_MODE=sandbox
ENABLE_REAL_LINE_SENDS=false
ENABLE_PROVIDER_DRY_RUN=true
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=false
LINE_LIFF_URL=
LINE_LIFF_ID=
```

For a webhook connectivity check with a real LINE Developers channel, configure secrets only in `.env.local` or the deployment platform. Never commit them:

```text
LINE_CHANNEL_SECRET=<set outside repo>
LINE_CHANNEL_ACCESS_TOKEN=<set outside repo only if an approved owner-only reply test needs it>
LINE_AUDIT_HASH_SECRET=<set outside repo>
```

## Dry-run proof

Run:

```bash
pnpm test
```

The PR52 dry-run helper should report:

```text
mode: mock_dry_run
providerMode: sandbox
realLineApiCalls: 0
blockedRealLineConfig: false
containsRawLineIdentifier: false
containsRawBirthData: false
containsSecrets: false
result: pass
```

If the dry-run helper sees real LINE mode, real-send flags, or LINE credentials, it must fail closed. Do not override this for a personal pilot.

## Local tunnel webhook check

Follow [LINE local tunnel setup](LINE_LOCAL_TUNNEL_SETUP.md). The approved LINE webhook URL format is:

```text
https://<operator-owned-tunnel-or-staging-host>/api/line/webhook
```

Use the LINE Developers console to set the webhook URL manually. Do not add tunnel URLs, channel secrets, access tokens, raw webhook payloads, or owner LINE identifiers to docs or commits.

Expected webhook check:

```text
[ ] LINE Developers webhook verification reaches the app
[ ] Invalid signature receives 401
[ ] Valid signature receives ok response
[ ] Logs contain sanitized event counts or hashes only
[ ] No raw LINE user ID is copied into notes
```

The current webhook endpoint verifies and normalizes inbound events. It is safe for connectivity checks. Owner-visible reply/push behavior still requires explicit real LINE activation approval.

## Owner-only LINE OA pilot

Only after dry-run and webhook checks pass:

```text
[ ] Confirm only the project owner is following or testing the LINE OA
[ ] Confirm this is not announced to beta users
[ ] Confirm LINE_PROVIDER_MODE remains sandbox unless explicit owner-only real-send approval is recorded
[ ] Confirm ENABLE_REAL_LINE_SENDS=false unless explicit owner-only real-send approval is recorded
[ ] Confirm scheduler is disabled or dry_run
[ ] Confirm payment provider remains mock/disabled
[ ] Confirm no production secrets are committed
```

One-person script:

```text
1. Start astro-calc service.
2. Start the web app.
3. Configure ASTRO_CALC_SERVICE_URL for the web app.
4. Configure a local tunnel or staging URL for the webhook and LINE web/LIFF forms.
5. In LINE Developers, set webhook URL to /api/line/webhook.
6. Follow the LINE OA with the owner account.
7. Send: ดวงวันนี้
8. If no profile exists, confirm the onboarding link is returned or available from Rich Menu.
9. Open /line/onboarding or the LIFF route and save a birth profile.
10. Open /chart-preview?mode=user and verify UTC, ayanamsa, planets, warnings, and metadata.
11. Return to LINE and send: ดวงวันนี้
12. Send: ดวงสัปดาห์
13. Send: ดวงเดือน
14. Send: ดวงปี
15. Send or tap: ตั้งค่า
16. Send: ช่วยเหลือ
17. Confirm monthly/yearly entitlement limits behave as expected.
18. Confirm all copy is calm, Thai, and framed as entertainment/self-reflection.
```

Expected owner-visible behavior:

```text
[ ] Welcome/help copy is Thai and safe
[ ] Onboarding link opens the web form or LIFF route
[ ] Saved page links to chart preview
[ ] Today horoscope does not expose raw birth data or LINE IDs
[ ] Weekly/monthly/yearly explain entitlement limits when access is missing
[ ] Unknown birth time warning remains visible if selected
[ ] Privacy/help settings are reachable
```

## Rollback

If anything looks unsafe:

```text
[ ] Disable webhook in LINE Developers console
[ ] Set LINE_PROVIDER_MODE=sandbox
[ ] Set ENABLE_REAL_LINE_SENDS=false
[ ] Set ENABLE_PROVIDER_DRY_RUN=true
[ ] Stop local tunnel
[ ] Stop web app
[ ] Stop astro-calc service
[ ] Revert or unlink any manually published Rich Menu
[ ] Keep scheduler disabled or dry_run
[ ] Preserve sanitized evidence only
```

Do not paste raw LINE user IDs, channel secrets, access tokens, exact birth data, webhook payloads, payment identifiers, or provider headers into issue comments.

## Handoff evidence

Record the personal pilot with:

```text
Operator:
Date/time:
Mode: dry-run / local tunnel webhook check / owner-only LINE OA pilot
App URL:
Webhook URL host only:
Astro-calc URL host only:
LINE provider mode:
Real send flag:
Scheduler mode:
Commands tested:
Result:
Blockers:
Rollback owner:
Next action:
```

Use [Personal LINE pilot checklist](PERSONAL_LINE_PILOT_CHECKLIST.md) for a copyable execution record.
