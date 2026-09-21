# Preview Commercial Operations UX Design

## Goal

Improve frequent commercial operations in the Preview-only CRM without changing Production, Sanity, document numbering, document conversion, or historical snapshots.

## Constraints

- All database changes are migration-first and deployed only to `romiku-crm-preview` during this work.
- Formal Customer selection never creates a Formal Customer and preserves `formal_customer_id` plus `counterparty_snapshot`.
- Sanity remains the read-only Product Master. Procurement data remains in Supabase overlays.
- Packing, Production, and documents retain their current source-item and snapshot integrity constraints.

## 1. Shared Formal Customer Combobox

Replace the two-control customer picker with `FormalCustomerCombobox`, used by direct Quote, PI, and Order creation. It queries `romiku_formal_customer_directory` with a debounced server-side `search_text` filter. Results are fetched page by page, so searching is never limited to a prefetched client-side subset. The closed/default state shows the first sorted page; searching shows company, brand, contact, and country/region. Keyboard arrows, Enter, Escape, and the explicit unlinked option are supported.

The selected directory record is converted through the existing `formalCustomerSnapshot` function. The component does not insert or update Formal Customer data.

## 2. Optional Production Supplier

`romiku_production_orders.supplier_id` becomes nullable. The creation workflow validates selected source items and positive quantities, but groups selections with no supplier in a single `unspecified` group. That group is created with `supplier_id` and `supplier_snapshot` null; the UI labels it `未指定供应商`. Existing supplier grouping and `<ORDER_NUMBER>-Pnn` server allocation are unchanged.

Production detail editing gains an optional supplier control. Choosing or clearing it updates both `supplier_id` and the current `supplier_snapshot`; it never recreates a Production document or its item snapshots.

## 3. Packing Grid

Packing detail becomes a dedicated, staged inline-edit grid. The document header continues to own name, batch, packing date, shipping mark, and notes. Rows contain exactly the requested operational columns and are saved explicitly as a batch; Cancel discards staged changes. New rows are seeded from the Order item snapshot and, when available, ProductSupplier procurement packing values.

Quantity, cartons, and quantity-per-carton are independent input values. A mismatch is shown as a non-blocking warning. CBM and total weight are derived display values; persisted packing rows already retain the dimensions and weights from which generated database totals are computed. Product Library changes cannot rewrite saved rows.

## 4. Product Library Compact Catalog

The catalog table becomes an operational procurement view with exactly: image, SKU, carton quantity, carton dimensions, CBM, carton weight, suppliers, and internal note. It joins/read-composes Sanity catalog records with ProductSupplier and ProductExtension overlays without copying Sanity data. Packing values use preferred supplier first, sole supplier second, then Sanity `cartonQty` only for carton quantity. Dimensions and weight render `—` when unavailable.

Supplier labels render the preferred supplier or sole supplier and `+N` when more active suppliers exist. A Drawer retains complete supplier and lower-frequency procurement management. Image preview is an in-page modal closed by Escape or backdrop click.

## Data Changes

Only a nullable Production supplier migration is expected. Existing ProductSupplier columns (`qty_per_carton`, `length_cm`, `width_cm`, `height_cm`, `carton_weight_kg`) and ProductExtension `internal_notes` satisfy Product Library needs. No redundant CBM or Product Master fields are introduced.

## Verification

Frontend component/workflow tests cover keyboard customer search, optional supplier grouping and subsequent supplier edits, packing staging/calculations/mismatch preservation, and Product Library fallback precedence/modal behavior. pgTAP covers nullable Production supplier and retained numbering. The final validation runs migration replay, pgTAP, focused tests, full frontend tests, typecheck, lint, build, Preview deploy, and manual Preview acceptance.
