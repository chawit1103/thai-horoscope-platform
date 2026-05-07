# ASTRO_KNOWN_LIMITATIONS.md — Astro Calculation Known Limitations

## Goal

Record the current limits of the astro calculation layer so release, support, and product decisions do not overstate what the system can safely claim.

Horoscope content must remain entertainment, reflection, and lifestyle guidance. This document covers calculation readiness only; it does not authorize prediction, medical, legal, or financial claims.

## Current limitations

| Area | Limitation | Impact | Required action |
| --- | --- | --- | --- |
| Default engine | The default engine is deterministic mock data. | Useful for platform/testing, not real production astrology claims. | Use only for development, tests, and non-production demos. |
| Swiss Ephemeris license | Commercial/professional strategy is not approved yet. | Production `ASTRO_ENGINE=swisseph` must remain blocked. | Human/legal approval and recorded decision are required. |
| Ephemeris files | Production ephemeris file set is not selected, pinned, or fingerprinted. | Real-engine golden fixtures cannot be approved yet. | Produce manifest and approval record before launch. |
| Runtime downloads | Runtime ephemeris downloads are not supported. | Deployments must package or mount files intentionally. | Keep network download attempts out of startup/tests/request handling. |
| Repository binaries | Ephemeris binaries must not be committed. | The repo cannot be the source of licensed binary ephemeris files. | Use deployment artifact or mounted storage after approval. |
| Golden fixtures | Only `GC-001 natal_bangkok_known_time` exists as a deterministic mock golden fixture. | Real-engine drift detection is incomplete until production engine/file set is approved. | Add real golden fixtures only after license/file approval. |
| House system | Current Thai Nirayana profiles use whole-sign houses. | Additional house systems are unsupported unless profile/versioned explicitly. | Add new profile code and validation cases before changing. |
| Nakshatra | `nakshatra` is a placeholder field. | Downstream content must not rely on it as authoritative. | Implement and validate explicitly before use. |
| Applying/separating | Transit applying/separating hints are prototype-level. | Content should avoid high-confidence timing language based solely on this field. | Validate against selected production engine before launch. |
| Unknown birth time | Ascendant/Lagna, houses, and planet house assignment are unreliable when birth time is unknown. | House-based interpretation must be omitted or downgraded. | Keep warning-aware downstream rule behavior. |
| Missing location | Houses and angles cannot be claimed reliable without usable location. | Location-dependent interpretations must be omitted or downgraded. | Require location or return degraded warnings. |
| Date range | Unsupported natal/timing ranges return explicit warnings/errors. | Product must handle unavailable calculation periods gracefully. | Keep user-facing fallback copy separate from calculation service. |
| Interpretation text | `services/astro-calc` returns numbers and structures only. | It must not generate horoscope prose or LLM text. | Keep interpretation in a separate content/rule layer. |

## Non-production uses allowed

Allowed before production ephemeris approval:

- local development with mock engine
- automated tests with mock engine
- local/test Swiss Ephemeris adapter validation with fake/injected module
- local/test Swiss Ephemeris validation with explicit non-`none` license mode and local ephemeris path
- schema and contract validation

## Production uses not allowed yet

Not allowed until documented human approval:

- paid production horoscope claims using mock data
- paid production Swiss Ephemeris calculations without professional license mode
- production calculations using unpinned ephemeris files
- runtime download of ephemeris files
- committing licensed ephemeris binaries to the repository
- silently updating golden fixtures after engine/profile/file changes
- private birth data reuse outside the consented calculation purpose

## Communication guidance

When a limitation affects user-facing behavior, frame the product as entertainment and reflection. Use cautious phrasing such as:

```text
แนวโน้มวันนี้...
พลังงานช่วงนี้เหมาะกับ...
ควรใช้วิจารณญาณ...
ใช้เป็นแนวทางทบทวนตัวเอง...
เพื่อความบันเทิงและการสะท้อนตนเอง...
```

Do not claim the system is 100% accurate or that outcomes are guaranteed.
