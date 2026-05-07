# Prompt: Fix Review Findings Locally

You are fixing review findings locally on the existing PR branch.

## Input

Paste the review findings below this prompt.

## Task

1. Read the current branch and diff.
2. Classify findings:
   - P0: must fix
   - P1: must fix
   - P2: fix if security/privacy/idempotency/data-integrity/user-facing delivery
   - P3: may defer
3. Fix P0/P1 and critical P2.
4. Keep changes limited to the current PR scope.
5. Add regression tests for each fixed finding.
6. Search for adjacent instances of the same risk class.
7. Run:
   - pnpm install
   - pnpm lint
   - pnpm typecheck
   - pnpm test
   - Python tests if relevant
   - git diff --check
8. Commit and push to the existing PR branch.
9. Produce the next `@codex review HEAD` comment.

## Stop conditions

Stop and ask for human guidance if:

```text
- fix requires product/business decision
- fix changes PR scope
- same issue class has already been fixed twice
- production credentials/license decisions are needed
- Swiss Ephemeris license decision is needed
- production ephemeris files or secrets are required
- fix requires committing large binary ephemeris files
- tests fail and root cause is unclear
```

## Additional checklist for Astro / PR18 / Python astro-calc findings

Apply this section only when review findings touch `services/astro-calc`, astro calculation, ephemeris, Swiss Ephemeris, ayanamsa, natal/transit/solar return/hourly timing, or chart snapshot schemas/contracts.

Checks:

```text
- Run Python tests from services/astro-calc with python3 -m pytest, or uv run pytest if uv is already configured.
- If Python lint/type tools already exist, run them, for example ruff and mypy. Do not add new tooling just for this prompt.
- No runtime ephemeris downloads.
- No ephemeris binaries committed, including .bsp, .se1, .se2, .bin, .dat.
- No production Swiss Ephemeris enablement unless SWISSEPH_LICENSE_MODE=professional.
- Fail closed when ephemeris path is missing, empty, or contains no supported files.
- calculation_hash must be deterministic and must include engine/profile/ephemeris/ayanamsa metadata.
- Error messages must be sanitized and must not leak raw birth date, birth time, location, or user input.
- Unknown birth time must not overclaim ascendant/houses/timing precision.
- Hourly timing, solar return, and transit outputs must propagate relevant warnings.
- Chart snapshot schema/contracts must include emitted warning codes.
```

## Never do these

```text
- Never merge
- Never deploy
- Never commit secrets
- Never commit .codex/
- Never add real provider calls in tests
```

## Review findings

<PASTE_REVIEW_FINDINGS_HERE>

## Output format

```text
Findings fixed:
- ...

Files changed:
- ...

Tests added/updated:
- ...

Commands run:
- ...

Tests run:
- ...

Risks:
- ...

Commit:
- ...

Next review comment:
@codex review HEAD of this pull request branch...
```
