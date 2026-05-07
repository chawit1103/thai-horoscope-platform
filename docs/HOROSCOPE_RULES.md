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

PR25 implements the first TypeScript MVP rule engine in
`apps/web/src/mvp/horoscope-content-engine.ts`. It consumes structured chart
snapshots and optional transit comparison structures only. It must not consume
raw birth date, birth time, birth place, email, LINE user ID, payment payload,
or any production secret.

## PR25 content output

The content renderer returns one deterministic JSON object per
`period_type + period_key + calculation_hash + content_profile_code`.

Required output fields:

```json
{
  "period_type": "daily",
  "period_key": "2026-05-03",
  "overview": "Thai overview text",
  "work": "Thai work text",
  "money": "Thai money text",
  "relationship": "Thai relationship text",
  "wellness": "Thai wellness text",
  "advice": "Thai advice text",
  "caution": "Thai caution text",
  "lucky_window": "optional Thai timing label",
  "reflection_question": "optional Thai reflection prompt",
  "rule_hits": [],
  "safety_flags": [],
  "content_profile_code": "TH_SAFE_REFLECTION_V1",
  "generated_at": "2026-05-03T00:00:00.000Z",
  "source_chart_snapshot_id": "chart_...",
  "calculation_hash": "sha256...",
  "content_hash": "sha256...",
  "warnings": []
}
```

`content_hash` is for audit/replay of the rendered content. A different
`content_profile_code` must produce a different content profile and hash.

## Explainable rule hits

Each rule hit must include:

```json
{
  "rule_id": "NATAL_DAILY_MOON_VENUS_SUPPORT",
  "trigger": "moon_venus_supportive_aspect",
  "category": "relationship",
  "weight": 2,
  "source_points": ["moon", "venus"]
}
```

Rules may use:

- natal aspect structures already returned by astro-calc
- planet sign indices already present in the chart snapshot
- planet house numbers only when `houses.reliable=true`
- transit-to-natal structured hits and their category/weight hints

Rules must not:

- calculate or alter planetary positions
- infer houses when the chart marks houses unreliable
- invent missing ascendant, Lagna, or transit data
- call an LLM or network API

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
