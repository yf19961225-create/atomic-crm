# Product Library V2 Design

## Goal

Make the CRM Product Library a browsable, Chinese-first, read-only view of
the Sanity `gxuvcyaa/production` product catalog. Sanity remains the sole
Product Master. Supabase keeps only CRM-owned procurement overlays and never
receives a copy of a complete Sanity product.

## Non-negotiable boundaries

- Sanity access is anonymous HTTP `GET` only, at API version `2025-07-05`.
  No token, mutation client, create, update, delete, or write proxy is added.
- A catalog row is always derived from a Sanity `product` document. A
  Supabase row may decorate it, but cannot create a catalog product.
- The existing `romiku_product_extensions`, `romiku_product_suppliers`, and
  `romiku_procurement_cost_history` tables remain CRM-owned. No table,
  migration, or second Product Master is added.
- Quote, PI, Order, and Website Inquiry snapshot code is out of scope and
  remains unchanged.
- Product master fields shown in the UI are never saved to Supabase. Only
  internal notes and procurement fields are mutable.

## Existing-model finding: Extension is not a ProductSupplier parent

`romiku_product_suppliers` has no foreign key to
`romiku_product_extensions`; it stores its own optional `sanity_product_id`,
required `sku`, and required `supplier_id`. Cost history is the only child
relationship: it references `romiku_product_suppliers(id)`.

Consequently, a first supplier association does **not** require an Extension.
Product Library V2 will create a minimal Extension only when an internal-note
save requires one and none exists. That creation is an idempotent Supabase
write containing exactly `sku` and the Sanity-verified `sanity_product_id`
(plus `internal_notes` when the user has supplied it). A first Supplier save
will directly write the ProductSupplier row with the same verified identity;
it will not make the user create an Extension first.

## Catalog data contract

### Read model

`SanityCatalogProduct` contains only data returned by this query projection:

```ts
type SanityCatalogProduct = {
  id: string;
  sku: string | null;
  name: { zh?: string; en?: string; es?: string } | null;
  imageUrl?: string;
  category?: { id?: string; title?: Record<string, string> } | null;
  parameters: Array<{ label?: Record<string, string>; value?: unknown }>;
  moqQuantity?: number;
  moqUnit?: Record<string, string>;
  packaging?: Record<string, string>;
  cartonQty?: number | string;
  isPublished: boolean;
};

type CatalogCursor = {
  skuSort: string;
  id: string;
};
```

`skuSort` is a normalized sort key only; the original SKU stays untouched.
For absent SKU it is `""`. This avoids converting null values in the display
model while providing a deterministic key for pagination.

### Query and cursor

The catalog query always excludes drafts. The default condition is
`isPublished == true`; an explicit internal `includeUnpublished` flag expands
it to all non-draft products.

Results sort by `coalesce(sku, "") asc, _id asc`. The next-page predicate is
the lexicographic tuple comparison implemented in GROQ:

```groq
(coalesce(sku, "") > $afterSku ||
 (coalesce(sku, "") == $afterSku && _id > $afterId))
```

The query requests 51 rows for a displayed page size of 50. Row 51 creates a
cursor from its predecessor's `(skuSort, id)`; it is not rendered. This handles
empty SKU, duplicate SKU, and special characters because the original values
are passed as GROQ parameters rather than concatenated into a query string.
The cursor is cleared whenever search or publication visibility changes.

Search is parameterized and matches SKU, `name.zh`, `name.en`, `name.es`, and
the localized category title. Search and the cursor predicate are part of the
same GROQ query, so consecutive pages use the identical result set and cannot
repeat or skip rows under a fixed catalog snapshot. A concurrent Sanity edit
can naturally change future pages; the UI will state the returned count rather
than assert a global fixed total.

## UI design

### Product Library home

The default Product Library tab becomes **产品目录**.

- Search: SKU, Chinese name, English name, Spanish name, and category.
- Filter: `仅显示已发布` by default; `显示未发布产品` is an internal opt-in.
- Row/card: image, SKU, primary Chinese name, optional English secondary
  name, Chinese category, MOQ, packaging, carton quantity, supplier count,
  preferred supplier, current reference cost, and an internal-note indicator.
- The three existing lists move behind an **内部采购管理** tab. They remain
  management views, not the product master list.
- No results, catalog loading failure, and procurement-overlay loading failure
  are separate states. A catalog failure prevents catalog rendering; an overlay
  failure leaves catalog cards usable and shows `采购资料暂时无法加载` only in
  the procurement area.

### Language rule

The list's primary name is `name.zh`, with `name.en` shown only as a secondary
line when present. A fallback is used only when Chinese is absent, in this
order: English, Spanish, SKU, then `未命名产品`. The Drawer presents `name.zh`,
`name.en`, and `name.es` as source data. No mapping mutates Sanity data merely
to make the CRM Chinese.

### Product Drawer

Clicking a catalog item opens a Drawer with two sections:

1. **产品资料（只读）**: image, SKU, all language names, category, parameters,
   MOQ, packaging, carton quantity, and publication state from Sanity.
2. **内部采购资料**: Extension internal notes, suppliers, preferred supplier,
   supplier SKU, supplier MOQ, lead time, and reference-cost history. Only this
   section creates or updates Supabase rows.

Saving notes creates or upserts the minimal Extension described above. Saving
a supplier passes `sku` and verified `sanity_product_id` to the existing
ProductSupplier write path. Saving a cost continues to require an existing
ProductSupplier ID, exactly as today.

## Overlay contract

For the 50 Sanity products on a page, fetch only corresponding CRM rows in
batched Supabase reads. Join new rows primarily by `sanity_product_id` and
fall back to SKU for legacy rows without that ID. Group results in memory by
Sanity document ID; never write back a derived group or catalog projection.

The overlay object is:

```ts
type ProductProcurementOverlay = {
  extension?: { id: string; internalNotes: string | null };
  suppliers: Array<{
    id: string;
    supplierId: string;
    supplierName: string;
    supplierItemNumber: string | null;
    moq: number | null;
    leadDays: number | null;
    preferred: boolean;
  }>;
  preferredSupplier?: { id: string; name: string };
  currentReferenceCosts: Array<{ supplierId: string; cost: number; currency: string }>;
};
```

If this read fails, the catalog source is not retried or invalidated. The
overlay exposes an error state and a targeted retry; the Sanity cards and
read-only Drawer content remain available.

## Error, empty, and write handling

| Condition | UI behavior |
|---|---|
| Sanity catalog request fails | Dedicated catalog error panel with retry; no stale/misleading product rows. |
| Search has no result | Dedicated empty-result state containing the active search term; no error message. |
| Supabase overlay request fails | Catalog stays browsable; procurement columns show unavailable and Drawer procurement section offers retry. |
| Minimal Extension already exists | Re-read/update that extension; do not create a duplicate. |
| Extension create races with another user | Handle unique-key conflict by re-fetching the Extension and continuing the requested note save. |
| ProductSupplier duplicate | Preserve current duplicate error behavior and do not create a second association. |
| Sanity identity missing/invalid | Disable procurement writes and display the catalog read model; never substitute a different SKU. |

## Acceptance criteria

- A published Sanity product with no CRM Extension or Supplier is visible and
  opens in the Drawer.
- Cursor pagination traverses a fixture representing 1,800+ published
  products with empty, duplicate, and special-character SKUs without repeats
  or omissions.
- Default catalog excludes unpublished products; the internal filter includes
  them without including drafts.
- The list is Chinese-first and the Drawer contains the full multilingual
  source names.
- A first note save creates only a minimal Extension in Supabase; a first
  supplier save does not need an Extension and writes no Sanity data.
- A Supabase overlay failure never blocks Sanity catalog browsing.
- There is no code path that sends a non-GET request to Sanity.
- Existing Quote, PI, Order, and Website Inquiry snapshot tests remain
  unchanged and pass.
