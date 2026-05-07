# Prompt: Final Hardening Pass

Use this after more than 2 review/fix loops on the same PR.

You are no longer doing a narrow patch. Perform a full-module hardening pass.

## Target module

```text
Module: <MODULE_NAME>
Files to inspect:
- <FILE_1>
- <FILE_2>
- <TEST_FILE_1>
```

## Goal

Make the module safe, deterministic, and ready for Codex final review.

## Method

1. Identify core invariants for this module.
2. Search code for every violation of those invariants.
3. Fix the class of bug, not only the latest line comment.
4. Add regression tests for each invariant.
5. Add negative tests for bypass/failure cases.
6. Run full tests.
7. Self-review the final diff.

## Standard invariant categories

Check all that apply:

```text
- fail closed on missing signatures/secrets/config
- no caller-controlled auth/role/entitlement
- idempotency before side effects
- duplicate-send prevention
- no cross-user data leakage
- no stale/out-of-order webhook overwrite
- no hardcoded secrets
- no PII/raw secrets in logs/audit metadata
- no real provider calls in tests
- deterministic calculation/hash
- no runtime downloads
- no large binary artifacts
```

## Constraints

```text
- Keep changes limited to this PR/module.
- Do not merge.
- Do not deploy.
- Do not add production secrets.
- Do not add unrelated refactors.
```

## Commands

Run:

```bash
pnpm install
pnpm lint
pnpm typecheck
pnpm test
```

If Python touched:

```bash
cd services/astro-calc && pytest
```

## Output

```text
Invariants checked:
- ...

Bugs fixed:
- ...

Tests added:
- ...

Remaining risks:
- ...

Recommended @codex review prompt:
@codex review HEAD ...
```
