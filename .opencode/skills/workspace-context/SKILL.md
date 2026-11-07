---
name: workspace-context
description: Use for work that depends on this project's durable decisions, conventions, constraints, or Gartrol handoff rules.
---

# Workspace Context

1. Read `AGENTS.md` and `memory.md` before planning.
2. Inspect current repository state and preserve user work.
3. Check Gartrol workspace readiness and the active mission.
4. Claim a routed, dependency-ready card before editing.
5. Read the card checkpoint and Git state before resuming; update the single rolling checkpoint after commits, decisions and tests, and before long operations or handoff.
6. Keep checkpoints concise (target 6,000 characters; maximum 12,000) and exclude credentials, lease tokens, raw transcripts and copied logs.
7. Keep the lease alive while working. When implementation and evidence are ready, deliver before waiting for pull-request review or merge; never keep or pause an attempt solely to await review. Leave validation to a human.
8. Before committing, use `type(scope): imperative summary` with a mandatory stable project scope.
9. Use `main` as the only trunk; keep topic branches short-lived and incomplete work behind feature flags.
10. Treat one pull request as one coherent delivery; batch related micro-adjustments and preserve atomic commits.
11. Run targeted checks while iterating and the required full gate once before integration; require human review for high-risk changes.
12. Pass multiline pull-request Markdown with `gh --body-file` and verify it after publication.
13. Update memory only with durable, non-secret facts.
