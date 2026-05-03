# HOROSCOPE_RULES.md — Interpretation and Rule Engine

## Goal

Build a deterministic interpretation layer that consumes chart snapshots and produces safe horoscope content.

Do not invent or calculate planetary positions in this layer.

## Separation of concerns

```text
Astro calculation service
  → chart snapshots

Rule engine
  → rule hits and scores

Content renderer
  → Thai text and page/message payload

Notification gateway
  → delivery
```

## Rule schema

Example:

```json
{
  "rule_id": "TRANSIT_JUPITER_MONEY_POSITIVE_001",
  "version": "1.0.0",
  "period_type": "monthly",
  "condition": {
    "transit_planet": "jupiter",
    "target_house": "money",
    "relation": "benefic"
  },
  "category": "money",
  "polarity": "positive",
  "weight": 2,
  "confidence": "medium",
  "thai_interpretation": "มีจังหวะดีเรื่องรายรับหรือโอกาสเพิ่มมูลค่างานเดิม",
  "safe_advice": "ควรวางแผนก่อนใช้จ่าย และไม่ตัดสินใจลงทุนจากอารมณ์ชั่ววูบ"
}
```

## Rule output

The engine should return:

```json
{
  "period_type": "daily",
  "period_key": "2026-05-03",
  "calculation_profile_code": "TH_NIRAYANA_V1",
  "rule_hits": [],
  "scores": {
    "overview": 2,
    "work": 1,
    "money": 0,
    "love": 1,
    "wellness": 0
  },
  "warnings": [],
  "content_seed": {}
}
```

## Categories

Supported categories:

- overview
- work
- study
- money
- love
- relationships
- wellness
- reflection
- auspicious_color
- auspicious_number
- timing_window

## Content renderer

The renderer converts rule hits into safe Thai content.

Recommended output shape:

```json
{
  "title": "ดวงวันนี้ของคุณ",
  "summary": "วันนี้เหมาะกับการจัดลำดับความสำคัญและคุยเรื่องงานให้ชัดเจน",
  "sections": [
    {
      "category": "work",
      "heading": "งาน/การเรียน",
      "body": "มีโอกาสสะสางงานค้างหรือคุยเรื่องที่คลุมเครือให้ลงตัวมากขึ้น"
    }
  ],
  "reflection_prompt": "วันนี้มีเรื่องไหนที่คุณอยากจัดการให้ชัดเจนขึ้น?",
  "disclaimer": "เพื่อความบันเทิงและการทบทวนตนเองเท่านั้น"
}
```

## Period logic

### Daily

- Short, practical guidance
- 3–5 sections maximum
- Suitable for LINE preview
- Can be auto-approved if rules are low-risk

### Weekly

- Aggregate 7-day transit signals
- Pick top themes
- Avoid repeating daily text
- Good for digest format

### Monthly

- Use broader transit windows
- Require higher review threshold
- More detailed sections

### Yearly

- Use annual transit windows and/or future techniques after validation
- Human review strongly recommended
- Do not overpromise life-changing certainty

## Safety flags

The engine should flag unsafe content:

```text
medical_claim
financial_advice
legal_advice
death_or_accident_prediction
fear_based_language
guaranteed_outcome
ritual_upsell
sensitive_personal_inference
```

If a safety flag appears, content should be rejected or sent to manual review.

## Confidence handling

If birth time is unknown:

- lower confidence
- avoid ascendant/house-based claims
- include caveat

If geocoding confidence is low:

- avoid highly specific ascendant/house interpretation
- request user correction where appropriate

## Content style guide

Preferred tone:

- Calm
- Warm
- Practical
- Thai-friendly
- Non-fear-based
- Encouraging but not guaranteeing

Avoid:

- “คุณจะต้อง...”
- “ระวังจะเกิดอุบัติเหตุแน่นอน”
- “ลงทุนตัวนี้แล้วรวย”
- “ถ้าไม่แก้ดวงจะมีปัญหา”
- “แม่น 100%”
