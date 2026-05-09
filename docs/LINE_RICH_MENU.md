# LINE_RICH_MENU.md - Recommended LINE Rich Menu

## Purpose

The Rich Menu should make LINE the primary beta user entry point while linking complex forms back to the responsive web app or LIFF-compatible web pages.

This document is a configuration guide only. PR51 adds local-safe Rich Menu templates and tests, but it does not create, upload, link, or publish a real Rich Menu through the LINE API.

## Recommended buttons

```text
ดวงวันนี้
ดวงสัปดาห์
ดวงเดือน
กรอกข้อมูลเกิด
ตั้งค่าแจ้งเตือน
บัญชี / แพ็กเกจ
```

Recommended actions:

```text
ดวงวันนี้ -> message: ดวงวันนี้
ดวงสัปดาห์ -> message: ดวงสัปดาห์
ดวงเดือน -> message: ดวงเดือน
กรอกข้อมูลเกิด -> uri: /line/onboarding
ตั้งค่าแจ้งเตือน -> uri: /line/settings
บัญชี / แพ็กเกจ -> message: แพ็กเกจของฉัน
```

The message actions intentionally reuse LINE command-router phrases so Rich Menu taps follow the same intent mapping as typed commands.

## Local template files

PR51 provides:

```text
apps/web/src/mvp/line-rich-menu.ts
config/line/rich-menu.beta.json
```

`line-rich-menu.ts` builds a runtime-safe template with final web or LIFF URLs. `config/line/rich-menu.beta.json` is an operator-facing reference template only; it must not contain credentials, raw LINE user IDs, payment IDs, birth profile IDs, or production secrets.

## Web and LIFF links

Use web or LIFF links for flows that need structured input:

```text
/line/onboarding
/line/profile
/line/settings
/account
/settings/notifications
/settings/privacy
/subscribe
```

Links must use the configured beta/staging base URL. Do not embed production secrets, tokens, raw LINE user IDs, payment IDs, or birth profile identifiers in Rich Menu URLs.

## Safety requirements

- Do not enable real LINE provider behavior by creating this template.
- Do not send push or reply messages during tests.
- Do not upload Rich Menu JSON or images automatically from app startup, CI, or tests.
- Do not include horoscope promises or fear-based copy in menu labels.
- Keep menu copy short and calm.
- Document human approval before creating or changing a production Rich Menu.

## Local validation

The `buildLineRichMenuTemplate()` helper returns a template containing the recommended labels, actions, and LINE API-shaped area configuration. Tests validate the labels and links without calling the LINE API.

When `LINE_LIFF_URL` is configured, Rich Menu links should preserve the full HTTPS LIFF app URL and pass `/line/*` targets through the allowlisted `line_route` query parameter. Without LIFF config, local/dev Rich Menu links can point to the regular web app base URL; non-local HTTP URLs should be treated as invalid.

## Manual operator upload outline

After human approval for real LINE configuration:

```text
1. Build or export the Rich Menu JSON from the tested template.
2. Prepare a matching image asset outside the repository or as an approved non-secret design artifact.
3. Use the LINE Official Account Manager or a manual operator script with least-privilege credentials.
4. Verify buttons in staging before publishing to beta users.
5. Record the operator, timestamp, menu ID, and rollback menu ID in the launch log.
```

Rollback is manual: unlink or replace the Rich Menu in the LINE dashboard, then restore the previous approved menu. Tests and local templates must never perform this operation automatically.

## Pilot dry run

PR52 validates Rich Menu behavior through the LINE beta pilot dry-run helper. The dry run checks that:

```text
ดวงวันนี้ -> today intent
ดวงสัปดาห์ -> weekly intent
ดวงเดือน -> monthly intent
กรอกข้อมูลเกิด -> onboarding link
ตั้งค่าแจ้งเตือน -> settings link
บัญชี / แพ็กเกจ -> subscription intent
```

The dry run must keep LINE API calls at zero and must not expose raw LINE user IDs, birth data, tokens, payment identifiers, or provider payloads. See [LINE beta pilot dry run](LINE_BETA_PILOT_DRY_RUN.md).
