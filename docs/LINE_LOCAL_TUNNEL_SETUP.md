# LINE_LOCAL_TUNNEL_SETUP.md - LINE Local Tunnel Setup

## Purpose

Use a temporary public HTTPS tunnel only when the project owner needs LINE Developers to reach a local web app for webhook connectivity testing or a one-person LINE pilot.

Do not use a tunnel to launch public beta. Do not put secrets, raw LINE user IDs, exact birth data, or webhook payloads in tunnel logs, screenshots, issue comments, or docs.

## Required local services

Run astro-calc:

```bash
cd services/astro-calc
python3 -m uvicorn app.main:app --reload --port 8000
```

Run the web app:

```bash
pnpm install
pnpm dev
```

Use local-safe web environment values:

```text
APP_ENV=local
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
ASTRO_CALC_SERVICE_URL=http://localhost:8000
LINE_PROVIDER_MODE=sandbox
ENABLE_REAL_LINE_SENDS=false
ENABLE_PROVIDER_DRY_RUN=true
NOTIFICATION_SCHEDULER_MODE=disabled
PAYMENT_PROVIDER_MODE=mock
```

For webhook signature verification, the local runtime needs LINE secrets in `.env.local` only:

```text
LINE_CHANNEL_SECRET=<set outside repo>
LINE_AUDIT_HASH_SECRET=<set outside repo>
```

`LINE_CHANNEL_ACCESS_TOKEN` is not needed for inbound webhook signature verification. Add it only for an explicitly approved owner-only real-send test.

## Tunnel setup

Use an operator-controlled HTTPS tunnel. The repository does not require a specific tunnel vendor.

```text
Local app target: http://localhost:3000
Public tunnel URL: https://<temporary-owner-controlled-host>
Webhook URL: https://<temporary-owner-controlled-host>/api/line/webhook
```

Safety checks:

```text
[ ] Tunnel URL uses HTTPS
[ ] Tunnel points only to the local web app port
[ ] Tunnel dashboard/logs are private to the owner
[ ] Tunnel URL is not committed
[ ] No request body logging is enabled beyond sanitized status
[ ] Webhook URL host is removed from LINE Developers after testing if temporary
```

## LINE Developers console

Manual steps:

```text
1. Open the test LINE Messaging API channel.
2. Confirm this channel is for the owner-only pilot.
3. Set webhook URL to https://<temporary-owner-controlled-host>/api/line/webhook.
4. Enable webhook use.
5. Use the LINE Developers verify button.
6. Confirm the app responds without exposing raw event payloads.
```

Never paste `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, or raw webhook bodies into this repository.

## LIFF/web form URL

For a local tunnel owner test, use one of:

```text
NEXT_PUBLIC_APP_BASE_URL=https://<temporary-owner-controlled-host>
LINE_LIFF_URL=
```

or, if a LIFF app has already been manually created:

```text
NEXT_PUBLIC_APP_BASE_URL=https://<temporary-owner-controlled-host>
LINE_LIFF_URL=https://liff.line.me/<liff-id>
LINE_LIFF_ID=<liff-id>
```

The LIFF app should route only to allowlisted paths such as `/line/onboarding`, `/line/profile`, and `/line/settings` through `line_route`.

## Verification

Expected behavior:

```text
[ ] LINE Developers webhook verification reaches /api/line/webhook
[ ] Missing or invalid signature returns 401
[ ] Valid signed event returns ok response
[ ] Event count or sanitized metadata can be observed
[ ] No raw LINE user ID appears in logs or copied notes
[ ] No real push/reply call is made unless separately approved
```

If the webhook receives events but the owner does not see a chat reply, check whether real reply/push behavior has been explicitly approved and wired for this environment. Webhook signature verification alone does not require enabling real sends.

## Shutdown

```text
[ ] Disable or clear webhook URL if the tunnel was temporary
[ ] Stop the tunnel
[ ] Stop the web app
[ ] Stop astro-calc
[ ] Return LINE_PROVIDER_MODE=sandbox
[ ] Return ENABLE_REAL_LINE_SENDS=false
[ ] Preserve only sanitized notes
```
