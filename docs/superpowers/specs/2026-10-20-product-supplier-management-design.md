# Product supplier management design

## Goal and boundary

Make product–supplier operations explicit in Product Library: edit procurement fields without changing supplier identity, replace a supplier while retaining history, remove only an unreferenced relation, and add suppliers to at most the currently loaded catalog page. All writes target CRM `romiku_product_suppliers` in Preview. Sanity remains read-only. Production stays at `8600933d6bf95aa898fb2e8866b6f0ebfb69d1f8` until separately authorized.

## Audited baseline

- `SanityProductDrawer` keeps an editable supplier select. Switching to a supplier with no relation clears `selectedSupplier`; submit then calls `createSupplier`, so the old relation is not replaced.
- `ProductSupplierEdit` is a second edit path whose inputs currently expose `sku` and `supplier_id`.
- `romiku_product_suppliers.id` is the relation identity. `(sku, supplier_id)` is unique. `active` and `preferred` exist; there is no preferred uniqueness constraint in the checked-in schema.
- `romiku_procurement_cost_history.product_supplier_id` has a non-cascading FK to the relation. It is the only checked-in FK referencing that relation. The existing `romiku_preserve_cost_identity` trigger blocks changing SKU, Sanity ID, or supplier ID once cost history exists. No checked-in controlled relation-delete RPC exists at the Production baseline.
- `SanityCatalogList` loads a maximum of 50 products from `getPage`. The source returns `nextCursor`, but the UI ignores it, so only the first page is currently navigable.
- An earlier Preview ledger contains a product-supplier controlled-delete migration absent from the current Production source tree. The new implementation must be self-contained against the stated Production baseline and must inspect Preview schema before applying its own migration. It must not assume that Preview-only migration exists in Production.

## User actions

### Edit procurement information

The drawer's edit action selects a relation by `id` and displays the supplier as fixed text. Editable fields are the existing supplier-specific procurement fields, including item number, MOQ, lead days, preferred, and other fields currently exposed by the separate form. The saved payload never includes `sku`, `sanity_product_id`, or `supplier_id`. The standalone `ProductSupplierEdit` follows the same identity restriction. Cancel restores the loaded baseline; dirty state tracks only actual changes.

### Replace supplier

This is a separate action on an active relation. The user selects a different supplier and may explicitly request that the target become preferred. A server transaction serializes operations for the SKU and rechecks the source and target:

1. If the target already has an active relation for the SKU, return `ALREADY_LINKED` and change nothing.
2. Set the source `active=false` and `preferred=false`.
3. If the target has an inactive relation, reactivate that same row and preserve all of its own procurement fields and cost history. Otherwise insert a new row with the product SKU, verified Sanity ID, target supplier, `active=true`, and no inherited supplier-specific values.
4. If the source was preferred, make the target preferred by default. If the source was not preferred, make the target preferred only if the user explicitly selected that option. Whenever the target becomes preferred, clear preferred from every other relation for that SKU in the same transaction. Otherwise leave another existing preferred supplier unchanged and set the target's preferred flag to false.

The source row and its cost history are never deleted or repointed. Inactive rows remain available in a clearly labeled history section; active catalog summaries and counts exclude them. An inactive target counts as an existing relation for bulk planning, not as a new insert.

### Delete relation

A distinct destructive action opens a confirmation naming the product and supplier. A controlled server function locks the relation and checks all actual FK dependencies before deleting. The audited cost-history FK is mandatory: if any cost row exists, return a dependency count and leave the relation intact. No cascade and no Supplier Master deletion. If dependency-free, delete only that relation. Revoke authenticated direct DELETE on `romiku_product_suppliers` once the controlled function is deployed in Preview.

## Bulk assignment

Each visible catalog row gets a checkbox. The header checkbox selects only currently loaded rows. Search, page change, or a changed result set clears selection. Add previous/next cursor navigation so later pages can be reached; no cross-page selection is implied. The toolbar shows selected count, bulk action, and clear selection.

The dialog permits one or more suppliers and at most one optional preferred supplier from that selection. Its read-only plan shows selected products, selected suppliers, expected new rows, inactive rows to reactivate, active rows to skip, invalid or duplicate SKU rows, and preferred changes. Supplier-specific procurement and packing columns are never bulk overwritten. Reactivation preserves that target row's own values. Empty/invalid SKUs are reported and skipped; duplicates in the page are counted once by exact SKU. The UI uses the exact Sanity SKU with no fuzzy or case-insensitive matching.

Confirm invokes one controlled transaction with a maximum of 50 distinct valid SKUs per call and a bounded supplier count. It locks SKUs in a deterministic order, recalculates the plan, and refuses stale plans before writing. For each SKU and supplier, it inserts missing pairs, reactivates inactive pairs, and leaves active pairs unchanged. A database unique constraint makes retries idempotent. An explicitly selected preferred supplier may change **only** preferred flags on existing rows; item number, MOQ, lead days, packing overrides, notes, reference dates, and cost history remain untouched. If no preferred was chosen, existing preferred flags are retained except an inactive row being reactivated must not silently become preferred.

## Database rules and migration

Preview-only migration adds security-definer functions with fixed search path and authenticated-only execution for edit/preferred, replace, delete, bulk preview, and bulk apply. Inputs are typed IDs and bounded arrays, never table names or SQL fragments. All writes in replace and bulk apply occur in a single transaction. Use a per-SKU transaction lock and deterministic SKU ordering to avoid concurrent preferred and duplicate races.

Add an identity guard that forbids direct changes to the relation's SKU, Sanity ID, or supplier ID regardless of whether cost history exists. Add a partial unique index for at most one **active** preferred relation per SKU, after a read-only Preview preflight checks for existing violations. Do not silently repair conflicts. Preserve the existing `(sku, supplier_id)` unique constraint and the cost-history FK. No table columns, historical documents, or Sanity data change. Align declarative `supabase/schemas` sources with the migration.

If Preview contains a function or grant from its earlier uncommitted product-supplier migration, compare its signature and privileges before applying this migration; do not accidentally weaken it or execute unrelated ledger entries.

## Failure and recovery behavior

Duplicate target, invalid SKU, missing relation, changed plan, cost dependency, and authorization failures return distinct safe codes/messages. A failed transaction changes no rows. The UI refreshes the relevant overlay only after success and preserves unsaved drafts on failure. The plan warns that an explicitly chosen preferred supplier changes preferred status even for an otherwise skipped active relation.

## Verification and release boundary

Test edit without a second row; replacement to new, inactive, and active targets; preservation of both source and reactivated target data and costs; blocked delete with cost history; successful dependency-free delete; page-only selection and paging; bulk counts, skips, reactivation, retries, invalid SKU handling, stale-plan rejection, preferred uniqueness under concurrent calls, and Sanity write count zero. Run relevant UI/SQL tests, full frontend tests, typecheck, lint, build, PWA cache tests, and XLSX regressions. In Preview, use only clearly labeled disposable fixtures, verify actual UI and database outcomes, and clean up only those fixtures. No Production access, migration, deployment, or data write is part of this development task.
