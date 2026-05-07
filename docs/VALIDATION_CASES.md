# VALIDATION_CASES.md — Astro Calculation Validation

## Goal

Create a repeatable test suite for the astro calculation service so changes in libraries, ephemeris files, or calculation profiles do not silently change output.

## Test types

### Unit tests

- timezone conversion
- Julian day conversion
- sign index conversion
- retrograde flag detection
- aspect orb calculation
- calculation hash generation

### Golden-file tests

Compare full output JSON to approved fixture files.

### Cross-reference tests

Where possible, compare selected chart positions against a trusted reference tool or manually verified expert source.

### Contract tests

Ensure `/packages/contracts` and `/services/astro-calc` agree on request/response schema.

## Required golden cases

```text
GC-001 natal_bangkok_known_time
GC-002 natal_bangkok_unknown_time
GC-003 natal_dst_timezone_new_york
GC-004 transit_today_bangkok
GC-005 sign_boundary_case
GC-006 retrograde_case
GC-007 rahu_ketu_case_if_supported
GC-008 calculation_profile_hash_change
```

## Golden birth cases

Golden birth cases validate full natal chart snapshots. They must include the original request, normalized datetime, engine metadata, calculation profile, ayanamsa, planets, houses/angles when reliable, warnings, and `calculation_hash`.

Required cases:

| Case ID | Name | Purpose | PR18 status |
| --- | --- | --- | --- |
| GC-001 | `natal_bangkok_known_time` | Known birth time and Bangkok location produce deterministic planets, reliable Ascendant/Lagna, houses, and stable hash. | Implemented with deterministic mock fixture. |
| GC-002 | `natal_bangkok_unknown_time` | Unknown birth time returns planets but marks Ascendant/Lagna and houses unreliable. | Covered by unit test; golden fixture pending. |
| GC-003 | `natal_dst_timezone_new_york` | DST timezone conversion is deterministic and not guessed. | Covered by unit test; golden fixture pending. |
| GC-005 | `sign_boundary_case` | Longitude normalization and sign-index boundaries do not drift. | Covered by unit test; golden fixture pending. |
| GC-006 | `retrograde_case` | Retrograde flag behavior is stable. | Covered by unit test; golden fixture pending. |
| GC-007 | `rahu_ketu_case_if_supported` | Rahu/Ketu positions are opposite and node behavior is stable. | Covered by unit test; golden fixture pending. |
| GC-008 | `calculation_profile_hash_change` | Profile changes produce different calculation hashes. | Covered by unit test; golden fixture pending. |

Real Swiss Ephemeris birth golden cases must not be added until the ephemeris file set is pinned/fingerprinted and the license decision is approved.

## Golden transit cases

Golden transit cases validate saved natal snapshot input plus transit datetime behavior. They must compare the transit chart snapshot, transit planets, natal planets, detected aspects, transit-to-natal hits, scoring-ready structures, and `calculation_hash`.

Required cases:

| Case ID | Name | Purpose | PR18 status |
| --- | --- | --- | --- |
| GC-004 | `transit_today_bangkok` | Same natal snapshot and transit UTC datetime produce the same transit result and hash. | Covered by unit test; golden fixture pending. |
| GT-001 | `transit_aspects_inside_orb` | Configured aspects inside orb are included. | Covered by unit test; golden fixture pending. |
| GT-002 | `transit_aspects_outside_orb` | Configured aspects outside orb are excluded. | Covered by unit test; golden fixture pending. |
| GT-003 | `transit_datetime_change` | Changing transit datetime changes transit positions and hash. | Covered by unit test; golden fixture pending. |

Transit output must contain interpretation keys only. It must not contain horoscope prose, predictions, or LLM-generated text.

## Solar return cases

Solar return cases validate the iterative Sun-return search and its failure behavior.

Required cases:

| Case ID | Name | Purpose | PR18 status |
| --- | --- | --- | --- |
| SR-001 | `solar_return_bangkok_2026` | Golden natal fixture returns deterministic solar return datetime and stable hash. | Covered by unit test; golden fixture pending. |
| SR-002 | `solar_return_sun_close_to_natal_reference` | Return Sun longitude is within configured arcminute target. | Covered by unit test. |
| SR-003 | `solar_return_convergence_failure` | Failed convergence returns `SOLAR_RETURN_CONVERGENCE_FAILED` instead of looping. | Covered by unit test. |
| SR-004 | `solar_return_unknown_birth_time` | Unknown natal birth time can still compute Sun return while return houses depend on return location. | Covered by unit test. |

Solar return golden fixtures must include target longitude, return longitude, `delta_arc_seconds`, warning list, and the nested solar return chart snapshot.

## Edge cases

These cases must be covered by unit tests at minimum and promoted to golden fixtures when their full JSON shape is important for compatibility.

| Edge | Expected behavior | PR18 status |
| --- | --- | --- |
| Unknown birth time | Return `UNKNOWN_BIRTH_TIME`, `UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK`, `FAST_PLANET_POSITIONS_APPROXIMATE`, and `UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE`; mark houses/angles unreliable; omit planet house assignment. | Covered by unit test and contract schema validation. |
| Timezone | Convert Asia/Bangkok and DST/non-DST America/New_York deterministically; reject invalid timezone with `INVALID_TIMEZONE`. | Covered by unit test. |
| Missing location | Return `MISSING_LOCATION`; do not claim reliable houses or Ascendant/Lagna. | Covered by unit test. |
| Unsupported date range | Return `UNSUPPORTED_DATE_RANGE` for natal chart date limits and `UNSUPPORTED_TIMING_RANGE` for hourly timing ranges beyond the prototype limit. | Covered by unit test. |

## Golden case format

```json
{
  "case_id": "GC-001",
  "description": "Natal chart for known time in Bangkok",
  "input": {
    "calculation_profile_code": "TH_NIRAYANA_V1",
    "birth_date": "1990-05-12",
    "birth_time": "08:30",
    "birth_time_unknown": false,
    "timezone": "Asia/Bangkok",
    "latitude": 13.7563,
    "longitude": 100.5018,
    "elevation_m": 0,
    "time_accuracy_minutes": 5
  },
  "expected": {
    "engine": "mock",
    "calculation_profile_code": "TH_NIRAYANA_V1",
    "warnings": []
  }
}
```

## Acceptance thresholds

For real ephemeris engine comparisons, define tolerances explicitly.

Example placeholder:

```text
planet longitude: <= 0.01 degree unless profile specifies stricter threshold
house cusps: <= 0.05 degree unless profile specifies stricter threshold
calculation hash: exact match for identical input/profile/fingerprint
```

These thresholds must be reviewed once the production ephemeris strategy is chosen.

## Unknown birth time validation

If `birth_time_unknown = true`:

Expected behavior:

- response includes `UNKNOWN_BIRTH_TIME` warning
- ascendant/houses may be omitted or marked unreliable
- rule engine must not generate confident house/lัคนา interpretation

## Timezone validation

Test:

- Asia/Bangkok, no DST
- America/New_York during DST
- America/New_York outside DST
- invalid timezone

Invalid timezone must be rejected by validation, not guessed silently.

## Sign boundary validation

Cases near 29°59′ and 0°00′ must be tested because sign changes can alter interpretation.

Expected:

- sign index is correct
- longitude normalization is correct
- no off-by-one sign bug

## Regression policy

If golden output changes:

1. Identify reason.
2. Document engine/profile/ephemeris change.
3. Review with astro owner.
4. Update fixture only after approval.
5. Do not silently update golden files.

## CI requirement

CI should run:

```bash
python -m pytest
```

When real engine is introduced, CI must have access to fixed test ephemeris files or a deterministic mock mode.

## PR18 validation status

PR18 adds Python tests under `services/astro-calc/tests` for:

- Asia/Bangkok timezone conversion
- America/New_York DST and non-DST conversion
- invalid timezone rejection
- unknown birth time warnings
- ascendant/lัคนา and house cusp output for known birth time
- omitted/unreliable ascendant and no planet house assignment when birth time or location is missing
- ascendant changes when birth time changes
- ascendant changes when location changes
- explicit house system propagation into chart snapshot metadata
- detailed planet output for Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Rahu/North Node, and Ketu/South Node
- tropical/sidereal longitude, ayanamsa, English/Thai signs, degree in sign, and house assignment fields
- missing-location and unsupported-date-range warnings
- sign boundary behavior
- retrograde Rahu/Ketu behavior
- calculation hash stability
- calculation profile hash changes
- transit-to-natal comparison determinism
- snapshot-based transit-to-natal input
- same transit datetime creates the same transit result
- changing transit datetime changes transit positions and hash
- transit aspects are detected within configured orbs
- transit aspects outside configured orbs are not detected
- transit hits contain interpretation keys only, not prose interpretation
- solar return feature flag
- deterministic solar return date for the golden natal fixture
- solar return Sun longitude returns within the configured arcminute target
- solar return convergence failure returns a warning instead of looping
- unknown natal birth time can still compute a Sun return, while solar return houses depend on return location
- hourly timing feature flag and structured signal output
- hourly timing windows generated for a fixed date range
- no duplicate hourly timing windows for the same trigger
- hourly timing peak time stays within its window
- hourly timing windows respect timezone conversion
- unsupported hourly timing ranges fail safely with `UNSUPPORTED_TIMING_RANGE`
- Swiss Ephemeris production guard
- Swiss Ephemeris adapter with an injected fake module
- golden fixture `GC-001 natal_bangkok_known_time`

The golden fixture uses the deterministic mock engine. Real Swiss Ephemeris golden files must be added only after the ephemeris file set and license strategy are approved.
