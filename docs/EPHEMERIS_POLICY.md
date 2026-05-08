# EPHEMERIS_POLICY.md — Ephemeris and Licensing Policy

## Goal

Define how the platform uses ephemeris data for deterministic chart calculation.

## Key principle

Ephemeris calculation must be:

- deterministic
- auditable
- versioned
- reproducible
- legally approved before paid production use

## Candidate strategies

### Strategy A — Swiss Ephemeris / pyswisseph

Pros:

- Astrology-ready
- Supports many functions commonly needed by astrology software
- Strong fit for natal/transit/houses/ayanamsha workflows
- Fast path to prototype

Risks:

- License-sensitive for commercial or closed-source use
- Requires explicit license decision before paid production launch

Recommended use:

- Prototype and validation only until license decision is complete
- Production only after professional/commercial license or approved legal strategy

### Strategy B — Skyfield + Astropy + jplephem + JPL BSP

Pros:

- Strong astronomy tooling
- More permissive ecosystem in common usage
- Good for JPL ephemeris files and reproducible calculation

Risks:

- More astrology-specific logic must be implemented manually
- Houses, ayanamsha, nodes, and astrological conventions require extra work
- Validation burden is higher

Recommended use:

- Consider if avoiding Swiss Ephemeris licensing complexity is important
- Requires longer engineering effort

### Strategy C — Mock deterministic engine

Pros:

- Good for early app, schema, and routing development
- No ephemeris dependency while building platform

Risks:

- Not suitable for real horoscope claims
- Must be clearly marked as mock

Recommended use:

- Early MVP scaffolding and tests only

## Production policy

Before paid production launch:

1. Decide the ephemeris strategy.
2. Document library versions.
3. Document file versions/fingerprints.
4. Store ephemeris files in controlled deployment artifact or mounted storage.
5. Pin the exact ephemeris file set used for each calculation profile.
6. Do not download ephemeris files at runtime in production.
7. Do not download ephemeris files during tests.
8. Add golden-file regression tests.
9. Add license approval record.

Swiss Ephemeris specifically requires an explicit human/legal license decision before production use. Until that decision is recorded, `ASTRO_ENGINE=swisseph` is allowed only for local/test validation with clearly non-production configuration.

## Swiss Ephemeris license modes

`SWISSEPH_LICENSE_MODE` is an explicit runtime declaration:

```text
none
free
professional
```

Mode policy:

- `none`: default mode. Swiss Ephemeris is disabled and must fail closed when `ASTRO_ENGINE=swisseph`.
- `free`: local/test validation only. This mode is not production-ready and must fail closed in production.
- `professional`: required for production use of `ASTRO_ENGINE=swisseph`.

Production requires:

```text
ASTRO_ENGINE=swisseph
NODE_ENV=production
SWISSEPH_LICENSE_MODE=professional
ASTRO_EPHEMERIS_PATH=/mounted/ephemeris/path
ASTRO_EPHEMERIS_MANIFEST_PATH=/mounted/ephemeris/ephemeris-manifest.json
ASTRO_REQUIRE_PINNED_EPHEMERIS=true
```

If any production requirement is missing, calculation must fail closed before loading or using the adapter.

## Ephemeris file pinning

Ephemeris files must be pinned and fingerprinted. A deployment must know exactly which file set produced a chart snapshot.

Minimum metadata to record for a production Swiss Ephemeris file set:

```text
engine: swisseph
library: pyswisseph
library_version:
ephemeris_path:
file_manifest:
combined_fingerprint: sha256:...
license_mode: professional
approved_by:
approval_date:
calculation_profiles:
```

`file_manifest` should include file names, sizes, and SHA-256 hashes. The chart snapshot should include the resulting `ephemeris_fingerprint`, not raw filesystem details.

PR18 Swiss Ephemeris path validation treats only pinned Swiss Ephemeris data files as fingerprintable inputs. Supported file patterns are `*.se1` and `*.se2`, including standard `se*.se1` and `se*.se2` Swiss Ephemeris filenames. If `ASTRO_EPHEMERIS_PATH` points to a directory, the adapter recursively collects only supported files, deterministically fingerprints each relative filename, size, and SHA-256 content hash, and fails closed with `EPHEMERIS_FILES_EMPTY` when no supported files are present. Unrelated files such as logs, temporary downloads, and provider scratch files are ignored and cannot make a directory valid. If `ASTRO_EPHEMERIS_PATH` points to a single file, that file must match a supported pattern or the adapter fails with `EPHEMERIS_FILE_MISSING`.

PR34 adds runtime manifest validation. When `ASTRO_REQUIRE_PINNED_EPHEMERIS=true`, or whenever production uses `ASTRO_ENGINE=swisseph`, `ASTRO_EPHEMERIS_MANIFEST_PATH` must point to a JSON manifest generated from the approved file set. The manifest must include `fingerprint` (or `combined_fingerprint`/`ephemeris_fingerprint`) and must include `files` (or `file_manifest`) entries with `name`, `size`, and `sha256`. It must also approve the active `ASTRO_CALCULATION_PROFILE` through `calculation_profiles` or `calculation_profile_code`; a manifest approved for another profile fails closed with `EPHEMERIS_PROFILE_NOT_APPROVED`. Fingerprint-only manifests are not valid for pinned or production Swiss Ephemeris activation. Any fingerprint or file-list mismatch fails closed with `EPHEMERIS_MANIFEST_MISMATCH`.

Runtime behavior must not:

- silently update ephemeris files
- download ephemeris files on startup
- download ephemeris files during request handling
- download ephemeris files during tests
- use an unpinned ephemeris directory for production calculations.

## Ephemeris fingerprint

Every chart snapshot must include `ephemeris_fingerprint`.

Examples:

```text
swiss-sepl-18-sha256-...
jpl-de440s-sha256-...
mock-v1
```

## Runtime restrictions

Production service must not:

- silently update ephemeris files
- download kernels/files on startup or during request handling
- switch calculation profile without version bump
- overwrite historical chart snapshots

## PR18 runtime guard

The Swiss Ephemeris adapter is available only through `services/astro-calc/app/engines/swisseph.py` and is selected with `ASTRO_ENGINE=swisseph`.

Required environment:

```text
ASTRO_ENGINE=swisseph
ASTRO_EPHEMERIS_PATH=/mounted/ephemeris/path
SWISSEPH_LICENSE_MODE=free|professional
```

Production requires:

```text
NODE_ENV=production
SWISSEPH_LICENSE_MODE=professional
ASTRO_EPHEMERIS_PATH=/mounted/ephemeris/path
ASTRO_EPHEMERIS_MANIFEST_PATH=/mounted/ephemeris/ephemeris-manifest.json
ASTRO_REQUIRE_PINNED_EPHEMERIS=true
```

If any production requirement is missing, the adapter fails closed before calculation. Free/license-unclear modes are local/test only and still require an explicit ephemeris path. Ephemeris files must be pinned, fingerprinted, manifest-verified, and provided by deployment artifact or mounted storage; the service must not download ephemeris files at runtime.

## Calculation profile versioning

A change in any of these must create a new calculation profile version:

- engine
- engine version
- ephemeris source
- ephemeris file/fingerprint
- zodiac type
- ayanamsha
- house system
- node type
- apparent/mean position mode
- geocentric/topocentric mode

## Decision record template

Use this when making the production engine decision:

```text
Decision date:
Owner:
Selected strategy:
Libraries:
License reviewed by:
Production allowed: yes/no
Ephemeris files:
Calculation profiles affected:
Risks:
Rollback plan:
```

## Open decision

Current default for engineering bootstrap:

```text
Use mock or clearly documented prototype engine until ephemeris license and calculation strategy are approved.
```
