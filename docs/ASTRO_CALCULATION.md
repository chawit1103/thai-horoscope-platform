# ASTRO_CALCULATION.md — Python Astro Calculation Service

## Goal

Create a deterministic Python service responsible for astronomical/astrological calculation based on ephemeris data.

The web app must not calculate planetary positions directly.

## Responsibilities

The astro calculation service owns:

- Natal chart calculation
- Transit chart calculation
- Planetary positions
- Lunar nodes where supported
- Ascendant and house cusps where supported
- Aspects
- Retrograde detection
- Ayanamsha and zodiac mode
- Calculation profile metadata
- Ephemeris source metadata
- Calculation hash
- Golden-file validation tests

It does not own:

- User accounts
- Subscriptions
- Payments
- Notification routing
- Horoscope text generation

## Service layout

```text
/services/astro-calc
  app/
    main.py
    api/
    core/
    engines/
    schemas/
    tests/
  pyproject.toml
  README.md
```

## Recommended API

```text
GET  /v1/health
GET  /v1/engine/version
POST /v1/charts/natal
POST /v1/charts/transit
POST /v1/aspects
```

## Natal chart request

```json
{
  "calculation_profile_code": "TH_NIRAYANA_V1",
  "datetime_local": "1990-05-12T08:30:00",
  "timezone": "Asia/Bangkok",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "elevation_m": 0,
  "time_accuracy_minutes": 5
}
```

## Natal chart response

```json
{
  "engine": "swisseph_or_skyfield_or_mock",
  "engine_version": "0.1.0",
  "ephemeris_source": "mock",
  "ephemeris_fingerprint": "mock-v1",
  "calculation_profile_code": "TH_NIRAYANA_V1",
  "datetime_utc": "1990-05-12T01:30:00Z",
  "julian_day_ut": 2448023.5625,
  "calculation_hash": "sha256...",
  "ayanamsha": {
    "name": "lahiri_or_tbd",
    "value_deg": null
  },
  "planets": {
    "sun": {
      "longitude_deg": 41.23,
      "latitude_deg": 0,
      "speed_longitude_deg_per_day": 0.96,
      "sign_index": 1,
      "retrograde": false
    }
  },
  "houses": {
    "system": "whole_sign_or_tbd",
    "ascendant_deg": 123.45,
    "mc_deg": 88.12,
    "cusps_deg": []
  },
  "aspects": [],
  "warnings": []
}
```

## Calculation profiles

Do not hard-code a single school of astrology into the engine. Use calculation profiles.

Example:

```text
TH_NIRAYANA_V1
- zodiac_type: sidereal
- ayanamsha: TBD by astrology expert
- house_system: TBD
- node_type: true_node or mean_node
- planets: sun, moon, mercury, venus, mars, jupiter, saturn, rahu, ketu
```

Example simple profile:

```text
TH_SIMPLE_RASI_V1
- suitable for basic/free tier
- may avoid ascendant if birth time is unknown
- lower personalization confidence
```

## Unknown birth time handling

If user does not know birth time:

- Do not produce confident ascendant interpretation.
- Do not produce confident house interpretation.
- Return warnings.
- Rule engine must ignore or downgrade rules depending on houses/lัคนา.

Warning example:

```json
{
  "code": "UNKNOWN_BIRTH_TIME",
  "message": "Ascendant and houses are not reliable because birth time is unknown."
}
```

## Calculation hash

Every response must include `calculation_hash`.

Recommended hash inputs:

```text
datetime_utc
latitude
longitude
elevation_m
calculation_profile_code
engine
engine_version
ephemeris_fingerprint
```

Purpose:

- Prevent silent drift
- Support caching
- Support reproducibility
- Support audit/debug

## Ephemeris dependency strategy

Prototype can use mock data or a selected ephemeris library.

Before paid production launch, make a formal decision:

- Swiss Ephemeris with appropriate commercial/professional license if needed, or
- Skyfield/Astropy/jplephem/JPL BSP strategy, or
- another documented strategy

Do not ship a paid closed-source production system with a license-sensitive ephemeris dependency before legal/licensing review.

## Testing

Required tests:

- timezone conversion
- Asia/Bangkok local to UTC
- DST timezone case
- unknown birth time
- sign boundary
- retrograde case
- calculation hash stability
- calculation profile change creates different hash
- golden-file regression

## Service failure behavior

If astro-calc is unavailable:

- Web app should not crash.
- User should see a friendly message.
- Jobs should retry with backoff.
- Existing approved horoscope results may still be shown.
