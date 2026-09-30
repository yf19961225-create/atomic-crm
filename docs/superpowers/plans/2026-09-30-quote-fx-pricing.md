# Quote FX Pricing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, persisted Quote-only USD conversion without changing accepted Quote, PI, or Order XLSX output contracts.

**Architecture:** Quote-level columns own FX state and CNY-per-USD rate; Quote-item columns own RMB source price while the existing formal `unit_price` stores the final four-decimal USD result. A pure precise-price helper is shared by the Quote session and item table; conversion and XLSX continue consuming final `unit_price` only.

**Tech Stack:** React/TypeScript, Vitest Browser, Supabase/PostgreSQL, pgTAP, ExcelJS.

**Spec:** `docs/superpowers/specs/2026-09-30-quote-fx-pricing-design.md`

## Global Constraints

- Preview-only. Apply any migration only to `ciwaibtotispazfviims` using the verified Session Pooler route; never use Production, its Supabase project, `crm2.romiku.com`, or Sanity.
- Add exactly the approved three columns. Keep `unit_price numeric(18,4)` as the final commercial price.
- Calculate division before one final four-decimal rounding; never use `parseInt` or binary-float rounding for persisted FX values.
- Quote XLSX remains eight columns and exports saved `item.unit_price`; PI and Order XLSX renderers remain unchanged.
- Preserve current Quote CBM decimal handling and integer Qty/Ctn behavior.

## Review Focus

- A rate of zero, a negative source price, or more-than-allowed decimal scale must not save an invalid Quote price.
- A rate update must change every populated CNY-source row but must leave source-null USD rows untouched.
- Disabling FX or selecting CNY must retain rate/source history and not overwrite the existing final price.
- PI and Order conversion must copy final USD `unit_price` without carrying FX fields or recalculating.
- Quote XLSX must preserve its existing eight-column structure and use only final USD `unit_price`.

### Task 1: Persisted Quote FX schema and precise pricing rules

**Files:** `supabase/schemas/01_tables.sql`, `supabase/migrations/20260930143000_quote_fx_pricing.sql`, `supabase/tests/romiku_core.test.sql`, `src/components/romiku/quotes/quoteWorkflow.ts`, `src/components/romiku/quotes/quoteWorkflow.test.ts`.

- [ ] Write failing unit and pgTAP tests for positive-scale validation, single final four-decimal rounding, and the three approved columns.
- [ ] Implement decimal-string validation/calculation plus the declarative schema and migration.
- [ ] Run the focused unit tests and local pgTAP when available.

### Task 2: Quote edit-session FX controls and dynamic price columns

**Files:** `src/components/romiku/quotes/QuoteFxPricing.tsx`, `src/components/romiku/quotes/QuotePages.tsx`, `src/components/romiku/commercial/CommercialLineItemsTable.tsx`, `src/components/romiku/commercial/commercialLineItems.ts`, `src/components/romiku/quotes/quotes.test.tsx`.

- [ ] Write failing browser tests for FX off, USD conversion, multi-row rate repricing, disable/re-enable behavior, CNY hiding, save/reopen persistence, and CBM regression.
- [ ] Add session-owned Quote FX controls, raw decimal drafts, and Quote-only source-CNY/readonly-USD table cells.
- [ ] Run focused Quote UI tests.

### Task 3: Conversion and fixed-template export regression

**Files:** `src/components/romiku/orders/documents.test.tsx`, `src/components/romiku/quotes/quoteXlsxRenderer.test.ts`, existing conversion SQL only if tests reveal a copy-list change is necessary.

- [ ] Write failing tests that conversion keeps final USD price only and Quote XLSX writes it to Unit Price while no FX column appears.
- [ ] Implement only any missing whitelist/type handling; do not alter Quote XLSX structure or Order/PI renderers.
- [ ] Run conversion, Quote XLSX, Order XLSX, and PI XLSX regressions.

### Task 4: Preview-only validation and release

- [ ] Run complete TypeScript, lint, build, full Vitest, pgTAP, and concurrency checks.
- [ ] Check migration status and target project before applying the new migration through the Session Pooler only.
- [ ] Push `codex/commercial-line-items-v2`, wait for the existing `romiku-crm-prod` branch Preview, and verify its branch-scoped Supabase URL is `ciwaibtotispazfviims`.
