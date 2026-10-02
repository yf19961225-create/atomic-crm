# Packing List XLSX Design

## Purpose and scope

Add a Preview-only fixed-template Packing List XLSX export and document-detail snapshots. The output uses the approved `ROMIKU_装箱单_模板.xlsx` visual design, writes only saved Packing List and Packing Item data, supports dynamically sized product rows, embeds saved product images, and does not add Packing PDF support. Accepted Order, PI, and Quote XLSX output behavior remains frozen.

## Template contract

The generated worksheet is named `PACKING LIST`. The supplied template has no formula, external reference, or named-range dependency on its current `ROMIKU PI` sheet name; its sole named range is the Print Area and is rewritten for the generated sheet.

The static layout is retained exactly:

- Header: `A1:N1` title, `O1` labels, `P1` PL.NO and DATE values.
- Seller and Buyer: rows 2–7; Seller values are `C3:E7`, Buyer values are `I3:P7`.
- Header row: 8.
- Product rows: start at 9; the four template sample rows 9–12 are replaced by the actual item count.
- Footer rows: TOTAL CTNS, TOTAL CBM, and TOTAL WEIGHT begin immediately after the final product row and retain their `A:O` merged labels and `P` values.
- Print Area: `A1:P<last-summary-row>`; template row 16 remains outside the print area.

The native template page settings, margins, merged cells, column widths, row heights, drawing relationships, and the existing cropped logo drawing are package-preserved. Product photos are placed in column D using the proven package-level image relation path: contain, centered, aspect-ratio preserved, and constrained to the PHOTO cell.

## Data and snapshot contract

The migration adds two Packing List-owned snapshots:

| Table | Column | Contract |
| --- | --- | --- |
| `romiku_packing_lists` | `seller_snapshot jsonb not null default '{}'` | Current Packing List Seller data only. |
| `romiku_packing_lists` | `buyer_snapshot jsonb not null default '{}'` | Current Packing List Buyer data only. |

On new Packing List creation, the application writes the final template ROMIKU Seller defaults into `seller_snapshot`. It copies the source Order's already saved `counterparty_snapshot` into `buyer_snapshot`. Editing either snapshot changes only the current Packing List and never changes an Order, Formal Customer, Product Library, ProductSupplier, Sanity, template, or another document.

The migration backfills only empty snapshots. Empty historical Seller snapshots receive the approved template Seller defaults. Empty historical Buyer snapshots copy only their source Order's saved `counterparty_snapshot`; a non-empty Packing Buyer snapshot is never overwritten. This is a one-time snapshot initialization, not an export-time fallback.

The item Unit stays in `romiku_packing_items.product_snapshot.unit`; no standalone database column is added. A new Packing Item copies a source Order item's saved `product_snapshot.unit` when it exists, otherwise leaves it blank. The user may edit and save Unit on the current Packing Item. Historical blank Unit values remain blank; no Product Library, Sanity, or ProductSupplier backfill occurs.

All other export data already belongs to saved Packing Item fields or its `product_snapshot`: SKU, name, image URL, specification, quantity, cartons, Qty/Ctn, dimensions, carton weight, generated total CBM, and generated total weight. The exporter must never query the source Order, Formal Customer, Sanity, Product Library, or ProductSupplier.

## Normalized export model

`normalizePackingExportModel(packingList, packingItems)` is a pure transformation. It accepts only the saved Packing List record and saved Packing Item records, sorts items by saved position/identity, and returns:

```ts
{
  worksheetName: "PACKING LIST",
  document: { number, date },
  seller,
  buyer,
  items: [{
    position, sku, name, imageUrl, specification,
    cartons, qtyPerCarton, unit, quantity,
    lengthCm, widthCm, heightCm, cartonCbm,
    cartonWeightKg, totalCbm, totalWeightKg,
  }],
  totals: { cartons, cbm, weightKg },
}
```

`cartonCbm` is calculated from the saved dimensions using decimal-safe arithmetic:

```text
length_cm × width_cm × height_cm ÷ 1,000,000
```

The existing generated `total_cbm` and `total_weight_kg` are the source for row totals; their values correspond to:

```text
total_cbm = carton_cbm × cartons
total_weight_kg = carton_weight_kg × cartons
```

The normalizer sums saved item values for TOTAL CTNS, TOTAL CBM, and TOTAL WEIGHT. The renderer receives only this normalized model and template bytes; it performs no business-data lookups. `packing_at` is rendered as `YYYY.M.D`; a missing saved date stays blank rather than using the current date.

## XLSX column mapping

| Excel | Normalized item field |
| --- | --- |
| A No. | `position` |
| B ITEM.NO | `sku` |
| C PRODUCT | `name` |
| D PHOTO | `imageUrl` |
| E DESCRIPTION | `specification` |
| F CTN | `cartons` |
| G QTY/CTN | `qtyPerCarton` |
| H Unit | `unit` |
| I TOTAL QTY | `quantity` |
| J Length | `lengthCm` |
| K Wide | `widthCm` |
| L High | `heightCm` |
| M CBM | `cartonCbm` |
| N Weight | `cartonWeightKg` |
| O Total CBM | `totalCbm` |
| P Total Weight | `totalWeightKg` |

PL.NO and DATE share `P1`; Seller values map to `C3:C7`, Buyer values to `I3:I7`, with their template merged ranges preserved. Total values map to `P<totals-row>`.

## UI and export boundary

Packing gains a low-frequency `导出信息 / Document Details` panel that edits the five Seller and five Buyer snapshot fields. The Packing grid exposes a low-frequency editable Unit field or dialog; its saved destination is `product_snapshot.unit`. Existing editable Packing quantity, carton, Qty/Ctn, dimensions, and weight behavior remains authoritative.

The export action fetches the current Packing List and its saved Packing Items only, calls the normalizer, renders the template, and downloads `<document_number>.xlsx`. There is no PDF action.

## Reuse and compatibility

The renderer reuses the accepted Order/PI/Quote package-preserving primitives: template package finishing, logo/static-drawing preservation, product drawing relationships, merge cleanup, dynamic-row handling, print titles, date/number formatting base utilities, and PHOTO column image anchoring. The generic row-style capture/apply helper becomes parameterized by column count, retaining its existing default so Order, PI, and Quote continue to copy their current column range unchanged; Packing passes 16 columns explicitly.

Packing-specific code is limited to its normalized model, 16-column renderer/layout, snapshot initialization/editing, and Packing export UI. No existing Order, PI, or Quote renderer/template behavior changes.

## Verification

Tests cover migration defaults and non-overwrite backfill; source-order Buyer copy; manual Unit persistence; normalizer snapshot isolation and calculations; one/four/twenty-row layouts; footer relocation and print area; exact PL/date/Seller/Buyer mapping; Decimal CBM/weight values; embedded photo relationship output; and row-style preservation across A:P. Regression suites cover frozen Order, PI, and Quote XLSX. Final release validation includes focused tests, full Vitest, pgTAP, concurrency, typecheck, lint, build, Preview-only migration application through the Session Pooler, existing-project branch Preview deployment, and manual Preview export inspection.
