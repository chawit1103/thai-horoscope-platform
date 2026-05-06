# Astro Calc Service

PR18 adds a Python-only calculation core for Thai Nirayana chart snapshots.

The default test path uses `MockAstroEngine`, which is deterministic and does not depend on ephemeris files. The `SwissEphemerisEngine` adapter is present behind explicit runtime/license guards and imports `swisseph` only when selected.

The core supports natal chart snapshots, transit-to-natal structural comparisons, solar return calculation behind a feature flag, and hourly timing windows behind a feature flag. Transit output contains aspect hits and interpretation keys only; solar return output contains matching metadata and chart snapshots only. Horoscope prose belongs outside this service.

Required runtime configuration:

```text
ASTRO_ENGINE=mock|swisseph
ASTRO_EPHEMERIS_PATH=
ASTRO_CALCULATION_PROFILE=TH_NIRAYANA_V1
ASTRO_DEFAULT_AYANAMSA=lahiri
SWISSEPH_LICENSE_MODE=none|free|professional
ASTRO_ENABLE_SOLAR_RETURN=true|false
ASTRO_ENABLE_HOURLY_TIMING=true|false
```

Production with `ASTRO_ENGINE=swisseph` requires:

```text
SWISSEPH_LICENSE_MODE=professional
ASTRO_EPHEMERIS_PATH=/mounted/ephemeris/path
```

Do not commit ephemeris binary files and do not download ephemeris files during request handling.
