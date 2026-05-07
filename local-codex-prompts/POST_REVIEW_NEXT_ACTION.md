# Prompt: Decide Next Action After Codex Review

You are deciding the next step after Codex GitHub review.

## Input

Paste the latest Codex review output.

## Task

1. Determine whether findings are new or old.
2. Determine if the reviewed commit is the current PR HEAD.
3. Classify each finding as P0/P1/P2/P3.
4. Decide:
   - fix now
   - defer to follow-up
   - false positive with rationale
   - needs human decision
5. If fix now, produce a precise Codex App local prompt.
6. If no major issues, produce final merge checklist.

## Rules

```text
- P0/P1 must not be merged unresolved.
- Critical P2 must be fixed before merge if it touches security/privacy/payment/notification/calculation integrity.
- Old review comments should not block merge if HEAD review is clean.
- Do not trust “Ready to merge” alone.
```

## Output format

```text
Status:
- Ready to merge / Fix required / Human decision required

Findings:
- ...

Recommended action:
- ...

Prompt/comment to use:
...
```
