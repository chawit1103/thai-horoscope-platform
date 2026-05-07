# AGENTS.md Appendix — Codex Automation Rules

Paste this section into the root `AGENTS.md`.

## Codex automation rules

Before implementing any PR, read:

```text
docs/CODEX_AUTOMATION_RUNBOOK.md
docs/PR_WORKFLOW.md
docs/STOP_LOSS_RULES.md
docs/HIGH_RISK_PR_CHECKLIST.md
```

### Required workflow

For every PR:

```text
1. Sync main.
2. Create/switch to the target branch.
3. Read relevant docs.
4. Implement only the requested scope.
5. Self-review against high-risk checklist.
6. Run pnpm install/lint/typecheck/test.
7. Run Python tests if Python service is touched.
8. Run git diff --check.
9. Check for secrets, .env, .codex, large binaries, real provider calls in tests.
10. Commit and push only after tests pass.
11. Produce PR title, description, review prompt, risks, and test proof.
```

### Never do these

```text
- Never merge PRs.
- Never deploy production.
- Never commit production secrets.
- Never commit .env files.
- Never commit .codex local config.
- Never send real LINE/email/payment calls in tests.
- Never store card data.
- Never download ephemeris files at runtime.
- Never commit large ephemeris binaries.
```

### Stop-loss

If review/fix loops exceed 2 rounds:

```text
Stop narrow patching. Run a full-module hardening pass or ask for human guidance.
```

### High-risk PRs

For auth, privacy, payment, webhooks, notifications, audit logs, or astro calculation integrity:

```text
- run self-review before opening PR
- add negative tests
- fail closed on missing secrets/signatures/config
- do not trust client/caller input for auth, payment, or idempotency
- document production limitations
```
