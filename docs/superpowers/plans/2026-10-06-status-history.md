# Unified status history implementation plan

> **For agentic workers:** Use superpowers:executing-plans. Execute in this existing worktree.

**Goal:** Transactional status timestamps and append-only history for seven existing workflows, with compact history UI and Inquiry/Quote ages.
**Architecture:** A BEFORE trigger maintains status_changed_at; an AFTER trigger exclusively inserts history for create or actual transitions, and cleans it on a successful header delete. Batch RPC supplies transaction-local batch context, restoring it afterwards. RLS checks the parent through the existing invoker workflow view. No frontend audit writes.
**Tech Stack:** PostgreSQL/Supabase, React Query, ra-core, Vitest, pgTAP.
**Spec:** User attachment d40d6997-99a4-41e9-966e-ff7b15c72f88/已粘贴的文本.txt.

## Audit and decisions
- Seven tables have generic romiku_audit updated_at (clock_timestamp on every edit), not a status timestamp. Existing procurement history, financial void auditing and business history are separate concepts, not reusable status ledgers.
- Direct authenticated updates, detail edits, Production workbench RPC, financial Order void RPC and invoker batch RPC coexist: triggers cover them all without revoking existing editing APIs.
- Existing aa_normalize_workflow_status runs before the new zz_status_timestamp trigger. History runs AFTER constraints and final normalized status.
- Seven whitelisted kinds; history source create/manual/batch/system/migration/conversion. Existing conversion creates a new independent document (create); no new upstream transition is introduced.
- Historical baseline uses migration transaction time, unchanged business status, NULL actor, source migration. No guessed historical date.
- Timestamp is server-owned, cannot be forged by body fields even on unrelated updates. Query view joins sales for readable actor under RLS, falling back to a generic user label without UUID.
- Header AFTER DELETE cleanup is part of controlled deletion's transaction and covers Order child cascade and bulk RPC paths. A rejected or rolled-back delete preserves history.
- Existing SELECT * totals/summary views have fixed stored projections. Refresh their definitions with the new column appended, preserving existing names/order/dependents.
- Details: one reusable collapsed StatusHistoryPanel, 20 entries per server page, stable changed_at/id ordering; Query invalidation covers all mutations. Inquiry and Quote state cells show duration without new columns. Times use Asia/Shanghai, elapsed ages calculated live.

## Global constraints
- Preview ciwaibtotispazfviims only; branch codex/commercial-line-items-v2; existing romiku-crm-prod project.
- Payment, five XLSX renderers/templates, barcode/marking, Production environment and Sanity remain unchanged.
- No arbitrary SQL/table inputs, anon access, client history writes, guessed historic state dates, or status-history search indexing.
- Do not commit .gitignore, .vitest-attachments, output.

## Review focus
- Failed status update/partial bulk success must never leave phantom histories.
- Stale status aliases and same-state saves must not reset durations.
- Nested batch context must not leak into subsequent manual changes.
- RLS must hide histories of hidden/deleted parents and must not expose actor UUIDs.
- Refresh with more than 20 entries must not duplicate/skip entries after a new change.

## Tasks
- [x] DB red tests: create/change/no-op/unrelated writes, server timestamps, repeated transitions, actor/source, batch failures/context, permissions/RLS, controlled delete/block/rollback, migration baseline, Production allocation, Payment isolation.
- [x] Implement supabase/schemas/18_status_history.sql, seven timestamp columns, batch context, totals view projections, one migration 20261006170000_status_history.sql. Run local pgTAP.
- [x] Add shared StatusHistoryPanel.tsx and StatusAge.tsx with resource-scoped labels, actor names, migration wording, default collapse, paginated load more and refresh tests.
- [x] Integrate seven detail panels and Inquiry/Quote ages. Invalidate caches on detail save as well as inline/batch; no export logic changes.
- [x] Full frontend, pgTAP, typecheck, lint, build; final review. Apply verified migration transactionally to Preview with original-value hashes and Preview pgTAP.
- [ ] Push current branch, inspect matching Preview deployment/public env, browser QA of real state persistence/history/age, repeated states, Production/Packing. Report final evidence.

Ruling: Batch source is shared, but each row uses its actual post-lock update time (monotonic per record). A batch-start timestamp can predate concurrent writes and corrupt duration/order. Added a regression with an earlier batch marker.

## Verification ledger
- Full local pgTAP: 943 assertions pass, all fixtures rolled back.
- Full frontend: 1010 passed, 2 skipped. Typecheck/lint/build exit 0.
- Independent read-only review: concurrency timestamp issue fixed; follow-up review clean.
- Preview migration `20261006170000_status_history.sql` committed successfully to ciwaibtotispazfviims. 78 historical headers received migration baselines; original values (including status) verified unchanged. Preview pgTAP: 810/810 pass.
- Branch pushed. Code deployment `1eb1bd45e206db771dddc5061cada3017a881625` READY, target Preview. Branch-scoped VITE_SUPABASE_URL verified as https://ciwaibtotispazfviims.supabase.co.
- Actual browser: Inquiry WI-000163 pending_screening → pending_contact → pending_quote → customer_no_reply; duration resets immediately and four history rows persisted. Quote RFQ261006030 retained create plus all five transitions, including repeated following_up. Production OD261006013-P01 retained create/pending_send → scheduled → received. Packing PL-000162 retained draft → incomplete → draft → completed → sent. Read-only DB verification confirmed exact histories and every status_changed_at equals latest history timestamp; Production allocation remains 10 assigned / 90 unallocated.
- Actual browser pagination: RFQ261006031 loaded 20 then 25 history entries, with Load More disappearing after the last page.
- Browser QA discovered an existing pristine detail-form stale-cache issue after inline status changes. Fixed form synchronization while preserving dirty edits; regression demonstrated red then green. Full final suite includes the new regression.
- Remaining browser checks are BLOCKED: auto-review failed due selected-model capacity, preventing further Preview browser access. This is a review-service failure, not a determination of unsafe action. No browser workaround attempted. Latest stale-form fix browser retest, PI/Order/Outbound detail smoke, migration baseline wording, unrelated-field/no-op UI save and batch-source UI verification remain unverified manually; automated coverage passes. Packing transitions were persisted and DB-verified, but final expanded panel recheck was interrupted.
- No Payment, XLSX renderer/template, barcode or marking files changed. Production Supabase/Vercel, crm2.romiku.com and Sanity untouched.
