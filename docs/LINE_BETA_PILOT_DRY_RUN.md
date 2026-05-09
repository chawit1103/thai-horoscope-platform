# LINE_BETA_PILOT_DRY_RUN.md - LINE Beta Pilot Dry Run

## Goal

Validate the LINE-first beta journey in mock/dry-run mode before any real LINE provider activation. This dry run exercises command routing, Rich Menu actions, LINE web onboarding, entitlement boundaries, suppression rules, and safe Thai copy without sending real LINE messages.

PR52 does not upload a Rich Menu, call the LINE Messaging API, add LINE secrets, activate real LINE sends, deploy, or change payment/astro calculation behavior.

## Automated dry-run proof

Run the normal web test suite:

```bash
pnpm test
```

The focused coverage is:

```text
apps/web/src/mvp/line-beta-pilot-dry-run.ts
apps/web/tests/line-beta-pilot-dry-run.test.ts
```

The helper simulates the pilot with:

```text
LINE_PROVIDER_MODE=sandbox
ENABLE_REAL_LINE_SENDS=false
ASTRO_CALC_SERVICE_URL=https://astro-calc.example.test
```

The astro-calc response is mocked in-process. Tests must not call the LINE API, push messages, reply messages, upload Rich Menu assets, send Email, call Payment, or require production secrets.

If a caller supplies real LINE mode, real-send flags, or LINE credentials to the dry-run helper, the helper fails closed with a blocked provider-guard step and still reports zero LINE API calls. Dry-run reports must not echo raw credential values or provider headers.

## Operator checklist

Before a manual LINE pilot rehearsal:

```text
[ ] Confirm this is local or staging dry-run mode
[ ] Confirm LINE_PROVIDER_MODE=sandbox or a separately approved staging/test mode
[ ] Confirm ENABLE_REAL_LINE_SENDS=false unless a human explicitly approved test sends
[ ] Confirm no LINE channel access token or channel secret is pasted into docs, logs, screenshots, or test notes
[ ] Confirm Rich Menu upload is manual/operator-controlled and not triggered by app startup or tests
[ ] Confirm beta testers know horoscope content is for entertainment and self-reflection
```

## Pilot scenarios

| Scenario | Simulated action | Expected dry-run result |
| --- | --- | --- |
| Follow/welcome | LINE follow event intent | Thai welcome text with safe available actions |
| Rich Menu onboarding | Tap `กรอกข้อมูลเกิด` | Safe `/line/onboarding` or LIFF `line_route` link |
| No birth profile | Send `ดวงวันนี้` before profile exists | Onboarding prompt, no horoscope preview |
| Save birth profile | Submit LINE web form | Mock profile is stored with consent and no raw LINE ID in output |
| Today horoscope | Send `ดวงวันนี้` after profile exists | Safe Flex-style horoscope preview from mocked live chart path |
| Weekly/monthly/yearly | Send period commands as free user | Entitlement limitation message where access is missing |
| Notification settings | Tap/send settings intent | Safe `/line/settings` or LIFF `line_route` link |
| Privacy/help | Send privacy/help or unknown command | Safe help/privacy guidance, no free-form prediction |
| Unsubscribed | Disable daily topic then request today | Suppressed response with no content |
| Deactivated/deleted | Account deletion/deactivation then request today | Suppressed response with no content |
| Deleted birth profile | Delete saved birth profile then request today | Onboarding prompt only, no horoscope content |

## Expected safety result

The dry-run report must show:

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

Responses and report output must not include raw LINE user IDs, exact birth date/time/place, latitude/longitude, email addresses, payment IDs, provider payloads, channel secrets, access tokens, authorization headers, or internal audit IDs.

## Known limitations

- The dry run uses mocked astro-calc service output to avoid external network calls.
- The dry run validates LINE reply payloads and Rich Menu routing, not the real LINE dashboard.
- Rich Menu image preparation and upload remain manual operator tasks.
- Real LINE provider activation requires separate human approval and provider guardrails.
- Payment and Email flows are intentionally out of scope except for ensuring they are not called.

## Rollback and containment

If the LINE pilot rehearsal finds a blocker:

```text
[ ] Keep or return LINE_PROVIDER_MODE=sandbox
[ ] Keep ENABLE_REAL_LINE_SENDS=false
[ ] Unlink or replace any manually published Rich Menu in the LINE dashboard if a human had approved one
[ ] Stop notification scheduler triggers/workers before relying on mode flags
[ ] Preserve sanitized test evidence and avoid raw LINE IDs or birth data
[ ] Record the blocker in the beta launch log and open a fix PR
```

Use [Rollback checklist](ROLLBACK_CHECKLIST.md), [LINE Rich Menu](LINE_RICH_MENU.md), and [LINE LIFF onboarding](LINE_LIFF_ONBOARDING.md) for the surrounding operator procedure.

For a one-person owner rehearsal after this dry run passes, use [Personal LINE pilot runbook](PERSONAL_LINE_PILOT_RUNBOOK.md), [Personal LINE pilot checklist](PERSONAL_LINE_PILOT_CHECKLIST.md), [LINE local tunnel setup](LINE_LOCAL_TUNNEL_SETUP.md), and [LINE pilot troubleshooting](LINE_PILOT_TROUBLESHOOTING.md). The personal pilot remains owner-only and must not enable public beta or real LINE sends without explicit human approval.
