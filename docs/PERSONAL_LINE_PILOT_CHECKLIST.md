# PERSONAL_LINE_PILOT_CHECKLIST.md - Personal LINE Pilot Checklist

## Execution summary

```text
Operator:
Date/time:
Branch/tag:
Environment: local / staging
Pilot mode: dry-run / tunnel webhook check / owner-only LINE OA
LINE OA: owner test channel only
Public beta enabled: no
Payment mode: mock/disabled
Scheduler mode: disabled/dry_run
Astro-calc service: local/staging
```

## Pre-flight

```text
[ ] `pnpm install` passed
[ ] `pnpm lint` passed
[ ] `pnpm typecheck` passed
[ ] `pnpm test` passed
[ ] astro pytest passed
[ ] astro ruff passed
[ ] astro mypy passed
[ ] `git diff --check` passed
[ ] No `.env` file committed
[ ] No production secrets committed
[ ] No LINE credentials copied into docs, screenshots, comments, or logs
[ ] No raw LINE user ID copied into notes
```

## Environment checks

```text
[ ] APP_ENV is local or staging
[ ] NEXT_PUBLIC_APP_BASE_URL points to local, staging, or approved tunnel host
[ ] ASTRO_CALC_SERVICE_URL points to the running astro-calc service
[ ] LINE_PROVIDER_MODE=sandbox unless owner-only real-send approval is recorded
[ ] ENABLE_REAL_LINE_SENDS=false unless owner-only real-send approval is recorded
[ ] ENABLE_PROVIDER_DRY_RUN=true unless owner-only real-send approval is recorded
[ ] REQUIRE_PROVIDER_ACTIVATION_APPROVAL is understood before any real-send test
[ ] NOTIFICATION_SCHEDULER_MODE is disabled or dry_run
[ ] PAYMENT_PROVIDER_MODE is mock or disabled
```

## Dry-run/mock test

```text
[ ] PR52 LINE beta pilot dry-run passes
[ ] Follow/welcome scenario passes
[ ] Rich Menu onboarding action maps to onboarding link
[ ] No birth profile returns onboarding prompt
[ ] Mock birth profile save is represented
[ ] Today horoscope response is safe
[ ] Weekly/monthly/yearly entitlement boundaries are represented
[ ] Notification settings link is present
[ ] Privacy/help and unknown command responses are safe
[ ] Unsubscribed/deactivated/deleted suppression scenarios pass
[ ] Report shows realLineApiCalls: 0
```

## Local tunnel webhook check

```text
[ ] Tunnel host is operator-controlled and temporary
[ ] Webhook URL ends with /api/line/webhook
[ ] LINE Developers webhook verification reaches the app
[ ] Invalid signature fails closed
[ ] Valid signature verifies
[ ] App logs do not expose raw LINE user ID or webhook payload
[ ] Tunnel URL is removed from LINE Developers after testing if not reused
```

## Owner-only LINE OA script

```text
[ ] Owner follows the LINE OA
[ ] Send: ดวงวันนี้
[ ] If no profile exists, onboarding link is shown
[ ] Open onboarding/profile route from LINE
[ ] Save birth profile
[ ] Open chart preview from saved page
[ ] Return to LINE
[ ] Send: ดวงวันนี้
[ ] Send: ดวงสัปดาห์
[ ] Send: ดวงเดือน
[ ] Send: ดวงปี
[ ] Send: ตั้งค่า
[ ] Send: ช่วยเหลือ
[ ] Confirm privacy/help routes are reachable
```

## Expected response checks

```text
[ ] Thai copy is calm and non-fear-based
[ ] Entertainment/self-reflection disclaimer appears where appropriate
[ ] No death, accident, illness, legal, investment, lottery, or guaranteed outcome claim
[ ] Unknown birth time warning appears if selected
[ ] No raw birth date/time/place appears in LINE messages
[ ] No email, payment ID, LINE user ID, secret, token, or internal audit ID appears
[ ] Monthly/yearly content respects current entitlement
[ ] Deleted/deactivated/unsubscribed users do not receive horoscope content
```

## Rich Menu manual check

```text
[ ] ดวงวันนี้ maps to message ดวงวันนี้
[ ] ดวงสัปดาห์ maps to message ดวงสัปดาห์
[ ] ดวงเดือน maps to message ดวงเดือน
[ ] กรอกข้อมูลเกิด opens /line/onboarding or LIFF line_route
[ ] ตั้งค่าแจ้งเตือน opens /line/settings or LIFF line_route
[ ] บัญชี / แพ็กเกจ maps to subscription/status intent
[ ] No Rich Menu upload is automated by tests or app startup
```

## Rollback record

```text
[ ] Disable webhook in LINE Developers console
[ ] Set LINE_PROVIDER_MODE=sandbox
[ ] Set ENABLE_REAL_LINE_SENDS=false
[ ] Set ENABLE_PROVIDER_DRY_RUN=true
[ ] Stop local tunnel
[ ] Stop web app
[ ] Stop astro-calc service
[ ] Revert/unlink manually published Rich Menu if used
[ ] Keep scheduler disabled or dry_run
[ ] Record sanitized blocker and next fix
```

## Decision

```text
Result: pass / blocked / needs fix
Blockers:
Risks accepted:
Owner-only scope preserved: yes / no
Public beta remains disabled: yes / no
Next action:
```
