# ROMIKU CRM 2.0 — Atomic Baseline Exception

## Fixed baseline

- Atomic CRM upstream commit: `a863e2a084fae8c7adf7a2efc547ad7ce38e699b`
- Node.js: `v22.23.2`
- npm: `10.9.8`
- Local repository baseline: no ROMIKU business code, schema, or dependency-lock changes.

## Test result

Running `make test` on this fixed baseline produced:

- 560 tests total
- 553 passed
- 1 skipped
- 6 failed

Every failure is in Atomic CRM's upstream `.claude` worktree/session harness. They were present before any ROMIKU business change:

1. `.claude/hooks/test/cleanup-worktree.test.mjs` — `cleanup-worktree removal semantics > fresh worktrees (no commits) are preserved`
2. `.claude/hooks/test/cleanup-worktree.test.mjs` — `cleanup-worktree removal semantics > unmerged commits are preserved`
3. `.claude/hooks/test/cleanup-worktree.test.mjs` — `cleanup-worktree removal semantics > merged but dirty worktree is preserved`
4. `.claude/hooks/test/cleanup-worktree.test.mjs` — `cleanup-worktree removal semantics > merged clean worktree is removed, branch deleted, fresh sibling kept`
5. `.claude/hooks/test/setup-worktree.test.mjs` — `setup-worktree session-branch topology (PreToolUse/Agent) > idempotent second run exits 0 and keeps the worktree`
6. `.claude/hooks/test/cleanup-session.test.mjs` — `cleanup-session > removes the session worktrees, base dir and test-results`

## Scope of the exception

This is a fixed upstream baseline exception, not a general waiver. ROMIKU must not modify Atomic's `.claude` harness merely to make `make test` green.

Any change in the count, file, test name, or failure reason of these six failures is a new regression and must be investigated. Any other test failure is a regression and blocks the applicable task or acceptance gate.

## Upstream baseline warnings

`make lint` and `make build` pass on this baseline, with the following non-blocking Atomic upstream warnings:

- ESLint `.eslintignore` migration warning.
- ra-core/Rollup circular-chunk warnings.
- Bundle-size warning.
- Browserslist/caniuse-lite data-age warning.

These warnings do not currently block Phase 1A. Do not modify Atomic upstream or upgrade dependencies merely to remove them. A material increase in warnings, or any warning that becomes an error, requires separate investigation.
