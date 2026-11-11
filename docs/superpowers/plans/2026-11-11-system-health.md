# ROMIKU system health implementation plan

> Execution: native coordinator plus isolated domain audits using dispatching-parallel-agents. Each change requires evidence and targeted regression.

**Goal:** Audit A–J against Production 68540bb2, fix proven safe issues and deliver an isolated Preview with explicit pending database changes.
**Architecture:** Preserve current UI/data APIs; fix source predicates in local SQL only until remote migration approval. Ordinary frontend safeguards follow existing patterns. No financial facts or Production writes.
**Tech Stack:** React/TypeScript/Vitest/Playwright/Postgres/pgTAP.
**Spec:** User attachment efc236b1-0bfc-4d74-aaa4-9fb046492281/已粘贴的文本.txt.

## Constraints
- Production read-only; Preview QA identities/records only for writes.
- No remote migration, RLS, GRANT or RPC changes without separate approval.
- No new backups, passwords, SMTP, Namecheap or new Vercel projects.
- Preserve all existing financial facts and independent customer/deposit confirmation.
- Never label unexecuted acceptance PASS; reuse unaffected prior evidence explicitly.

## Review focus
- Completed/delivered/payment-awaiting orders must not produce delivery tasks even with null actual_delivery_at.
- Explicit unconfirmed differs from missing/unknown confirmation; currency totals and archived exclusions must stay separate.
- Delayed detail queries must not allow editable empty snapshots.
- Fractional export quantities require numeric cell values and readable formats without template layout changes.
- Disabled/anonymous/no-sales identities must not bypass REST/RPC write controls.

## Work packages
- [x] Verify Production SHA and clean linked worktree; create codex/system-health-20261111.
- [ ] A/B: review schemas/03_views.sql,30_workbench_actions.sql, refresh hooks and workflow labels; reproduce delivery state matrix and confirmation exclusions in dedicated pgTAP file; amend current schema plus standalone unexecuted migration; test legacy/new consumers and financial independence.
- [ ] C/D/H: audit receipt totals, override invalidation, production revision/grouping, inquiry idempotency and reminder lifecycles; run relevant tests and document evidence.
- [ ] E/F/G/J: reproduce PI/order loading race and fractional XLSX formats; patch proven frontend defects with targeted tests; audit packing/save boundaries without new rules.
- [ ] I: dedicated local role matrix for three denied identities and two active users across modules; produce smallest local-only permission proposal and SQL tests.
- [ ] Execute full frontend suite, typecheck/lint/build/PWA and local affected SQL/concurrency. Preserve baseline failures/skips.
- [ ] Read-only live schema/ledger verification using existing authenticated tools; if unavailable, record limitation instead of requesting passwords.
- [ ] Deploy exact frontend candidate to existing isolated Preview, ensure target ref ciwaibtotispazfviims, real browser QA only; server fixes pending migration must remain pending remotely.
- [ ] Consolidate A–J matrix, P0/P1/P2 evidence, before/after, files/full diff, SQL hashes, test evidence, Preview URL/SHA, QA residuals and one authorization request for database fixes. Stop before Production.
