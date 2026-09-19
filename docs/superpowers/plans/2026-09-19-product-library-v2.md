# Product Library V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Product Library's Supabase-only home with a complete,
read-only, Chinese-first Sanity product catalog and per-product Supabase
procurement overlay.

**Architecture:** The browser queries the public Sanity catalog with a
parameterized, cursor-based read-only source. Once a page of 50 catalog
products is available, an independent Supabase overlay loader batches only
the relevant Extension, Supplier, and current-cost rows. The Drawer makes
Sanity fields read-only and writes only the existing CRM procurement tables.

**Tech Stack:** React, TypeScript, React Admin/ra-core, TanStack Query where
already used by the CRM, Supabase REST data provider, public Sanity GROQ API,
Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-19-product-library-v2-design.md`

## Global Constraints

- Sanity target is exactly `gxuvcyaa`, dataset `production`, API version
  `2025-07-05`; all Sanity requests are anonymous HTTP `GET` reads.
- Sanity is the only Product Master; do not create a Supabase product catalog,
  cache table, migration, or Sanity write capability.
- Default catalog excludes drafts and products where `isPublished != true`.
- Product identity is verified `sanity_product_id` plus original SKU; do not
  normalize or translate either persisted value.
- Preserve existing Quote, PI, Order, and Website Inquiry snapshot logic.
- Do not modify Production, deploy, or run write smoke tests until separately
  authorized.

## Review Focus

- Empty, duplicated, and punctuation-containing SKUs must remain distinct and
  page exactly once across a cursor walk.
- A Supabase failure after Sanity succeeds must not hide catalog products.
- A note on a product without an Extension must create only the minimal CRM
  Extension and must never issue a Sanity write.
- A first ProductSupplier must work without an Extension because no Extension
  FK exists in the current schema.
- Legacy procurement rows linked only by SKU must still overlay the matching
  Sanity product while new rows prefer `sanity_product_id`.

## File structure

- Create: `src/components/romiku/products/sanityCatalogSource.ts` — types,
  query construction, cursor encode/decode, and read-only fetch implementation.
- Create: `src/components/romiku/products/sanityCatalogSource.test.ts` — GROQ,
  mapping, cursor and full-walk tests.
- Create: `src/components/romiku/products/productDisplay.ts` — Chinese-first
  field formatting without source mutation.
- Create: `src/components/romiku/products/productDisplay.test.ts`.
- Create: `src/components/romiku/products/productProcurementOverlay.ts` —
  batched CRM read mapping and identity grouping.
- Create: `src/components/romiku/products/productProcurementOverlay.test.ts`.
- Create: `src/components/romiku/products/SanityCatalogList.tsx` — filter,
  search, states, list/card and cursor controls.
- Create: `src/components/romiku/products/SanityCatalogList.test.tsx`.
- Create: `src/components/romiku/products/SanityProductDrawer.tsx` — read-only
  master detail and editable procurement panel.
- Create: `src/components/romiku/products/SanityProductDrawer.test.tsx`.
- Modify: `src/components/romiku/products/ProductLibrary.tsx` — install the
  Catalog home and move legacy lists to internal procurement management.
- Modify: `src/components/romiku/products/productSourcing.ts` — preserve the
  verified Sanity identity on new supplier writes and add minimal Extension
  upsert helpers.
- Modify: `src/components/romiku/products/productSourcing.test.ts`.
- Modify: `src/components/romiku/products/ProductForms.tsx` and input
  components — accept fixed verified identity when invoked from the Drawer.
- Modify: `src/components/romiku/products/index.ts` — export V2 components.
- Test: existing Sanity lookup and procurement tests plus new product tests.

### Task 1: Establish the read-only catalog contract

**Files:**
- Create: `src/components/romiku/products/sanityCatalogSource.ts`
- Test: `src/components/romiku/products/sanityCatalogSource.test.ts`

**Consumes:** `romikuSanityConfig` in `romikuSanityProductSource.ts`.

**Produces:**

```ts
export type CatalogFilter = {
  search: string;
  includeUnpublished: boolean;
  after?: { skuSort: string; id: string };
};
export type CatalogPage = {
  products: SanityCatalogProduct[];
  nextCursor?: { skuSort: string; id: string };
};
export const createSanityCatalogSource: () => {
  getPage(filter: CatalogFilter): Promise<CatalogPage>;
};
```

- [ ] Write a failing mapping test for `005` covering image, multilingual
  name, category, parameters, MOQ, packaging and carton quantity.
- [ ] Write failing query tests asserting: anonymous GET endpoint; projection;
  excluded drafts; default `isPublished == true`; parameterized SKU/name/category
  search; and no mutation method.
- [ ] Write a failing full-walk test with 1,801 published fixture records,
  including null SKU, duplicate SKU and `A/01 & B` SKU. Assert cursor pages
  produce each `_id` once, in `(skuSort, _id)` order, with no gap or duplicate.
- [ ] Implement `buildCatalogQuery`, `mapCatalogProduct`, cursor validation,
  and `getPage`. Request 51 results and emit at most 50 plus the next cursor.
- [ ] Run `npm run test:unit:app -- src/components/romiku/products/sanityCatalogSource.test.ts`;
  expect all catalog source tests to pass.
- [ ] Commit: `feat: add read-only Sanity catalog source`.

### Task 2: Add Chinese-first presentation helpers

**Files:**
- Create: `src/components/romiku/products/productDisplay.ts`
- Test: `src/components/romiku/products/productDisplay.test.ts`

**Produces:**

```ts
export const productPrimaryName = (product: SanityCatalogProduct): string;
export const productSecondaryName = (product: SanityCatalogProduct): string | undefined;
export const localizedProductValue = (value: Record<string, string> | undefined): string | undefined;
```

- [ ] Write failing tests for Chinese-first name, English auxiliary name,
  Drawer Spanish availability, and the documented fallback order.
- [ ] Implement pure display helpers; do not mutate a product or translate any
  persisted Sanity data.
- [ ] Run `npm run test:unit:app -- src/components/romiku/products/productDisplay.test.ts`;
  expect pass.
- [ ] Commit: `feat: add Chinese-first product display helpers`.

### Task 3: Build a read-only procurement overlay loader

**Files:**
- Create: `src/components/romiku/products/productProcurementOverlay.ts`
- Test: `src/components/romiku/products/productProcurementOverlay.test.ts`

**Consumes:** `SanityCatalogProduct`, authenticated existing Supabase data
provider, `romiku_product_extensions`, `romiku_product_suppliers`,
`romiku_suppliers`, and `romiku_current_reference_cost`.

**Produces:**

```ts
export const loadProductProcurementOverlay = (
  products: SanityCatalogProduct[],
  client: ProductOverlayClient,
) => Promise<Map<string, ProductProcurementOverlay>>;
```

- [ ] Write failing tests for an ID-linked Extension, a legacy SKU-only
  Supplier row, two Suppliers with one preferred Supplier, and current costs.
- [ ] Write a failure-isolation test: rejected overlay loader returns an
  overlay error state but retains the supplied catalog array unchanged.
- [ ] Implement three batched reads constrained to the current page's IDs and
  SKUs; do not query or write an all-products copy.
- [ ] Group by verified Sanity ID first and SKU only as legacy fallback. Do
  not associate an ambiguous legacy duplicate SKU automatically; flag it as
  unavailable procurement data for that catalog row.
- [ ] Run `npm run test:unit:app -- src/components/romiku/products/productProcurementOverlay.test.ts`;
  expect pass.
- [ ] Commit: `feat: add procurement overlay loader`.

### Task 4: Render the catalog with independent failure states

**Files:**
- Create: `src/components/romiku/products/SanityCatalogList.tsx`
- Test: `src/components/romiku/products/SanityCatalogList.test.tsx`
- Modify: `src/components/romiku/products/ProductLibrary.tsx`

**Consumes:** Tasks 1–3.

- [ ] Write failing UI tests for default published filter, search by Chinese,
  English, Spanish, SKU and category, inclusion of an unpublished item only
  after opt-in, next-page navigation, and Chinese-first primary labels.
- [ ] Write failing UI tests for separate states: Sanity request error, no
  search matches, and successful catalog plus failed overlay.
- [ ] Implement debounce/cancellation for search, reset cursor on filter
  changes, 50-row stable page controls, and a retry that targets the failed
  source only.
- [ ] Render cards/table rows even if overlay is unavailable; mark only
  supplier/cost/note cells unavailable.
- [ ] Make 产品目录 the first and default Product Library tab. Preserve the
  three old Supabase lists under 内部采购管理.
- [ ] Run `npm run test:unit:app -- src/components/romiku/products/SanityCatalogList.test.tsx`;
  expect pass.
- [ ] Commit: `feat: make Sanity catalog the product library home`.

### Task 5: Implement read-only master Drawer and first-write behavior

**Files:**
- Create: `src/components/romiku/products/SanityProductDrawer.tsx`
- Test: `src/components/romiku/products/SanityProductDrawer.test.tsx`
- Modify: `src/components/romiku/products/productSourcing.ts`
- Modify: `src/components/romiku/products/productSourcing.test.ts`
- Modify: `src/components/romiku/products/ProductForms.tsx`
- Modify: `src/components/romiku/products/ProductExtensionInputs.tsx`
- Modify: `src/components/romiku/products/ProductSupplierInputs.tsx`

**Interfaces:**

```ts
export const ensureMinimalProductExtension = (
  identity: { sku: string; sanityProductId: string },
  existing?: { id: string },
) => { sku: string; sanity_product_id: string };

export const toProductSupplierWrite = (
  values: ProductSupplierWrite,
) => ProductSupplierWrite;
```

- [ ] Write failing transform tests that retain verified
  `sanity_product_id` for a new ProductSupplier without changing SKU.
- [ ] Write failing Drawer tests: source master fields have no editable form
  controls; note save on a Sanity-only product creates an Extension with only
  SKU, `sanity_product_id`, and submitted note; supplier save works with no
  Extension and has the verified identity; no mocked Sanity request uses a
  non-GET method.
- [ ] Implement the read-only master section and isolated procurement section.
  Do not render generic product-master create/edit operations.
- [ ] On note save, look up the Extension, then create it only if absent;
  resolve unique conflict by re-fetching and applying the note update. On
  Supplier save, create/update only `romiku_product_suppliers`.
- [ ] Preserve Cost History's existing ProductSupplier parent requirement.
- [ ] Run `npm run test:unit:app -- src/components/romiku/products/productSourcing.test.ts src/components/romiku/products/SanityProductDrawer.test.tsx`;
  expect pass.
- [ ] Commit: `feat: add product procurement drawer`.

### Task 6: Wire, regress, and audit read-only boundaries

**Files:**
- Modify: `src/components/romiku/products/index.ts`
- Test: relevant existing `SanityProductLookup.test.tsx` and new product tests
- Test: route/layout tests where Product Library navigation is asserted

- [ ] Export V2 components without changing Quote, PI, Order, or Website
  Inquiry modules.
- [ ] Add a boundary test that searches product source code/request mocks for
  Sanity catalog requests and asserts every one is GET with no authorization
  token or mutation endpoint.
- [ ] Run focused product tests, existing snapshot-related tests, typecheck,
  lint, and build under Node 22.
- [ ] Run local Playwright authenticated smoke: product catalog default,
  `005` lookup, Chinese search, next-page traversal, unpublished toggle,
  no-Extension Drawer, overlay failure state, and a mocked/no-write Sanity
  request audit. Do not use Production credentials or create Production data.
- [ ] Perform independent code review against the spec's boundaries and
  acceptance criteria.
- [ ] Commit any verification-only fixes separately; do not deploy.
