# BETA_LAUNCH_CONTENT.md - Beta Launch Content Pack

## Goal

Provide calm Thai beta launch copy for the web experience without claiming
certainty, triggering fear, or presenting horoscope output as medical, legal,
financial, or high-risk decision guidance.

The implementation lives in:

```text
apps/web/src/mvp/beta-launch.ts
apps/web/app/beta/page.tsx
```

## Content strategy

Beta copy should explain:

- the service is a small pre-launch beta
- horoscope content is entertainment and self-reflection
- some outputs are experimental
- unknown birth time lowers precision and uses approximations
- beta enrollment does not replace subscription entitlement
- users keep privacy export, birth-profile deletion, account deletion, and notification controls
- LINE and Email are optional channels and remain mock/sandbox unless separately approved
- feedback should avoid raw invite codes, full birth data, provider payloads, or secrets

## Approved Thai copy themes

Use the copy pack exposed by `getBetaLaunchCopy()` for:

- beta landing and welcome
- onboarding explanation
- entertainment/self-reflection disclaimer
- unknown birth time limitation
- subscription/beta limitation
- privacy/export/delete explanation
- notification preference explanation
- LINE/email connection explanation
- beta feedback request
- support/contact placeholder

Required disclaimer:

```text
เนื้อหานี้จัดทำเพื่อความบันเทิงและการทบทวนตนเองเท่านั้น ไม่ใช่คำแนะนำทางการแพทย์ การเงิน กฎหมาย หรือการตัดสินใจที่มีความเสี่ยงสูง
```

Unknown birth time warning:

```text
กรณีไม่ทราบเวลาเกิด ผลบางส่วนอาจเป็นค่าประมาณ และจะหลีกเลี่ยงการตีความที่ต้องใช้ลัคนาหรือเรือนอย่างมั่นใจ
```

Beta limitation:

```text
ผลลัพธ์บางส่วนเป็นระบบทดลอง และสิทธิ์ beta ไม่ได้แทนสิทธิ์ subscription รายเดือน รายปี หรือสิทธิ์ premium อื่น ๆ
```

## Forbidden wording

Do not use beta launch copy that includes:

- deterministic guarantee language
- medical diagnosis or cure claims
- legal advice
- investment instructions
- lottery or guaranteed money claims
- death, severe illness, accident, or unavoidable harm predictions
- fear-based urgency
- 100% accuracy claims

Examples that must stay forbidden:

```text
ต้องเกิดขึ้นแน่นอน
รวยแน่
ตาย
อุบัติเหตุแน่นอน
โรคร้ายแน่นอน
แม่น 100%
```

## Privacy reminders

User-facing beta copy must not show raw:

- invite codes
- email addresses
- LINE user IDs
- payment provider IDs
- webhook payloads
- birth hashes or calculation hashes
- audit IDs or internal debug IDs
- secrets, tokens, or API keys

Operator/support feedback should use sanitized references only.

## Known beta limitations

- Beta enrollment controls entry to beta-only screens, not paid entitlement.
- Subscription gates still decide monthly/yearly or premium access.
- Privacy deletion, account deletion, and unsubscribe controls continue to apply.
- Real Email, LINE, and payment provider activation remains out of scope without human approval.
- The beta content pack is deterministic local copy, not generated horoscope interpretation.
