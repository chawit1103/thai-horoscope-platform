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

## Golden case format

```json
{
  "case_id": "GC-001",
  "description": "Natal chart for known time in Bangkok",
  "input": {
    "calculation_profile_code": "TH_NIRAYANA_V1",
    "datetime_local": "1990-05-12T08:30:00",
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
