# LINE_PILOT_TROUBLESHOOTING.md - Personal LINE Pilot Troubleshooting

## Webhook not receiving events

Check:

```text
[ ] Web app is running
[ ] Tunnel is running and points to the web app port
[ ] Webhook URL ends with /api/line/webhook
[ ] LINE Developers webhook use is enabled
[ ] Tunnel URL is HTTPS
[ ] Firewall/VPN is not blocking the tunnel
```

Do not paste raw webhook payloads into tickets. Record sanitized status only.

## Invalid signature

Likely causes:

```text
[ ] LINE_CHANNEL_SECRET is missing from local/staging runtime
[ ] Secret belongs to a different LINE channel
[ ] Request body was transformed before verification
[ ] Webhook URL points to the wrong app/environment
```

Fix by checking the LINE Developers channel and runtime secret store. Do not commit or screenshot the secret.

## Wrong LIFF URL or onboarding link

Check:

```text
[ ] LINE_LIFF_URL is HTTPS if configured
[ ] NEXT_PUBLIC_APP_BASE_URL matches the local/staging/tunnel host
[ ] line_route points only to /line/onboarding, /line/profile, or /line/settings
[ ] Rich Menu template links were rebuilt after changing base URLs
```

If LIFF is not configured, local/dev links should fall back to the web route.

## ASTRO_CALC_SERVICE_URL missing

Symptoms:

```text
Chart preview or live horoscope source is unavailable.
```

Fix:

```bash
cd services/astro-calc
python3 -m uvicorn app.main:app --reload --port 8000
```

Then set:

```text
ASTRO_CALC_SERVICE_URL=http://localhost:8000
```

Do not switch to mock output without a visible diagnostic label.

## Astro-calc service down

Check:

```text
[ ] http://localhost:8000/health responds locally
[ ] Web app environment points to the same host/port
[ ] No ephemeris guard error is blocking the selected engine
[ ] Local/mock mode remains safe if swisseph is not configured
```

For owner validation, use chart preview to inspect UTC, ayanamsa, zodiac type, warnings, calculation hash, and planet table metadata.

## LINE access token missing

Inbound webhook signature checks do not require `LINE_CHANNEL_ACCESS_TOKEN`.

Real reply or push calls require explicit owner approval and all guardrails:

```text
LINE_PROVIDER_MODE=http
LINE_CHANNEL_SECRET=<set outside repo>
LINE_CHANNEL_ACCESS_TOKEN=<set outside repo>
LINE_AUDIT_HASH_SECRET=<set outside repo>
ENABLE_REAL_LINE_SENDS=true
REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true
ENABLE_PROVIDER_DRY_RUN=false
```

If these are not approved, keep `LINE_PROVIDER_MODE=sandbox` and use dry-run or webhook connectivity checks only.

## Real send disabled by guardrail

This is expected unless a human explicitly approved owner-only real-send testing.

Check:

```text
[ ] ENABLE_REAL_LINE_SENDS=true only after approval
[ ] REQUIRE_PROVIDER_ACTIVATION_APPROVAL=true only after approval
[ ] ENABLE_PROVIDER_DRY_RUN=false only after dry-run proof
[ ] Provider readiness output is sanitized
[ ] Scheduler is disabled or dry_run unless explicitly approved
```

Do not bypass provider guardrails to make a personal pilot work.

## Rich Menu button goes to the wrong place

Check:

```text
[ ] Menu was generated from apps/web/src/mvp/line-rich-menu.ts
[ ] Local operator JSON does not contain stale URLs
[ ] Onboarding button points to /line/onboarding or LIFF line_route
[ ] Settings button points to /line/settings or LIFF line_route
[ ] Message labels match command router phrases
```

Rollback by unlinking or replacing the menu manually in the LINE dashboard.

## Owner sees unsafe or overconfident copy

Block the pilot if copy:

```text
[ ] predicts death, accidents, serious illness, or unavoidable harm
[ ] gives medical, legal, investment, or lottery instructions
[ ] guarantees an outcome
[ ] uses fear-based urgency
[ ] exposes raw birth data, LINE user IDs, email, payment IDs, secrets, or audit IDs
```

Open a fix PR with sanitized screenshots or text snippets only.

## Emergency rollback

```text
[ ] Disable webhook in LINE Developers console
[ ] Set LINE_PROVIDER_MODE=sandbox
[ ] Set ENABLE_REAL_LINE_SENDS=false
[ ] Set ENABLE_PROVIDER_DRY_RUN=true
[ ] Stop tunnel
[ ] Stop web app
[ ] Stop astro-calc service
[ ] Revert or unlink Rich Menu
[ ] Record sanitized blocker and owner decision
```
