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

## Engine architecture

The astro core is a Python calculation boundary under `services/astro-calc`. The Next.js app may call the service or consume shared contracts, but it must not calculate planetary positions in TypeScript.

The architecture has four layers:

- `app/schemas.py` defines JSON-serializable request and response dataclasses.
- `app/engines/base.py` defines the astronomical engine interface.
- `app/engines/mock.py` and `app/engines/swisseph.py` implement engine adapters.
- `app/core/calculators.py` composes profiles, time conversion, engine output, house/angle logic, aspects, solar return search, hourly timing windows, and deterministic hashes.

Engine adapters return planetary and house primitives. The calculator layer is responsible for normalized chart snapshots, warning policy, calculation metadata, and keeping outputs deterministic for audit/replay.

## Swiss Ephemeris adapter

The Swiss Ephemeris adapter lives in `app/engines/swisseph.py` and is selected only when `ASTRO_ENGINE=swisseph`.

Production use fails closed unless all of these are true:

- `NODE_ENV=production`
- `SWISSEPH_LICENSE_MODE=professional`
- `ASTRO_EPHEMERIS_PATH` is configured
- ephemeris files are supplied by deployment artifact or mounted storage

Local/test Swiss Ephemeris use still requires an explicit non-`none` license mode and an ephemeris path. Runtime downloads are not supported. Tests use the deterministic mock engine or an injected fake Swiss Ephemeris module; they must not require real ephemeris binaries or network access.

## Calculation profile

A calculation profile is the versioned astrological contract for a chart. It controls:

- zodiac type
- ayanamsha/ayanamsa
- house system
- node type
- planet list
- aspect orbs

The current Thai Nirayana profile is:

```text
TH_NIRAYANA_V1
- zodiac_type: sidereal
- ayanamsha: lahiri
- house_system: whole_sign
- node_type: true_node
- planets: sun, moon, mercury, venus, mars, jupiter, saturn, uranus, neptune, pluto, rahu, ketu
```

`TH_NIRAYANA_SWISSEPH_V1` keeps the same calculation settings but marks the intended Swiss Ephemeris-backed profile. Any change to engine behavior, ephemeris files, zodiac mode, ayanamsha, house system, node mode, or aspect orbs must create a new profile code rather than silently changing historical calculations.

## Ayanamsa

The codebase uses `ayanamsha` in some internal field names and `ayanamsa` in public JSON fields. Both refer to the same sidereal offset concept.

The Thai Nirayana profile currently uses Lahiri. Chart snapshots include:

- `ayanamsa_deg`
- `ayanamsha.name`
- `ayanamsha.value_deg`
- `zodiac.ayanamsa_code`
- `zodiac.ayanamsa_deg`

If the engine cannot determine an ayanamsa for a profile that requires sidereal positions, the calculation must fail or return an explicit warning; it must not silently substitute another ayanamsa.

## Sidereal/nirayana conversion

For sidereal/nirayana profiles, each planet stores both tropical and sidereal longitude:

```text
sidereal_longitude_deg = normalize(tropical_longitude_deg - ayanamsa_deg)
```

`longitude_deg` is the profile-selected longitude used by downstream chart logic. For `TH_NIRAYANA_V1`, `longitude_deg` equals `sidereal_longitude_deg`.

Sign index, Thai/English sign names, degree in sign, aspects, and house assignment are derived from the profile-selected longitude. Tropical profiles may be added later, but they must be explicit profile versions.

## Natal chart

Natal chart calculation accepts birth date, optional birth time, timezone, latitude, longitude, optional elevation, and calculation profile.

The output includes:

- local and UTC datetime
- Julian day UT
- calculation profile metadata
- ayanamsa metadata
- Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Rahu/North Node, and Ketu/South Node
- tropical longitude, sidereal longitude, ecliptic latitude, speed, retrograde flag, sign fields, degree in sign, optional nakshatra placeholder, and warnings for each planet
- Ascendant/Lagna, MC, IC, Descendant, houses, and planet house assignment only when birth time and location make houses reliable
- warnings and `calculation_hash`

If `birth_time_unknown=true`, the engine must return `UNKNOWN_BIRTH_TIME` and `UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE`, mark houses and angles unreliable, omit derived Lagna points, and leave planet `house_number` unset.

## Transit-to-natal

Transit-to-natal calculation accepts a saved natal chart snapshot, a UTC transit datetime, optional transit location, calculation profile, and orb settings.

The engine calculates a deterministic transit chart snapshot, compares transit planets to natal planets and derived natal points, and emits structured aspect hits:

- conjunction
- opposition
- square
- trine
- sextile

Each hit includes the transit planet, natal point, aspect type, exact orb, applying/separating hint when available, category/weight hints, and an `interpretation_key`. It must not include horoscope prose or prediction text.

## Solar return

Solar return calculation finds the approximate UTC datetime when the transiting Sun returns to the natal Sun reference longitude. Sidereal profiles compare sidereal Sun longitude; tropical profiles compare tropical Sun longitude.

The prototype algorithm:

- centers the search around the birthday in the target year
- brackets the return within a several-day window
- applies bounded bisection
- stops at the configured arcminute accuracy target
- returns `SOLAR_RETURN_CONVERGENCE_FAILED` if it cannot converge safely

Missing natal birth time does not block Sun return calculation. Solar return houses and angles still depend on the return datetime and return location.

## Hourly timing

Hourly timing produces structured transit/aspect windows for downstream content systems. It does not write recommendations, predictions, or interpretation text.

Each timing window includes:

- UTC and local start/end
- trigger type
- transit planet
- natal point
- aspect type
- peak datetime when available
- minimum orb
- category and weight hints
- safety level

The PR18 prototype supports hourly granularity and date ranges up to 7 days. Unsupported ranges return `UNSUPPORTED_TIMING_RANGE` and no windows. Duplicate triggers are collapsed by `(transit_planet, natal_point, aspect_type)`.

## Known limitations

PR18 is an engine foundation, not a full production astrology launch.

- The default engine is deterministic mock data, not production-grade ephemeris calculation.
- Swiss Ephemeris production use requires a professional license decision and configured ephemeris path.
- Ephemeris binary files are not committed.
- Runtime ephemeris downloads are not supported.
- Real Swiss Ephemeris golden fixtures are pending until the approved ephemeris file set and license strategy are chosen.
- Whole-sign houses are implemented for current Thai Nirayana profiles; additional house systems require explicit profile/version support.
- Nakshatra is a placeholder field.
- Applying/separating hints are prototype-level and should be reviewed against the selected production ephemeris engine.
- The engine returns structures and numbers only; horoscope interpretation text belongs in a separate content layer.

## Content rules boundary

PR25 adds the first horoscope content rules engine in the Next.js MVP layer.
That engine consumes chart snapshots and transit comparison structures returned
by this service, but it does not calculate or change planetary positions.

The astro-calc service remains responsible for:

- planet positions
- aspects
- houses and ascendant reliability
- transit-to-natal structured hits
- warning codes
- calculation hashes

The content engine remains responsible for:

- deterministic rule-hit selection
- approved Thai template rendering
- safety filtering
- warning-aware softer phrasing
- content hashes

If `UNKNOWN_BIRTH_TIME` or `UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE` appears, the
content engine must not use house-specific or ascendant-specific claims unless a
future calculation profile explicitly supplies reliable alternatives.

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
  "birth_date": "1990-05-12",
  "birth_time": "08:30",
  "birth_time_unknown": false,
  "timezone": "Asia/Bangkok",
  "latitude": 13.7563,
  "longitude": 100.5018,
  "elevation_m": 0
}
```

`datetime_local` remains accepted as a fully resolved local timestamp for service-to-service calls. User-facing callers should prefer `birth_date`, optional `birth_time`, and `birth_time_unknown` so unknown time handling is explicit.

## Natal chart response

```json
{
  "chart_type": "natal",
  "engine": "swisseph_or_skyfield_or_mock",
  "engine_version": "0.1.0",
  "ephemeris_source": "mock",
  "ephemeris_fingerprint": "mock-v1",
  "calculation_profile_code": "TH_NIRAYANA_V1",
  "calculation_profile": {
    "code": "TH_NIRAYANA_V1",
    "zodiac_type": "sidereal",
    "ayanamsha": "lahiri",
    "house_system": "whole_sign",
    "node_type": "true_node",
    "planets": ["sun", "moon", "mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune", "pluto", "rahu", "ketu"],
    "aspect_orbs_deg": { "conjunction": 8 }
  },
  "datetime_local": "1990-05-12T08:30:00",
  "datetime_utc": "1990-05-12T01:30:00Z",
  "julian_day_ut": 2448023.5625,
  "calculation_hash": "sha256...",
  "ayanamsa_deg": 24.1,
  "ayanamsha": {
    "name": "lahiri",
    "value_deg": 24.1
  },
  "planets": {
    "sun": {
      "tropical_longitude_deg": 65.33,
      "ayanamsa_deg": 24.1,
      "sidereal_longitude_deg": 41.23,
      "ecliptic_latitude_deg": 0,
      "longitude_deg": 41.23,
      "latitude_deg": 0,
      "speed_longitude_deg_per_day": 0.96,
      "sign_index": 1,
      "sign_name_en": "Taurus",
      "sign_name_th": "พฤษภ",
      "degree_in_sign": 11.23,
      "retrograde": false,
      "nakshatra": null,
      "house_number": 5,
      "warnings": []
    }
  },
  "houses": {
    "system": "whole_sign",
    "ascendant_deg": 123.45,
    "mc_deg": 88.12,
    "cusps_deg": [],
    "reliable": true
  },
  "angles": {
    "ascendant_deg": 123.45,
    "lagna_deg": 123.45,
    "mc_deg": 88.12,
    "ic_deg": 268.12,
    "descendant_deg": 303.45,
    "reliable": true
  },
  "derived_points": {},
  "aspects": [],
  "warnings": []
}
```

The public chart snapshot also exposes nested metadata blocks for integrations:

```json
{
  "chart_type": "natal",
  "engine": {
    "name": "swisseph",
    "version": "x.y.z",
    "license_mode": "professional",
    "ephemeris_path_configured": true,
    "ephemeris_fingerprint": "sha256:..."
  },
  "datetime": {
    "local": "1971-03-11T08:17:00+07:00",
    "utc": "1971-03-11T01:17:00Z",
    "timezone": "Asia/Bangkok",
    "julian_day_ut": 2441011.55347
  },
  "location": {
    "latitude": 13.7563,
    "longitude": 100.5018,
    "elevation_m": 0
  },
  "zodiac": {
    "type": "sidereal",
    "ayanamsa_code": "LAHIRI",
    "ayanamsa_deg": 23.9
  }
}
```

Flat fields such as `engine_name`, `engine_version`, `datetime_local`, `datetime_utc`, `julian_day_ut`, `ayanamsa_deg`, and `ayanamsha` remain available as compatibility aliases during PR18.

## Calculation profiles

Do not hard-code a single school of astrology into the engine. Use calculation profiles.

Example:

```text
TH_NIRAYANA_V1
- zodiac_type: sidereal
- ayanamsha: lahiri
- house_system: whole_sign
- node_type: true_node or mean_node
- planets: Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune, Pluto, Rahu/North Node, Ketu/South Node
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

Detailed natal output includes `UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE` and marks `houses.reliable=false`, `angles.reliable=false`, all planet `house_number=null`, and `derived_points={}` when `birth_time_unknown=true`.

## Warning codes

The calculation boundary uses stable warning/error codes so callers can handle degraded output without parsing prose:

- `UNKNOWN_BIRTH_TIME`
- `UNKNOWN_BIRTH_TIME_USED_NOON_FALLBACK`
- `UNKNOWN_BIRTH_TIME_HOUSES_UNRELIABLE`
- `FAST_PLANET_POSITIONS_APPROXIMATE`
- `MISSING_LOCATION`
- `INVALID_TIMEZONE`
- `UNSUPPORTED_DATE_RANGE`
- `UNSUPPORTED_TIMING_RANGE`
- `SOLAR_RETURN_CONVERGENCE_FAILED`
- `EPHEMERIS_FILE_MISSING`
- `LICENSE_MODE_NOT_PRODUCTION_READY`

Invalid timezone and fail-closed ephemeris/license cases may be raised before a chart snapshot exists. Successful degraded calculations return warning objects in `warnings`.

## House, Ascendant, and Thai Lagna policy

House calculation is profile-driven. The selected `calculation_profile.house_system` is copied to `houses.system` and `metadata.house_system` in every chart snapshot.

The engine calculates the astronomical Ascendant and house cusps only when both conditions are true:

- birth time is known
- location is present

When birth time is unknown or location is missing, `houses.reliable=false`, `houses.ascendant_deg=null`, `angles.reliable=false`, `derived_points={}`, and every planet has `house_number=null`.

Thai almanac style profiles may also expose a separate Thai Lagna. For `TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1`, `houses.ascendant_deg` and `angles.ascendant_deg` remain the standard Swiss Ephemeris astronomical Ascendant. `angles.lagna_deg` is calculated with `metadata.lagna_method=thai_antonathi_saman_local_time_sunrise`, using local mean time correction from the Thai standard meridian at 105E and a local sunrise reference. This profile records `metadata.local_time_correction_minutes`, `metadata.sunrise_local_time`, `metadata.lagna_source`, and `metadata.astronomical_ascendant` so operators can verify which convention was used.

Planet house assignment must use the house system and the profile-selected Lagna convention returned in the snapshot. The current Thai Nirayana profiles use `whole_sign`; future profile-specific systems must be implemented explicitly and must not silently reuse whole-sign assignment.

Thai Ketu ๙ is distinct from the South Node. The engine keeps `ketu` as `metadata.ketu_method=south_node`, where Ketu is Rahu plus 180 degrees normalized. Thai traditional Ketu ๙ is tracked separately with `metadata.thai_ketu_9_method`; it is currently marked unsupported until the project approves and implements the traditional formula.

## Transit-to-natal calculation

Transit-to-natal calculation accepts a saved natal chart snapshot plus a UTC transit time. The engine calculates a transit chart snapshot, compares transit planets to natal planets and derived natal points, and returns structural hits only.

Input shape:

```json
{
  "natal_chart_snapshot": "{ chart snapshot object }",
  "transit_datetime_utc": "2026-05-06T05:00:00Z",
  "transit_location": {
    "latitude": 13.7563,
    "longitude": 100.5018,
    "timezone": "Asia/Bangkok",
    "elevation_m": 0
  },
  "calculation_profile_code": "TH_NIRAYANA_V1",
  "orb_settings": {
    "conjunction": 8,
    "opposition": 8,
    "square": 6,
    "trine": 6,
    "sextile": 4
  }
}
```

`transit_location` is optional for planet-only transits. If omitted, the transit chart snapshot will not claim reliable houses or angles.

Output includes:

- `transit_chart_snapshot`
- `transit_planets`
- `natal_planets`
- `aspects`
- `transit_to_natal_hits`
- `scoring_ready`
- `calculation_hash`

Supported major aspects are conjunction `0°`, opposition `180°`, square `90°`, trine `120°`, and sextile `60°`. Orbs come from explicit `orb_settings` when provided, otherwise from the calculation profile.

Each transit-to-natal hit includes:

- `transit_planet`
- `natal_point`
- `aspect_type`
- `exact_orb_deg`
- `applying_or_separating`
- `category_hint`
- `weight_hint`
- `interpretation_key`

The calculation engine must not produce horoscope prose, predictions, or generated interpretation text. `interpretation_key` is a lookup key for a separate interpretation layer.

## Solar return calculation

Solar return calculation accepts a natal chart snapshot, target solar return year, return location, and calculation profile. It finds the approximate UTC time when the transiting Sun returns to the natal Sun reference longitude. The reference follows the selected profile: sidereal profiles compare sidereal Sun longitude, while tropical profiles compare tropical Sun longitude.

Input shape:

```json
{
  "natal_chart_snapshot": "{ chart snapshot object }",
  "solar_return_year": 2026,
  "location": {
    "latitude": 13.7563,
    "longitude": 100.5018,
    "timezone": "Asia/Bangkok",
    "elevation_m": 0
  },
  "calculation_profile_code": "TH_NIRAYANA_V1",
  "accuracy_arc_minutes": 1,
  "max_iterations": 64
}
```

Algorithm:

- Build a search center around the natal birthday in the requested solar return year.
- Search birthday +/- several days to bracket the Sun longitude crossing.
- Use bounded bisection to reduce the Sun longitude delta.
- Stop when the configured accuracy target is met.
- Return `SOLAR_RETURN_CONVERGENCE_FAILED` in `warnings` if the bracket or iteration limit fails.

Output includes:

- `solar_return_datetime_utc`
- `solar_return_datetime_local`
- `sun_longitude_at_return`
- `natal_sun_longitude_reference`
- `delta_arc_seconds`
- `solar_return_chart_snapshot`
- `warnings`
- `calculation_hash`

Unknown natal birth time does not block solar return Sun matching. Solar return houses and angles depend on the return datetime and supplied return location; if location is omitted, the solar return chart snapshot must not claim reliable houses.

## Hourly timing windows

Hourly timing calculation accepts a natal chart snapshot, date range, timezone, location, enabled aspect types, and orb thresholds. It samples transit movement through hourly periods, compares transit planets against natal planets and derived natal points, and returns structured timing signals for downstream content systems.

Input shape:

```json
{
  "natal_chart_snapshot": "{ chart snapshot object }",
  "start_datetime_local": "2026-05-06T09:00:00",
  "end_datetime_local": "2026-05-06T13:00:00",
  "timezone": "Asia/Bangkok",
  "location": {
    "latitude": 13.7563,
    "longitude": 100.5018,
    "timezone": "Asia/Bangkok",
    "elevation_m": 0
  },
  "calculation_profile_code": "TH_NIRAYANA_V1",
  "period_granularity": "hourly",
  "enabled_aspect_types": ["conjunction", "opposition", "square", "trine", "sextile"],
  "orb_thresholds": {
    "conjunction": 8,
    "opposition": 8,
    "square": 6,
    "trine": 6,
    "sextile": 4
  }
}
```

Output contains `timing_windows[]`. Each window includes:

- `start_datetime_utc`
- `end_datetime_utc`
- `local_start`
- `local_end`
- `trigger_type`
- `transit_planet`
- `natal_point`
- `aspect_type`
- `peak_datetime_utc`
- `orb_min_deg`
- `weight_hint`
- `category_hint`
- `safety_level`

The prototype supports hourly granularity and ranges up to 7 days. Unsupported ranges return `UNSUPPORTED_TIMING_RANGE` with no timing windows.

Timing windows are deterministic for the same input. Duplicate triggers are collapsed by `(transit_planet, natal_point, aspect_type)` and the strongest sampled orb is kept. The calculation engine returns only structured timing signals; it must not generate recommendation text or deterministic predictions.

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

## PR18 Astro Core Engine

PR18 introduces `services/astro-calc`, a Python calculation core. The Next.js app must treat it as an external calculation boundary and must not calculate planetary positions in TypeScript.

Implemented modules:

```text
app/config.py                 runtime config and production guard
app/schemas.py                JSON-serializable request/response dataclasses
app/core/profiles.py          calculation profile registry
app/core/calculators.py       natal, transit, solar return, hourly timing calculators
app/core/storage.py           deterministic in-memory snapshot store
app/engines/base.py           engine interface
app/engines/mock.py           deterministic test/mock engine
app/engines/swisseph.py       Swiss Ephemeris adapter with explicit license/config guard
```

Current calculation profile:

```text
TH_NIRAYANA_V1
- zodiac_type: sidereal
- ayanamsha: lahiri
- house_system: whole_sign
- node_type: true_node
- planets: sun, moon, mercury, venus, mars, jupiter, saturn, uranus, neptune, pluto, rahu, ketu
```

`TH_NIRAYANA_SWISSEPH_V1` is an explicit Swiss Ephemeris production profile code with the same Thai Nirayana calculation settings, intended for deployments where `ASTRO_ENGINE=swisseph` passes the professional license and ephemeris path guard.

`TH_ALMANAC_LAHIRI_MEAN_NODE_SWISSEPH_V1` is an explicit Swiss Ephemeris Thai almanac validation profile. It keeps planetary positions, MC, UTC conversion, and Lahiri ayanamsa on the same real-engine path, but separates astronomical Ascendant from Thai Lagna using `thai_antonathi_saman_local_time_sunrise`. It also records that Thai Ketu ๙ is separate from the South Node and remains unsupported until a formula is approved.

The engine returns deterministic, JSON-serializable chart snapshots with:

- detailed natal planet positions, including tropical longitude, ayanamsa, sidereal longitude, ecliptic latitude, speed, retrograde, sign index, English/Thai sign names, degree in sign, optional nakshatra placeholder, planet warnings, and house number when houses are reliable
- astronomical Ascendant, optional Thai Lagna, and whole-sign house cusps when birth time is known
- angles for astronomical Ascendant, optional profile-selected Lagna, MC, IC, and Descendant
- derived points for Lagna and Descendant when houses are reliable
- unknown-birth-time warnings and unreliable houses when birth time is unknown
- natal aspects
- transit-to-natal aspects
- solar return chart when enabled
- hourly timing signal windows when enabled
- metadata for audit/replay, including engine, engine version, ephemeris source/fingerprint, calculation profile, ayanamsha, UTC datetime, Julian day, and calculation hash

The calculation engine does not generate horoscope interpretation text and does not call an LLM.

Runtime configuration:

```text
ASTRO_ENGINE=mock|swisseph
ASTRO_EPHEMERIS_PATH=
ASTRO_EPHEMERIS_MANIFEST_PATH=
ASTRO_REQUIRE_PINNED_EPHEMERIS=false
ASTRO_ALLOW_MOSHIER_EPHEMERIS=false
ASTRO_CALCULATION_PROFILE=TH_NIRAYANA_V1
ASTRO_DEFAULT_AYANAMSA=lahiri
SWISSEPH_LICENSE_MODE=none|free|professional
ASTRO_ENABLE_SOLAR_RETURN=true|false
ASTRO_ENABLE_HOURLY_TIMING=true|false
```

Production guard:

- If `ASTRO_ENGINE=swisseph` and `NODE_ENV=production`, `SWISSEPH_LICENSE_MODE=professional` is required.
- If `ASTRO_ENGINE=swisseph` and `NODE_ENV=production`, `ASTRO_EPHEMERIS_PATH` is required.
- If `ASTRO_ENGINE=swisseph` and `NODE_ENV=production`, `ASTRO_REQUIRE_PINNED_EPHEMERIS=true` and `ASTRO_EPHEMERIS_MANIFEST_PATH` are required.
- Local/test Swiss Ephemeris use requires an explicit non-`none` license mode and either an ephemeris path or `ASTRO_ALLOW_MOSHIER_EPHEMERIS=true` for local validation.
- `ASTRO_ALLOW_MOSHIER_EPHEMERIS=true` is not a production mode and must not be used to bypass pinned ephemeris file approval.
- If a manifest path is configured, supported ephemeris file names, sizes, hashes, and combined fingerprint must match before calculation starts.
- Runtime ephemeris downloads are not supported.

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
