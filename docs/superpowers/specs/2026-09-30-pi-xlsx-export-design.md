# PI XLSX Export Design

## Purpose and scope

Add a Preview-only XLSX export flow for Proforma Invoices (PI). The result must use the fixed `ROMIKU_PI_模板.xlsx` workbook as its visual source of truth, while preserving the accepted Order XLSX renderer unchanged. PDF export is out of scope.

The export is generated exclusively from saved PI and PI item snapshots. It never re-reads Sanity, Product Library, Formal Customer data, a global Seller profile, or a bank-account master.

## Fixed-template contract

- One template only: `templateKey = "pi"`.
- `document_language` remains a compatibility field and does not select a template.
- The workbook worksheet remains `ROMIKU PI`.
- The renderer preserves the template's existing drawing package, Logo crop/anchor, merged cells, styles, semantic row heights, A:J widths, page setup, margins, zoom, print options and fit-to-page setting.
- The dynamic Print Area is `A1:J<last actual row>`.
- The fixed amount block contains only Total CTN, Subtotal, Freight, Total Amount, Deposit and Balance. Other Expenses and Discount are not exported as rows.

The actual template structure is:

| Region | Template location |
| --- | --- |
| Header | 1 |
| Seller / Buyer | 2–7 |
| Product heading | 8 |
| Product rows | 9–12 sample rows |
| Summary | 13–17 |
| Terms title / eight terms | 18 / 19–26 |
| Banking title / six fields | 27 / 28–33 |

The supplied template's static Print Area ends at row 26 even though Banking is at rows 27–33. Rendered PI files must expand it to include Banking when Banking is visible.

## Export data model

`normalizePiExportModel(pi, items)` is a pure function. It produces:

```ts
type PiExportModel = {
  worksheetName: "ROMIKU PI";
  document: { number: string; date: string };
  currency: "USD" | "CNY";
  seller: ContactSnapshot;
  buyer: ContactSnapshot;
  commercial: { priceTerm: string; shipmentMethod: string };
  payment: { depositPercent: number; deposit: number; balance: number };
  totals: { totalCtn: number; subtotal: number; freight: number; total: number };
  items: PiExportItem[];
  terms: PiExportTerm[];
  termsVisible: boolean;
  bank: PiBankSnapshot;
  bankInformationVisible: boolean;
};
```

`PiExportItem` reads only saved fields:

- `position`, `sku`, `quantity`, `unit_price` from the PI item;
- `name`, `image_url`, `specification` from `product_snapshot`;
- `cartons`, `qty_per_carton` from `packing_snapshot`.

Items are ordered by `position ASC, id ASC`. Item amount is the existing snapshot quantity × unit-price business calculation. The normalized model receives the saved PI total rather than introducing a new total formula. Consequently, the total preserves existing CRM semantics even when legacy `other_expenses` or `discount` values exist; those values receive no visual template row.

## Field-to-template mapping

| Saved source | Normalized field | Template target |
| --- | --- | --- |
| `document_number` | `document.number` | `J1`, PI.NO line |
| `document_date` | `document.date` | `J1`, DATE line as `YYYY.M.D` |
| PI seller export snapshot | `seller` | `C3:C7` |
| `counterparty_snapshot` | `buyer` | `H3:H7` |
| item position | `items[].position` | A |
| item SKU | `items[].sku` | B |
| `product_snapshot.name` | `items[].name` | C |
| `product_snapshot.image_url` | `items[].imageUrl` | D package drawing |
| `product_snapshot.specification` | `items[].specification` | E |
| `packing_snapshot.cartons` | `items[].cartons` | F |
| `packing_snapshot.qty_per_carton` | `items[].qtyPerCarton` | G |
| item quantity | `items[].quantity` | H |
| item unit price | `items[].unitPrice` | I |
| item amount | `items[].amount` | J |
| saved item cartons | `totals.totalCtn` | F at summary row |
| saved PI totals | `totals` | J at rows 13–17 after shift |
| `deposit_percent` and saved total | `payment` | Deposit / Balance labels and J values |
| `terms_snapshot.pi_export.terms` | `terms` | D:J for each visible Term row |
| `terms_visible` | `termsVisible` | controls the complete Terms region |
| structured `bank_snapshot` | `bank` | C:J at six Banking rows |
| `bank_information_visible` | `bankInformationVisible` | controls complete Banking region |

`pi.notes` has no corresponding region in the fixed PI template and stays in CRM only. No new template region will be added.

## Snapshot boundaries

### Seller and Buyer

The PI export snapshot stores Seller details under `terms_snapshot.pi_export.seller`. Seller defaults are copied from the actual PI template when a PI is created. Buyer is read from the PI's saved `counterparty_snapshot` and can be edited only on that PI. Neither change writes a Formal Customer, the template, or another PI.

### Terms

`terms_snapshot.pi_export` owns eight PI-specific Terms, `terms_visible`, and seller export data. The default eight Terms are the exact text and order from `ROMIKU_PI_模板.xlsx`. A PI always exports its saved override, if any. `terms_visible = false` removes the title and all eight rows without deleting their text.

### Banking

No Bank Account master is introduced in this phase. New PIs initialize the following structured `bank_snapshot` fields from the fixed PI template:

```ts
type PiBankSnapshot = {
  beneficiary_name: string;
  beneficiary_address: string;
  bank_name: string;
  bank_address: string;
  account_no: string;
  swift_code: string;
};
```

The user edits these fields only through the current PI's Document Details. `bank_information_visible` defaults to `true`; hiding it removes the complete 27–33 block and preserves the snapshot. A future bank-account master, if added, may only copy a selected account into this snapshot.

### Creation and conversion

Direct PI creation writes both the PI export snapshot and the template-derived structured banking snapshot. Quote-to-PI conversion continues to copy source commercial, customer, bank and Terms data without re-reading masters, then adds missing PI export defaults atomically to the new PI. It does not overwrite any existing source snapshot keys. PI-to-Order continues to copy PI snapshots unchanged.

## Layout planner

The PI-specific layout planner is the sole source of dynamic row coordinates:

```text
productStart = 9
summaryStart = productStart + max(1, itemCount)
freightRow = summaryStart + 1
totalRow = summaryStart + 2
depositRow = summaryStart + 3
balanceRow = summaryStart + 4

termsTitleRow = summaryStart + 5                  when termsVisible
termRows = termsTitleRow + 1 through +8           when termsVisible
bankingTitleRow = summaryStart + 14                when termsVisible
bankingTitleRow = summaryStart + 5                 when terms hidden
bankRows = bankingTitleRow + 1 through +6          when banking visible
lastRow = last visible block, otherwise balanceRow
```

The renderer rebuilds these template-defined merges after replacing sample dynamic rows:

- Total CTN: `A:E`, then subtotal label `G:I` on the same row.
- Freight, Total Amount, Deposit, Balance: `A:I`.
- Terms title and Banking title: `A:J`.
- Each Term: label `B:C`, text `D:J`, number only in A.
- Each Banking field: label `A:B`, value `C:J`.

The renderer writes only top-left cells of merged ranges. It clears template sample values and formulas in its dynamic region before writing saved data, while retaining styles and borders. Product rows use style roles captured from the PI template (first, middle, final), not Order constants or hard-coded PI typography.

## Shared XLSX infrastructure

The implementation may extract private, behavior-preserving helpers from the frozen Order implementation, protected by existing Order regression tests. Shared helpers cover:

- package round-trip preservation;
- preservation of static drawings and page configuration;
- package-level product-image media, relationships and anchors;
- natural-dimension contain scaling and cell-relative centering;
- dynamic merge cleanup/rebuild primitives;
- style capture/copy and template row replacement;
- date and currency formatting utilities.

`renderOrderXlsx()` retains its contract and accepted output behavior. PI adds a separate `normalizePiExportModel()`, `buildPiTemplateLayout()`, `renderPiXlsx()`, PI snapshot adapter, PI template asset, and PI Document Details surface.

## PI numbering

New PI numbers are `PIYYMMDDNNN`; historical `RPI...` numbers remain unchanged. To prevent an old RPI allocation from advancing a new PI series on the same Shanghai business date, daily counters become prefix-scoped:

```text
(document_kind, business_date, number_prefix)
```

Existing PI counter records are retained as `RPI`. New allocations use `PI`. The allocator takes an advisory transaction lock keyed by kind, date and prefix; compares the counter with the highest matching automatic number in `romiku_pis`; safely advances stale values; retries candidates already present; and remains in the document insert transaction so a rollback cannot consume a committed counter value. Manual document numbers remain table-unique but never alter the automatic PI series.

This requires one database migration plus matching declarative-schema updates. It is first applied and tested only against Preview Supabase project `ciwaibtotispazfviims`; Production is excluded.

## CRM UI

PI receives an `导出信息 / Document Details` panel, available while the document edit session is active. It contains Seller, Buyer, eight Terms, the Terms visibility control, six structured Banking fields, and the Banking visibility control. It stages changes in the existing edit session and saves them with the document. The main PI product table remains the high-frequency surface.

The PI detail page receives `导出 XLSX`. It first requires saved state, then executes exactly:

```text
saved PI + saved PI items
→ normalizePiExportModel()
→ renderPiXlsx()
→ <document_number>.xlsx
```

No PDF button or PDF renderer is added in this phase.

## Verification strategy

Focused tests cover:

- exact PI template defaults for Seller, eight Terms and six Banking values;
- direct PI initialization and document-level Seller/Buyer/Terms/Bank edits;
- Quote-to-PI snapshot preservation plus PI export-default initialization;
- position ordering and saved item-only normalization;
- 1, 3 and 20 product dynamic layout cases;
- merged regions, dynamic print area, terms hidden, banking hidden, and both hidden;
- package-level product-image embedding and aspect-preserving PHOTO anchors;
- USD and CNY numeric cell formats;
- Deposit / Balance labels and amounts at non-30% values;
- no Other Expenses or Discount export rows;
- PI numbering daily rollover, independent PI/RPI scopes, manual-number safety, stale self-heal, concurrency and rollback (pgTAP plus concurrency test);
- unchanged Order XLSX regression;
- typecheck, lint, build, full app suite, independent review, then Preview-only manual XLSX verification.

## Non-goals

- No PDF export.
- No Bank Account master, resource, RLS policy or administration UI.
- No template selection by document language.
- No modification to the accepted Order XLSX renderer, Order template or Production systems.
