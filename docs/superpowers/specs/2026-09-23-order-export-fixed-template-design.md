# Order Fixed Template Export Design

## Goal

Use one fixed Order template for all Order XLSX and PDF output. The saved
Order, its saved item snapshots, and its saved export snapshots are the only
export inputs. `document_language` remains commercial-document data and does
not choose a template.

## Scope

This design covers the Order page's product-table alignment, export-detail
snapshots, a normalized export model, and the fixed template mapping. It does
not implement an XLSX/PDF renderer, change Production, or modify Sanity.

## Fixed template

- Template registry key: `order`.
- Template source: `ROMIKU_订单_模板.xlsx`.
- The source worksheet is named `ROMIKU PI`, while its visible title and fields
  are Order-specific. The renderer will name the exported worksheet `ORDER`
  without changing its visual layout.
- There are no `order-zh`, `order-en`, or `order-es` templates.

## Canonical source boundary

```text
saved romiku_orders + saved romiku_order_items
  -> normalizeOrderExportModel(order, items)
  -> fixed Order template renderer
  -> XLSX and PDF
```

The renderer must never query Product Library, Sanity, Formal Customer, or a
global Seller source. It must sort items by `position ASC, id ASC` and use
their saved `product_snapshot` and `packing_snapshot`.

## Order page product columns

The Order table keeps the following default order and meanings:

| CRM / template heading | Saved source |
| --- | --- |
| No. | item `position` |
| 货号 | `sku` |
| 产品名称 | `product_snapshot.name` |
| 图片 | `product_snapshot.image_url` |
| 产品规格 | `product_snapshot.specification` |
| 箱数 | `packing_snapshot.cartons` |
| 装箱数 | `packing_snapshot.qty_per_carton` |
| 总数量 | `quantity` |
| 单价 | `unit_price` |
| 总金额 | `quantity * unit_price` |

`customer_code` remains saved but is not a default Order table column and is
not mapped to this template.

## Export snapshots

No new table or top-level database column is required. The existing document
JSON snapshots remain the persistence boundary.

```ts
type OrderExportSellerSnapshot = {
  company_name: string;
  address: string;
  tel_whatsapp: string;
  website: string;
  email: string;
};

type OrderExportTermsSnapshot = {
  payment: { visible: boolean; text: string };
  bank_charges: { text: string };
  cancellation_deposit: { text: string };
  quality_claim: { text: string };
  force_majeure: { text: string };
  dispute_settlement: { text: string };
  delivery_lead_time: { text: string };
  packaging: { text: string };
};

type OrderExportSnapshot = {
  template_key: "order";
  seller: OrderExportSellerSnapshot;
  terms: OrderExportTermsSnapshot;
};
```

The value is stored at `terms_snapshot.order_export`. Buyer data remains in
the canonical `counterparty_snapshot`; the Export Details Buyer editor updates
only that Order-level snapshot. It must not write Formal Customer data.

New Orders copy ROMIKU Seller and the eight template terms into their saved
snapshot at creation. A local-only migration will backfill the same snapshot
for legacy Orders exactly once. An Order without a saved export snapshot may
be opened and saved to initialize it, but exporting must not silently fetch
current defaults.

## Export Details UI

Order gets a compact `导出信息 / Document Details` Drawer or collapsible
section. It is outside the high-frequency item table and has explicit Save and
Cancel controls.

- Seller: company name, address, Tel/WhatsApp, website, email.
- Buyer: company name, address, Tel/WhatsApp, website, email.
- Terms: eight term texts and the payment-term visibility toggle.

Saving writes only this Order's `counterparty_snapshot` and
`terms_snapshot.order_export`. Cancelling restores the last saved values.

## Workbook mapping

| Template cells | Output | Source |
| --- | --- | --- |
| `J1` | `ORDER.NO` and `DATE` values | `document_number`, `document_date` formatted `YYYY.M.D` |
| `C3:C7` | Seller values | `terms_snapshot.order_export.seller` |
| `H3:J7` | Buyer values | `counterparty_snapshot` |
| `A8:J8` | Item headings | fixed template headings |
| `A9:J(8 + N)` | N dynamic item rows | normalized item rows |
| totals block | carton and monetary totals | normalized totals |
| Terms block | visible saved terms | `terms_snapshot.order_export.terms` |

All money cells are numeric. Their number format is selected from saved Order
currency (`USD` or `CNY`) without exchange-rate conversion.

## Dynamic rows

The initial template contains four example rows (9--12), a totals block
(13--17), a Terms heading (18), and eight Terms rows (19--26). These are only
layout anchors; their old formulas are not business logic.

For `N` actual Order items:

```text
itemStart       = 9
itemEnd         = 8 + N
totalsStart     = 9 + N
termsHeadingRow = 14 + N + optionalExpenseRows
```

The renderer clones row-9 layout properties for each data row, writes every
item amount itself, and shifts totals, merges, borders, Terms, and print area
down as necessary. It does not retain or copy `H10:H12` or `J10:J12` formulas.
The logo, colors, fonts, borders, widths, heights, merged-cell structure, and
Seller/Buyer layout remain template-owned.

## Conditional total rows

The base totals order is:

1. Total CTN
2. Subtotal
3. Freight
4. Total Amount
5. Deposit
6. Balance

Insert `OTHER EXPENSES / 其他费用` after Freight only when
`other_expenses > 0`. Insert `DISCOUNT / 折扣` immediately before Total Amount
only when `discount > 0`, with a negative displayed amount. The renderer uses
saved Order total unchanged:

```text
total = subtotal + freight + other_expenses - discount
```

When either optional value is zero or empty, no row or whitespace is emitted.
All following rows shift down by the exact number of inserted rows.

Deposit and Balance use saved `deposit_percent` and the saved total. Neither
the 30% nor 70% shown in the template is a renderer constant.

## Terms visibility

`payment.visible = false` omits the complete payment Terms row. It does not
delete `payment.text`; subsequent Terms rows close the gap. All other term
labels retain their template text and all saved term text is editable only for
the current Order.

## Error handling

- Refuse export with an explicit error if the fixed template cannot be loaded
  or does not contain the expected Order anchors.
- Export a legitimate zero amount as zero, not blank.
- Omit optional rows only for numeric zero or absent values.
- Render a missing optional Seller/Buyer field as an empty value, never as
  `undefined` or a freshly loaded profile value.
- Keep an item with a missing image cell blank; it must not block the export.

## Acceptance criteria

- One, 18, and 50 Order items keep the template visual style and move all
  following regions safely.
- Seller, Buyer, Terms, payment visibility, item snapshots, and dates remain
  stable after their source masters later change.
- No optional expense or discount leaves an empty row.
- Order number/date edits are reflected in later exports.
- XLSX and PDF consume the same normalized model.
