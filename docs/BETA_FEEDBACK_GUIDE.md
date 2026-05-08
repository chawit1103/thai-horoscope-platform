# BETA_FEEDBACK_GUIDE.md - Beta Feedback Guide

## Goal

Guide beta users and support operators to collect useful feedback without exposing PII, secrets, provider payloads, or unsafe horoscope claims.

## Feedback Topics

Ask beta users about:

- onboarding clarity
- birth profile form clarity
- unknown birth time explanation
- horoscope page readability
- subscription and entitlement clarity
- notification preference clarity
- Email/LINE connection explanation
- privacy/export/delete clarity
- support response helpfulness
- beta limitation clarity

## User Prompt

```text
ช่วยเล่าประสบการณ์ใช้งาน beta ให้เราหน่อย:

1. ขั้นตอนไหนเข้าใจง่าย
2. ขั้นตอนไหนสับสนหรือใช้ยาก
3. ข้อความ horoscope อ่านแล้วรู้สึกเหมาะสมไหม
4. คำอธิบายเรื่อง beta, privacy, subscription และการแจ้งเตือนชัดเจนพอไหม
5. มีจุดไหนที่ควรปรับก่อนเปิดให้ผู้ใช้มากขึ้น

กรุณาไม่ส่งข้อมูลส่วนตัวแบบเต็ม เช่น วันเวลาเกิดแบบละเอียด email แบบเต็ม LINE user ID รหัส invite แบบเต็ม ข้อมูลการชำระเงิน token หรือ secret
```

## Safe Feedback Form Fields

```text
Feedback category:
Page or flow:
What happened:
What you expected:
Severity: low / medium / high
Can the team contact you through the approved beta support channel: yes / no
Sanitized reference if shown by the app:
```

Do not include fields for full birth date, full birth time, birth place, raw email, raw LINE user ID, payment IDs, provider payloads, or invite codes.

## Feedback Categories

```text
onboarding
birth_profile
horoscope_content
unknown_birth_time
subscription_access
notification_preferences
email_or_line_status
privacy_controls
beta_invite
support
copy_or_translation
other
```

## Unsafe Feedback Content To Remove

Support should redact or refuse to store:

- full email addresses
- raw LINE user IDs
- full invite codes
- exact birth date, birth time, or birth place
- payment provider payloads or card data
- webhook payloads
- API keys, access tokens, webhook secrets, session tokens, or passwords
- screenshots that show private profile details unless an approved secure channel is used

## Feedback Review Checklist

```text
[ ] Feedback does not contain raw PII or secrets
[ ] Issue is tagged with a safe category
[ ] Unsafe horoscope wording, if reported, is summarized without copying private data
[ ] Privacy/payment/deletion issues are escalated
[ ] Provider activation questions are treated as human-gated and not production-approved
[ ] Response uses entertainment/self-reflection framing
```

## Closing Response

```text
ขอบคุณมากครับ/ค่ะ feedback นี้ช่วยให้ทีมปรับ beta ให้เข้าใจง่ายและปลอดภัยขึ้น เราจะตรวจสอบโดยใช้เฉพาะข้อมูลที่จำเป็นและหลีกเลี่ยงการเก็บข้อมูลส่วนตัวหรือข้อมูลลับเกินความจำเป็น
```

