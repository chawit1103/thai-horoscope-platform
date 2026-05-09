# LINE_RICH_MENU.md - Recommended LINE Rich Menu

## Purpose

The Rich Menu should make LINE the primary beta user entry point while linking complex forms back to the responsive web app or LIFF-compatible web pages.

This document is a configuration guide only. PR49 does not create a real Rich Menu through the LINE API.

## Recommended buttons

```text
วันนี้
สัปดาห์
เดือน
ปี
กรอกข้อมูลเกิด
ตั้งค่า
```

Recommended actions:

```text
วันนี้ -> message: ดวงวันนี้
สัปดาห์ -> message: ดวงสัปดาห์
เดือน -> message: ดวงเดือน
ปี -> message: ดวงปี
กรอกข้อมูลเกิด -> uri: /onboarding
ตั้งค่า -> uri: /settings/notifications
```

## Web and LIFF links

Use web or LIFF links for flows that need structured input:

```text
/onboarding
/account
/settings/notifications
/settings/privacy
/subscribe
```

Links must use the configured beta/staging base URL. Do not embed production secrets, tokens, raw LINE user IDs, payment IDs, or birth profile identifiers in Rich Menu URLs.

## Safety requirements

- Do not enable real LINE provider behavior by creating this template.
- Do not send push or reply messages during tests.
- Do not include horoscope promises or fear-based copy in menu labels.
- Keep menu copy short and calm.
- Document human approval before creating or changing a production Rich Menu.

## Local validation

The `buildLineRichMenuTemplate()` helper returns a template containing the recommended labels and actions. Tests validate the labels and links without calling the LINE API.

