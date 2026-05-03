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
5. Do not download ephemeris files at runtime in production.
6. Add golden-file regression tests.
7. Add license approval record.

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
- download kernels/files during request handling
- switch calculation profile without version bump
- overwrite historical chart snapshots

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
