# ASTRO_RELEASE_READINESS_CHECKLIST.md — Astro Validation and Release Readiness

## Goal

Define the gates required before the astrology calculation service can be used for paid production horoscope generation.

PR19 does not approve production Swiss Ephemeris use. It records the readiness evidence required before a human can make that decision.

## Release status

Current state:

```text
Production astrology readiness: not approved
Default engine: mock
Swiss Ephemeris production use: blocked until human/legal license decision
Production ephemeris file set: not approved
Runtime ephemeris downloads: prohibited
Ephemeris binaries in repository: prohibited
```

## Required human approvals

Human approval is required before:

- selecting Swiss Ephemeris commercial/professional strategy
- selecting an alternate production ephemeris engine
- adding or changing production secrets
- mounting or packaging production ephemeris files
- changing privacy, retention, or consent behavior for birth/chart data
- enabling paid production horoscope generation

## Production guard checklist

Before enabling `ASTRO_ENGINE=swisseph` in production:

| Gate | Required evidence | Status |
| --- | --- | --- |
| License mode | `SWISSEPH_LICENSE_MODE=professional` and documented approval owner/date | Pending human/legal approval |
| Ephemeris path | `ASTRO_EPHEMERIS_PATH` points to mounted or packaged read-only files | Pending deployment plan |
| File pinning | `ASTRO_REQUIRE_PINNED_EPHEMERIS=true` and manifest lists supported `*.se1`/`*.se2` files, sizes, and SHA-256 hashes | Pending approved file set |
| Fingerprint | Combined fingerprint is recorded and appears in chart snapshots | Implemented in adapter; production manifest pending |
| No runtime downloads | Startup and request handling do not fetch ephemeris files | Required and covered by tests |
| No committed binaries | Repo contains no `.se1`, `.se2`, `.sef`, `.bsp`, `.ephe`, or `.eph` files in astro/docs/contracts/web astro paths | Required and covered by tests |
| Profile version | Production profile code is explicit, e.g. `TH_NIRAYANA_SWISSEPH_V1` | Implemented as profile code |
| Golden validation | Mock golden fixture is stable; real engine golden fixtures approved after file/license decision | Partially complete |
| Rollback | Operator can revert engine/profile deploy without overwriting historical snapshots | Required before launch |

## Validation checklist

Run all checks before PR handoff and again before release candidate approval:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
cd services/astro-calc && python3 -m pytest
cd services/astro-calc && python3 -m ruff check .
cd services/astro-calc && python3 -m mypy .
git diff --check
```

Required validation evidence:

- deterministic mock golden fixture passes
- unknown birth time warnings remain stable
- timezone conversion covers Asia/Bangkok and DST/non-DST America/New_York
- invalid timezone is rejected and not guessed
- sign boundary and retrograde behavior remain stable
- calculation hash changes when profile or ephemeris fingerprint changes
- Swiss Ephemeris guard fails closed without production license mode and ephemeris path
- Swiss Ephemeris adapter can be tested with an injected fake module
- tests do not require real ephemeris binaries or network downloads

## Release candidate review

An astro release candidate must include:

- the exact calculation profile code
- engine name and version
- ephemeris source and fingerprint
- validation command output
- golden fixture diff summary
- any known limitations from `docs/ASTRO_KNOWN_LIMITATIONS.md`
- operator rollback steps from `docs/ASTRO_OPERATOR_RUNBOOK.md`

## Blockers

Do not launch production astrology calculations when any of these are true:

- `ASTRO_ENGINE=mock` is still used for paid horoscope claims
- `ASTRO_ENGINE=swisseph` is configured without `SWISSEPH_LICENSE_MODE=professional`
- `ASTRO_ENGINE=swisseph` is configured without `ASTRO_EPHEMERIS_PATH`
- production `ASTRO_ENGINE=swisseph` is configured without `ASTRO_EPHEMERIS_MANIFEST_PATH`
- production `ASTRO_ENGINE=swisseph` is configured without `ASTRO_REQUIRE_PINNED_EPHEMERIS=true`
- ephemeris files are not pinned and fingerprinted
- ephemeris manifest fingerprint or file list does not match mounted files
- ephemeris files are downloaded at runtime
- ephemeris binaries are committed to the repository
- real-engine golden fixtures are updated without documented owner approval
- chart snapshots omit engine, profile, or ephemeris fingerprint metadata
- horoscope interpretation prose is generated inside `services/astro-calc`
