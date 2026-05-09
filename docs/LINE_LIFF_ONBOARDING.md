# LINE_LIFF_ONBOARDING.md - LINE-accessible onboarding web forms

## Purpose

LINE users should not have to enter birth profile data through chat. PR50 adds LINE-accessible web routes for structured onboarding and profile updates:

```text
/line/onboarding
/line/profile
/line/settings
/line/onboarding/saved
```

These routes are normal responsive web pages that can be opened from LINE Rich Menu or LINE messages. They are not a LINE MINI App.

## User flow

1. User taps "กรอกข้อมูลเกิด" from LINE or the Rich Menu.
2. The user opens `/line/onboarding` in the LINE webview or browser.
3. The form collects birth date, birth time, unknown birth time flag, timezone, city/location, and optional latitude/longitude.
4. Server actions validate and save the current session user's birth profile.
5. The user lands on `/line/onboarding/saved`.
6. The saved page links to `/chart-preview?mode=user` and tells the user to return to LINE.

## Configuration

Optional environment variables:

```text
LINE_LIFF_ID=
LINE_LIFF_URL=
NEXT_PUBLIC_APP_BASE_URL=http://localhost:3000
```

Local/dev behavior:

- If `LINE_LIFF_URL` is not configured, LINE command links use the local web route under `NEXT_PUBLIC_APP_BASE_URL` or the provided fallback base URL.
- If `LINE_LIFF_URL` is configured, it must be HTTPS. Links preserve the full LIFF app URL, such as `https://liff.line.me/{liffId}`, and pass the requested web form path in a safe `line_route` query parameter.
- Non-local web base URLs must also be HTTPS. Plain HTTP is only accepted for local development hosts such as `http://localhost:3000`.
- If the LIFF app reads `line_route`, it should route only to the allowlisted paths documented above.
- `LINE_LIFF_ID` is optional until real LIFF activation.

PR50 does not create a real LIFF app through LINE APIs and does not activate real LINE sends.

## Privacy and session rules

- Do not put raw LINE user IDs in query strings.
- Do not trust client-provided role, admin, user, or session fields.
- Use existing session cookies to bind the saved birth profile.
- Server actions must validate date, time, timezone, city/location, consent, and optional coordinates.
- Rendered pages must not expose payment IDs, provider payloads, secrets, internal audit IDs, or raw LINE identifiers.

## Unknown birth time

If the user selects "ไม่ทราบเวลาเกิด", the UI shows that ascendant, houses, and timing-sensitive values are approximate or unreliable. Downstream chart preview and horoscope content must keep this warning visible and avoid overconfident house/ascendant claims.

## Rich Menu integration

Recommended Rich Menu links:

```text
กรอกข้อมูลเกิด -> /line/onboarding
ตั้งค่าแจ้งเตือน -> /line/settings
```

Profile edit links from LINE messages should use:

```text
/line/profile
```

The PR51 Rich Menu template builds these links through the same safe URL helper as LINE command replies. If `LINE_LIFF_URL` is configured, the Rich Menu uses the HTTPS LIFF URL plus the allowlisted `line_route` query parameter. Rich Menu creation and upload remain manual operator actions.

## Test guarantee

Tests use local helpers and mocked astro-calc responses. They must not send real LINE messages or call the LINE Messaging API.
