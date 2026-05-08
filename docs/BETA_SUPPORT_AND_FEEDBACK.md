# BETA_SUPPORT_AND_FEEDBACK.md - Beta Support and Feedback

## Goal

Define the support and feedback process for beta users without collecting unnecessary sensitive data or overclaiming horoscope, payment, provider, or production readiness.

## Owner record

```text
Support owner:
Backup owner:
Engineering escalation:
Privacy escalation:
Payment escalation:
LINE/email escalation:
Astro/license escalation:
Monitoring escalation:
Support channel:
Feedback channel:
Expected response window:
```

## User-facing support framing

Use calm beta wording:

```text
ระบบนี้อยู่ในช่วงทดลองใช้งาน ข้อมูลบางส่วนเป็นระบบทดสอบ
เนื้อหาดวงชะตาใช้เพื่อความบันเทิงและการสะท้อนตนเอง
กรณีไม่ทราบเวลาเกิด ผลบางส่วนอาจเป็นค่าประมาณ
หากพบปัญหาเกี่ยวกับการชำระเงิน ความเป็นส่วนตัว การลบข้อมูล หรือการแจ้งเตือน กรุณาติดต่อทีมดูแลเบต้า
```

Avoid claims that the service is 100% accurate, predicts unavoidable outcomes, diagnoses health issues, gives legal/financial instruction, or guarantees money, lottery, relationships, accidents, illness, or death.

## What support may collect

```text
[ ] Sanitized user reference or session reference
[ ] Approximate issue time
[ ] Page or workflow name
[ ] Browser/device class when useful
[ ] Provider mode shown in safe health/operator output
[ ] Sanitized payment/event reference when needed
[ ] Screenshot with secrets and PII removed
[ ] User feedback about clarity, tone, timing, and usefulness
```

## What support must not collect in tickets

```text
[ ] Production secrets, API keys, tokens, webhook secrets, or credentials
[ ] Raw provider payloads
[ ] Card numbers, CVC/CVV, or bank details
[ ] Raw LINE user IDs
[ ] Full email addresses in public/shared tickets
[ ] Full birth date, birth time, birth place, or precise location
[ ] Ephemeris license data or sensitive local paths
[ ] Unredacted logs, alert payloads, or screenshots
```

## Feedback categories

```text
Onboarding clarity:
Birth time unknown clarity:
Horoscope tone and safety:
Daily/weekly/monthly/yearly usefulness:
Subscription/entitlement clarity:
Notification timing/preferences:
Email/LINE connection clarity:
Privacy/export/delete clarity:
Support experience:
Other:
```

## Escalation triggers

Escalate immediately when:

- a user reports deletion, unsubscribe, deactivation, or privacy export failure
- a payment entitlement changes unexpectedly
- duplicate sends or sends after deletion/unsubscribe are reported
- raw PII, secrets, payment data, or provider payloads appear in logs, alerts, screenshots, or tickets
- real Email, LINE, payment, alert, or webhook calls occur without explicit approval
- admin access appears bypassed
- Swiss Ephemeris license/path/manifest status is unclear while real engine mode is enabled
- horoscope content includes fear-based, medical, legal, financial, death, accident, or guaranteed-outcome wording

## Response templates

Beta acknowledgement:

```text
ขอบคุณที่แจ้งปัญหาครับ/ค่ะ ตอนนี้ระบบยังอยู่ในช่วงเบต้า ทีมจะตรวจสอบจากข้อมูลอ้างอิงที่ปลอดภัย โดยไม่ขอรหัสลับ ข้อมูลบัตร ข้อมูล LINE ID แบบดิบ หรือข้อมูลเกิดแบบเต็มในช่องทางสนับสนุนนี้
```

Privacy request:

```text
เราได้รับคำขอด้านความเป็นส่วนตัวแล้ว ทีมจะดำเนินการตามขั้นตอน export/delete ที่กำหนดไว้ และจะแจ้งผลด้วยข้อมูลอ้างอิงที่ไม่เปิดเผยข้อมูลส่วนตัว
```

Horoscope limitation:

```text
เนื้อหาดวงชะตาในระบบนี้ใช้เพื่อความบันเทิงและการสะท้อนตนเอง ไม่ใช่คำทำนายที่รับประกันผลลัพธ์ และไม่ใช่คำแนะนำทางการแพทย์ กฎหมาย หรือการลงทุน
```

Incident limitation:

```text
ขณะนี้ทีมกำลังจำกัดการทำงานบางส่วนเพื่อความปลอดภัยของระบบเบต้า หากมีผลกระทบต่อการแจ้งเตือนหรือการเข้าถึงบางหน้า ทีมจะแจ้งความคืบหน้าผ่านช่องทางสนับสนุนที่กำหนด
```

## Feedback review cadence

```text
[ ] Review critical support issues daily during beta
[ ] Review content safety and wording feedback before each content batch expansion
[ ] Review privacy/payment/provider issues with the relevant owner before continuing rollout
[ ] Record product feedback without raw PII
[ ] Link accepted follow-up work to a bounded PR or issue
```
