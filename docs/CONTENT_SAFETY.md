# CONTENT_SAFETY.md — Horoscope Content Safety Guide

## Goal

Ensure horoscope content is safe, non-manipulative, and suitable for subscription delivery through LINE, Email, and future channels.

## Product framing

Horoscope content must be:

- Entertainment
- Self-reflection
- Lifestyle guidance
- Gentle, practical, and non-fear-based

It must not be presented as certainty, diagnosis, legal advice, financial advice, or a guarantee.

## Required disclaimer

Use a short disclaimer on horoscope pages and long-form results:

```text
เนื้อหานี้จัดทำเพื่อความบันเทิงและการทบทวนตนเองเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์ การเงิน กฎหมาย หรือการตัดสินใจที่มีความเสี่ยงสูง
```

Short version for notification preview:

```text
เพื่อความบันเทิงและการทบทวนตนเอง
```

## Forbidden content

Do not generate or approve content that:

- Predicts death or severe accident
- Predicts serious illness or recovery
- Tells users to stop medication or treatment
- Gives specific investment advice
- Gives legal strategy
- Claims guaranteed romantic or financial success
- Uses fear to pressure purchase
- Claims ritual or product purchase will solve a serious problem
- Says the horoscope is 100% accurate
- Makes sensitive inferences about a person’s private life without basis

## Risky topics and safe alternatives

### Health

Avoid:

```text
คุณจะป่วยหนัก
โรคนี้จะหายแน่นอน
```

Use:

```text
ช่วงนี้ควรให้ความสำคัญกับการพักผ่อนและดูแลจังหวะชีวิตให้สมดุล
```

### Money

Avoid:

```text
ลงทุนตัวนี้แล้วรวย
วันนี้ต้องซื้อหุ้น
```

Use:

```text
เหมาะกับการทบทวนรายรับรายจ่ายและตัดสินใจอย่างรอบคอบ
```

### Love

Avoid:

```text
เขาจะนอกใจแน่นอน
ต้องเลิกทันที
```

Use:

```text
การสื่อสารที่ตรงไปตรงมาจะช่วยลดความเข้าใจผิดได้
```

### Career

Avoid:

```text
คุณจะถูกไล่ออก
```

Use:

```text
ควรตรวจรายละเอียดงานและสื่อสารความคาดหวังให้ชัดเจน
```

## Review levels

### Low risk

- Daily generic reflection
- Color/number entertainment
- Light work/lifestyle guidance

May be auto-approved after tests.

### Medium risk

- Personalized money/love/work guidance
- Monthly readings
- Messages using strong negative words

Requires review or safety classifier.

### High risk

- Yearly readings
- Health-like statements
- Financial-like statements
- Fear-based wording

Requires human approval.

## Safety flags

Content renderer should flag:

```text
medical_claim
financial_advice
legal_advice
death_or_accident_prediction
guaranteed_outcome
fear_based_language
ritual_upsell
relationship_coercion
pii_or_secret_leak
```

## PR25 automated safety filter

`apps/web/src/mvp/horoscope-content-engine.ts` includes the first deterministic
content safety filter for generated horoscope text. It scans rendered Thai
sections, caution text, lucky windows, and reflection questions before the
output is considered valid.

The filter must catch examples from these groups:

- medical claims or treatment instructions
- legal strategy or case instructions
- specific investment, stock, crypto, lottery, or guaranteed money claims
- death or accident predictions
- guaranteed outcomes, including 100% accuracy language
- fear-based pressure or fate urgency
- ritual/product upsell pressure
- relationship coercion
- raw PII or secret-shaped values, including email addresses, LINE user IDs,
  birth date/time strings, API keys, tokens, and webhook secrets

If any safety flag appears, the content must be rejected, held for manual
review, or regenerated from approved templates. Tests must cover banned phrase
examples and verify the production renderer does not emit those categories.

## PR26 delivery safety gate

Before Email or LINE payloads are built for scheduled horoscope delivery, the
delivery adapter reruns schema validation and the automated safety filter on the
content output. Unsafe delivery content is blocked before provider dispatch.

Notification previews and emails must not include raw:

- birth date
- birth time
- birth place or location
- email address
- LINE user ID
- payment IDs or raw payment payloads
- API keys, tokens, webhook secrets, or ephemeris license data

Delivery copy may include the short preview disclaimer:

```text
เพื่อความบันเทิงและการทบทวนตนเอง
```

Longer Email content should include the full entertainment/self-reflection
disclaimer. Unknown birth time warnings should remain visible in a softened,
non-alarmist form.

## Unknown birth time policy

When chart warnings include `UNKNOWN_BIRTH_TIME` or
`UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE`, or when `houses.reliable=false`, the
content engine must:

- lower confidence in the output warnings
- use softer Thai phrasing such as "แนวโน้มกว้าง ๆ"
- avoid house-specific or ascendant-specific claims
- keep generated text advisory and reflective

The engine may mention that confidence is lowered, but it must not invent a
house, ascendant, Lagna, or precise timing claim.

## Thai tone examples

Good:

```text
วันนี้เหมาะกับการจัดลำดับความสำคัญและคุยเรื่องที่ค้างใจอย่างใจเย็น
```

Good:

```text
เรื่องเงินควรเน้นความรอบคอบมากกว่าความรีบ โอกาสดีอาจมาในรูปแบบของการวางแผนที่ชัดขึ้น
```

Bad:

```text
ถ้าไม่ทำพิธีแก้ดวง ชีวิตจะมีปัญหาใหญ่
```

Bad:

```text
เดือนนี้คุณมีเกณฑ์ป่วยหนักแน่นอน
```
