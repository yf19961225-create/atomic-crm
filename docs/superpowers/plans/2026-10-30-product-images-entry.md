# Product images and entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete full image evidence and safe shared image loading, live search and keyboard entry in four document types.
**Architecture:** Reuse candidate image rendering; keep commercial/Packing persistence adapters. Add bounded read-only audit tooling; no data migration.
**Tech Stack:** React, TypeScript, TanStack Query, Vitest browser, Python/Pillow diagnostic tool.
**Spec:** docs/superpowers/specs/2026-10-30-product-images-entry-design.md

## Global Constraints

- Production baseline 6f11b09acae398766c37a0b162370e048e01a6ae; independent branch codex/product-images-entry-workflow.
- No Production deployment, data/env writes, CMS/website changes, migration, or unrelated features.
- Keep historical snapshots first, exact SKU identity, gallery order and existing calculation/persistence semantics.
- Order-linked Packing only locates existing imported items; standalone Packing can select catalog products.
- Never count placeholders, URL presence, blocked responses or incomplete tests as recovered images.

## Review Focus

- Candidate arrays extend asynchronously after the primary fails: do not restart failed URLs (Task 2).
- Escape while search is in flight: must not reopen results (Task 3).
- Product selection awaits packing overlay while input changes: never apply stale selection (Task 3).
- Enter on an existing blank row and IME: no duplicate rows or form submission (Task 4).
- Exact SKU absent but normalized lookalike exists: no borrowed fallback image (Task 2).

### Task 1: Full image audit and reusable read-only tool
**Files:** scripts/audit-product-images.py, scripts/test_audit_product_images.py, docs product-image audit instructions. Evidence outside repository.
**Interfaces:** JSON report keyed by exact SKU, URL evidence, timestamp; full/incremental/cache CLI options; no credentials.
- [ ] Finish ongoing 4,186 URL audit, verify all 267 empty-image products, document blocked/unknown separately.
- [ ] Write Python unittest fixtures for exact mapping, 200 non-image, unsupported shapes, ambiguous SKU, cache freshness and changed-image incremental selection; run RED.
- [ ] Package bounded GET/decode scanner with configurable output, public host allowlist and resumable timestamped cache; test GREEN with `python3 -m unittest discover -s scripts -p 'test_audit_product_images.py'`.
- [ ] Record counts and exceptions, browser-confirm representative blocked responses; commit tool/docs without downloaded product data.

### Task 2: Shared candidate state and document images
**Files:** products/ProductCandidateImage.tsx/test, products/websiteProductImages.ts/test, commercial/OrderProductImage.tsx/test, commercial/CommercialLineItemsTable.tsx/test, packing/PackingItemsGrid.tsx/test; shared exact lookup helper if required.
**Interfaces:** ProductCandidateImage keeps current props plus onExhausted and timeoutMs; OrderProductImage remains compatibility wrapper for document snapshot recovery with exact SKU metadata and website fallback.
- [ ] Add failing tests for timeout, duplicate URLs, async candidates, stale events, all-failed uniform placeholder, valid snapshot priority, exact catalog fallback and lookalike rejection.
- [ ] Run `npm run test:unit:app -- --run src/components/romiku/products/ProductCandidateImage.test.tsx src/components/romiku/commercial/OrderProductImage.test.tsx` (expect RED).
- [ ] Implement shared renderer and display-only snapshot recovery; apply to Quote/PI/Order/Packing without changing saved snapshots.
- [ ] Run targeted image/table/packing tests (expect PASS); commit.

### Task 3: Live lookup
**Files:** commercial/ProductLibraryLookup.tsx/test, products/sanityCatalogSource.ts if abort signal required.
**Interfaces:** preserve ProductLibraryLookup callback/snapshot API; query after 250ms, explicit search immediate, results Portal and shared thumbnails.
- [ ] Add failing tests: automatic query, no-result, IME, Escape in flight, out-of-order responses, selection overlay race, mouse blur protection, valid user fields retained.
- [ ] Run lookup test RED, implement generation guarded search/selection and optional AbortSignal, update thumbnails using Task 2.
- [ ] Run lookup plus commercial/packing tests PASS; commit.

### Task 4: Enter and Packing scope
**Files:** commercial/CommercialLineItemsTable.tsx/test, packing/PackingItemsGrid.tsx/test.
**Interfaces:** commercial advanceVisibleRow reuses next row, never spawns blank duplicates; Packing locator only focuses existing rows when parent.order_id; standalone next-product input remains catalog selector.
- [ ] Write failing tests for unfinished row, repeat/IME, no form submission, textarea newline, candidate priority, linked scope and standalone next lookup focus.
- [ ] Run RED, implement minimum handlers and linked locator using already loaded draft rows; never alter quantity or source allocation behavior.
- [ ] Run commercial/Packing/lookup tests PASS; commit.

### Task 5: Whole-branch verification and Preview
**Files:** progress/evidence report, final tracked release notes only if needed.
- [ ] Run full `npm run test:unit:app -- --run`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run test:pwa-cache`; inspect all failures and skipped tests.
- [ ] Independent whole-branch review; fix material findings with failing regression tests.
- [ ] Commit exact candidate; verify Preview branch URL/key scope, deploy Preview only, confirm version.json and crm-build.
- [ ] Four document real input/select/Enter/save/reopen/refresh paths using identified temporary QA records; prove exact image identity, no Prod requests, no Sanity writes.
- [ ] Controlled cleanup; report full audit categories/unknowns, screenshot evidence, tests and SHA; stop for Production authorization.
