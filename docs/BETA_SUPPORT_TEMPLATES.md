# BETA_SUPPORT_TEMPLATES.md - Beta Support Templates

## Goal

Provide safe support response templates for beta operators. These templates avoid secrets, raw PII, unsafe horoscope claims, and overclaimed readiness.

## Support Rules

- Do not ask users to paste full invite codes, full email addresses, LINE user IDs, full birth data, payment payloads, provider payloads, tokens, API keys, or secrets.
- Use sanitized references only.
- Do not promise deterministic horoscope outcomes.
- Do not provide medical, legal, or financial advice.
- Escalate privacy, deletion, payment, provider activation, and safety issues to the responsible owner.

## Acknowledge Feedback

```text
ขอบคุณที่ส่ง feedback ให้ทีม beta ครับ/ค่ะ เราจะใช้ข้อมูลนี้เพื่อปรับปรุงความชัดเจนและประสบการณ์ใช้งาน

เพื่อความปลอดภัย กรุณาไม่ส่งข้อมูลส่วนตัวแบบเต็ม รหัส invite แบบเต็ม LINE user ID ข้อมูลการชำระเงิน token หรือ secret ใด ๆ ในช่องทาง support
```

## Onboarding Help

```text
หากติดขั้นตอน onboarding กรุณาบอกเราว่าติดที่หน้าหรือขั้นตอนไหน และเห็นข้อความ error แบบใด โดยไม่ต้องส่งวันเวลาเกิดแบบเต็มหรือข้อมูลติดต่อแบบเต็ม

ถ้าไม่ทราบเวลาเกิด สามารถเลือก “ไม่ทราบเวลาเกิด” ได้ ผลลัพธ์บางส่วนจะเป็นแนวโน้มกว้าง ๆ มากขึ้น
```

## Unknown Birth Time Explanation

```text
กรณีไม่ทราบเวลาเกิด ระบบจะลดความมั่นใจของบางส่วนและหลีกเลี่ยงการตีความที่ต้องใช้ลัคนาหรือเรือนอย่างละเอียด ข้อความที่ได้จึงเหมาะสำหรับดูแนวโน้มกว้าง ๆ และการทบทวนตนเอง
```

## Notification Issue

```text
ขอบคุณที่แจ้งปัญหาการแจ้งเตือนครับ/ค่ะ ทีมจะตรวจสอบสถานะช่องทางและการตั้งค่าการแจ้งเตือนในโหมด beta

กรุณาไม่ส่ง LINE user ID, access token, webhook payload, email แบบเต็ม หรือ secret ใด ๆ หากจำเป็น ทีมจะใช้ reference ที่ระบบแสดงแบบ sanitized เท่านั้น
```

## Privacy Request

```text
เราได้รับคำถามเกี่ยวกับ privacy แล้วครับ/ค่ะ คุณสามารถใช้เมนูในระบบเพื่อขอ export ข้อมูล ลบข้อมูลเกิด ขอปิดบัญชี หรือ unsubscribe ได้

หากต้องการให้ support ช่วยติดตาม กรุณาส่งเฉพาะ reference ที่ระบบแสดงแบบ sanitized และไม่ต้องแนบข้อมูลเกิดหรือข้อมูลติดต่อแบบเต็ม
```

## Payment Or Subscription Question

```text
ขอบคุณที่แจ้งเรื่อง subscription ครับ/ค่ะ ช่วง beta บางส่วนอาจยังเป็น mock หรือ staging/test mode และสิทธิ์ beta ไม่ได้แทนสิทธิ์ subscription หรือ premium โดยอัตโนมัติ

กรุณาไม่ส่งเลขบัตร ข้อมูลการชำระเงิน payment payload provider ID แบบเต็ม หรือ secret ใด ๆ ทาง support
```

## Unsafe Horoscope Concern

```text
ขอบคุณที่แจ้งข้อความที่อาจไม่เหมาะสมครับ/ค่ะ เนื้อหา horoscope ควรเป็นเพื่อความบันเทิงและการทบทวนตนเองเท่านั้น ไม่ควรทำให้กลัว กดดัน หรืออ้างผลลัพธ์ที่แน่นอน

ทีมจะนำตัวอย่างไปตรวจสอบและปรับปรุง โดยไม่ต้องส่งข้อมูลเกิดหรือข้อมูลส่วนตัวแบบเต็มเพิ่มเติม
```

## Beta Limitation Response

```text
ขณะนี้ระบบยังอยู่ในช่วง beta จึงอาจมีบางส่วนที่ยังทดลองอยู่ เช่น copy, การตั้งค่าแจ้งเตือน, flow บางหน้า หรือ provider mode บางส่วน

ทีมยังไม่ถือว่า beta เป็นการอนุมัติ production launch, real provider activation, payment activation หรือการรับประกันผลลัพธ์ horoscope
```

## Escalation Checklist

```text
[ ] Privacy export/delete/account deletion issue
[ ] Payment or subscription entitlement issue
[ ] Email or LINE delivery issue
[ ] Potential PII or secret leakage
[ ] Unsafe horoscope wording
[ ] Admin/invite access issue
[ ] Production readiness or provider activation question
```

