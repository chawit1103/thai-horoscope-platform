# ASTRO_OPERATOR_RUNBOOK.md — Astro Calculation Operator Runbook

## Goal

Give operators repeatable steps for running, validating, deploying, and rolling back the astro calculation service without production secrets, runtime ephemeris downloads, or accidental binary commits.

## Local validation

Run from the repository root:

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

Expected local defaults:

```text
ASTRO_ENGINE=mock
SWISSEPH_LICENSE_MODE=none
ASTRO_EPHEMERIS_PATH unset
```

Mock mode must work without license mode, ephemeris path, ephemeris binaries, or network access.

## Swiss Ephemeris local/test validation

Use only after confirming local license and file handling are appropriate for the test context.

Required local/test environment:

```text
ASTRO_ENGINE=swisseph
NODE_ENV=test
SWISSEPH_LICENSE_MODE=free|professional
ASTRO_EPHEMERIS_PATH=/local/non-repo/ephemeris/path
```

Rules:

- keep ephemeris files outside the repository
- do not download ephemeris files during tests or request handling
- use only supported Swiss Ephemeris data files (`*.se1` or `*.se2`)
- treat unrelated files as ignored, not as valid ephemeris input
- record the resulting fingerprint when comparing outputs

## Production startup guard

Production Swiss Ephemeris startup must fail closed unless:

```text
ASTRO_ENGINE=swisseph
NODE_ENV=production
SWISSEPH_LICENSE_MODE=professional
ASTRO_EPHEMERIS_PATH=/mounted/ephemeris/path
ASTRO_EPHEMERIS_MANIFEST_PATH=/mounted/ephemeris/ephemeris-manifest.json
ASTRO_REQUIRE_PINNED_EPHEMERIS=true
```

The mounted path must be an approved deployment artifact or controlled storage mount. The service must not fetch files from the network on startup or during request handling.

## Ephemeris file manifest

Before a production candidate is approved, record:

```text
engine:
library:
library_version:
license_mode:
ephemeris_path:
file_manifest:
combined_fingerprint:
calculation_profile_code:
approved_by:
approval_date:
rollback_profile_code:
```

The manifest approval must match the active `ASTRO_CALCULATION_PROFILE`. For a multi-profile file set, use `calculation_profiles`; for a single approved profile, `calculation_profile_code` is accepted. Production and pinned staging health checks fail closed if the active profile is not listed.

Each manifest item should include:

```text
relative_path
size_bytes
sha256
```

Do not record production secrets or raw private birth data in the manifest.

## Production activation smoke check

Run the smoke check in staging before asking for production approval:

```bash
ASTRO_ENGINE=swisseph \
SWISSEPH_LICENSE_MODE=professional \
ASTRO_EPHEMERIS_PATH=/mounted/ephemeris/path \
ASTRO_EPHEMERIS_MANIFEST_PATH=/mounted/ephemeris/ephemeris-manifest.json \
ASTRO_REQUIRE_PINNED_EPHEMERIS=true \
python3 - <<'PY'
from app.main import health
print(health())
PY
```

Expected result: `status` is `ok`, `ephemeris_path_configured` is `true`, and no raw local filesystem path appears in output. If the manifest, fingerprint, license mode, or mounted path is wrong, the service must fail closed with a sanitized error code.

## Golden fixture update procedure

Golden outputs may change only when the reason is known.

1. Identify the changed engine, profile, code, or ephemeris fingerprint.
2. Compare old and new outputs for affected golden cases.
3. Record whether the change is expected.
4. Get astro owner approval.
5. Update fixture files only after approval.
6. Run the full validation commands.
7. Include the approval note and command proof in the PR.

Do not silently update golden files to make tests pass.

## Incident: unexpected calculation drift

Symptoms:

- golden tests fail
- calculation hashes changed unexpectedly
- chart snapshots show a new engine version or ephemeris fingerprint
- users report changed results for the same birth profile and period

Response:

1. Pause new horoscope generation jobs.
2. Preserve existing chart snapshots; do not overwrite historical rows.
3. Record current engine, profile code, and ephemeris fingerprint.
4. Compare against the last approved release candidate.
5. Re-run golden tests in a clean environment.
6. Roll back the astro service or calculation profile if drift is unapproved.
7. Open a follow-up fix with regression evidence.

## Incident: missing ephemeris path or license mode

Expected behavior:

- production startup or calculation fails closed
- no fallback to mock for paid production calculations
- no runtime download attempt

Response:

1. Confirm environment values for `ASTRO_ENGINE`, `NODE_ENV`, `SWISSEPH_LICENSE_MODE`, and `ASTRO_EPHEMERIS_PATH`.
2. Confirm mounted path exists and contains supported files.
3. Confirm file manifest fingerprint matches the approved release candidate.
4. Fix deployment configuration or roll back.
5. Do not bypass the guard by changing license mode without approval.

## Rotate or update ephemeris files

1. Stage the new supported `*.se1`/`*.se2` files outside the repository.
2. Generate a new manifest with names, sizes, SHA-256 hashes, and combined fingerprint.
3. Run the smoke check with `ASTRO_REQUIRE_PINNED_EPHEMERIS=true`.
4. Compare affected golden cases and calculation hashes.
5. Record approval owner/date and rollback target.
6. Roll back by restoring the previous mounted file set and manifest, or set `ASTRO_ENGINE=mock` only for an approved non-production fallback.

## Incident: ephemeris binary committed

Response:

1. Stop the PR or release.
2. Remove the binary from the branch.
3. Confirm no `.se1`, `.se2`, `.sef`, `.bsp`, `.ephe`, or `.eph` files remain in scoped repo paths.
4. Re-run tests that check committed ephemeris-like files.
5. If the binary reached a shared remote, ask a human maintainer whether history cleanup is required.

## Rollback

Rollback must preserve auditability:

- revert the app/service version or deployment image
- revert to the previous calculation profile code
- keep historical chart snapshots unchanged
- stop generation jobs if profile/fingerprint mismatch persists
- document the rollback reason and affected period
