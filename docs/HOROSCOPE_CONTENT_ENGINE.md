# HOROSCOPE_CONTENT_ENGINE.md - Thai Horoscope Content Engine

## Goal

PR25 adds a deterministic content rules engine for Thai horoscope text. The
engine turns structured astrology calculation outputs into safe, explainable,
Thai-language content for daily, weekly, monthly, and yearly periods.

The engine is not an astrology calculator and is not an LLM wrapper.

## Boundary

Input:

- chart snapshot ID or calculation hash
- calculation profile code
- structured planet, aspect, house, warning, and optional transit hit data
- period type and period key
- content profile code

Forbidden input:

- raw birth date
- raw birth time
- raw birth place or location text
- email addresses
- LINE user IDs
- payment IDs, raw payment payloads, or card data
- API keys, webhook secrets, tokens, or provider credentials

Output:

- Thai sections for overview, work, money, relationship, wellness, advice, and
  caution
- optional lucky window and reflection question
- explainable rule hits
- safety flags
- content profile code
- generated timestamp
- source chart snapshot ID or calculation hash
- warnings
- deterministic content hash

## Architecture

The engine separates four steps:

1. Structured calculation data is accepted from astro-calc contracts or stored
   chart snapshots.
2. Rule detection creates explainable rule hits from existing structures.
3. Template rendering selects approved Thai templates deterministically.
4. Safety filtering scans rendered text before the output is accepted.

The implementation lives in:

```text
apps/web/src/mvp/horoscope-content-engine.ts
apps/web/tests/horoscope-content-engine.test.ts
```

## Determinism

The same structured input plus the same `content_profile_code` must produce the
same output and `content_hash`. The engine must not use wall-clock time unless
the caller explicitly provides `generatedAt`; otherwise it derives a stable
timestamp from the period key where possible.

Changing `content_profile_code` changes the output profile and content hash.
This allows copy/template policy changes to be versioned without changing
historical content silently.

## Rule hits

Each rule hit is audit-friendly:

```json
{
  "rule_id": "NATAL_DAILY_MARS_MERCURY_REVIEW",
  "trigger": "mars_mercury_tension_aspect",
  "category": "work",
  "weight": 2,
  "source_points": ["mars", "mercury"]
}
```

Allowed rule sources:

- natal aspects already present in a chart snapshot
- planet sign index already present in a chart snapshot
- planet house number only when houses are reliable
- transit-to-natal hits already emitted by astro-calc

The engine must not calculate positions or invent missing houses, ascendant, or
transit signals.

## Period Outputs

All period outputs use the same structure and differ only in period framing and
template selection:

- `daily`: short practical reflection
- `weekly`: digest-oriented themes
- `monthly`: broader planning tone
- `yearly`: reflective and conservative, suitable for human review before
  production use

Yearly content must avoid life-changing certainty, fear, medical/legal/financial
advice, or guaranteed outcome language.

## Unknown Birth Time

If the chart contains unknown birth time warnings or unreliable houses, the
engine must:

- include a warning that confidence is lowered
- use broad reflective phrasing
- ignore house-specific rule hits
- avoid ascendant/Lagna/house claims

This keeps output useful without overstating precision.

## Safety Policy

Generated Thai text must not include:

- death or accident predictions
- medical diagnosis, cure, treatment, or medication instructions
- legal strategy
- investment, stock, crypto, lottery, or guaranteed money instruction
- guaranteed romantic, financial, or life outcomes
- fear-based urgency or fate pressure
- ritual/product upsell pressure
- raw PII or secrets

The engine uses approved templates and an automated filter. A non-empty
`safety_flags` result means the content is not auto-approvable.

## Testing

Required tests cover:

- deterministic output for the same input
- changed output hash/profile for different content profiles
- unknown birth time warning behavior
- blocked unsafe phrase examples
- absence of medical/legal/financial/death/accident/guaranteed language
- valid daily/weekly/monthly/yearly schemas
- explainable rule hits
- no raw birth date/time/location in output
- no LLM or network calls
