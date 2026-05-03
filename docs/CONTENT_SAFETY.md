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
```

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
