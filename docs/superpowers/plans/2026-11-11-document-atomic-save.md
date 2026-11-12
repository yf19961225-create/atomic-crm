# Four-document atomic save implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkboxes for tracking.

**Goal:** Atomically save Quote, PI, Order and Packing, preserving business calculations and rejecting duplicate/conflicting writes.

**Architecture:** One allowlisted transaction RPC, durable actor-scoped request journal, document revisions and coherent snapshot reads. Explicitly reject legacy unversioned direct writes; retain trusted existing business RPCs with revision updates. Frontend keeps exact pending intent and queries its result before a user-requested retry.

**Tech Stack:** Existing PostgreSQL/Supabase, React, ra-core, Vitest/browser.

**Spec:** User's 2026-11-11 four-document transactional reliability authorization; `docs/reviews/system-health-20261111/document-save-followup.md` and the prior 36-case PostgreSQL prototype.

## Global constraints

- Local code and isolated local database only; remote migration requires separate approval.
- Preserve numbering, decimal arithmetic, source links, financial/packing constraints, RLS and audit.
- No automatic financial retries; no database or Storage rollback claims beyond actual transaction boundary.
- Existing eight baseline auxiliary failures remain reported; no removed assertions or new skips.

## Review focus

- Legacy clients and trusted conversions must not silently overwrite newer document edits.
- Snapshot/header/item reads must be coherent; fresh revision must never be attached to stale draft.
- Lost responses, refresh and user/account switching must retain and scope request identity.
- Packing multiple-list allocation races and deletion-before-insertion ordering must preserve capacity.
- Permissions and transaction failure must not leave numbering, request journal or temporary grants partially committed.

## Tasks

- [x] Audit actual commercial and packing create/edit/inline/conversion callers and existing constraints.
- [x] Add failing actual PostgreSQL tests for rollback, replay, payload mismatch, revisions, permissions and legacy writers.
- [x] Implement new incremental migration and matching declarative schema; verify owner, ACL and local migration cleanup.
- [x] Add typed client save/snapshot/result protocol, durable pending intent and fail-closed error handling; test lost response/reload/mismatch/concurrent calls.
- [x] Integrate Quote/PI/Order and Packing without altering calculations, field allowlists or source rules; test real components.
- [x] Run two-connection local races and all affected SQL regressions, complete frontend tests, typecheck, lint, build and PWA.
- [x] Read-only compare actual Preview Ledger/schema; prepare exact SQL hashes, object/permission diff, compatibility rollback and QA plan.
- [x] Review complete diff, commit verified candidate and report explicit remote-migration approval boundary.
