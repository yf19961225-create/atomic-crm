# Preview Operations UI Design

## Goal

Correct the Packing grid's data-column mapping, simplify Production creation to a product-and-quantity workflow, make numeric inputs safe across the CRM, replace the calendar list with a practical calendar grid, and lock Product Library's compact columns into alignment. All work remains Preview-only.

## Scope and constraints

- Work only on `codex/commercial-line-items-v2` and the Preview environment.
- Do not deploy or migrate Production, change Production Supabase, `crm2.romiku.com`, or Sanity.
- Do not change or erase existing Production `supplier_id` or `supplier_snapshot` values.
- New Production records leave both supplier fields null. Supplier data remains in ProductSupplier for procurement.
- No schema migration is expected.

## Packing grid

The Packing table has one canonical ordered column definition used by the header, `colgroup`, body, and footer:

`No. | SKU | Product name | Image | Total quantity | Cartons | Qty/Ctn | Length cm | Width cm | Height cm | Per-carton CBM | Total CBM | Carton weight | Total weight`

The editable values are total quantity, cartons, Qty/Ctn, length, width, height, and carton weight. Per-carton CBM, total CBM, and total weight are rendered values only. The formulas are:

- `perCartonCbm = lengthCm * widthCm * heightCm / 1_000_000`
- `totalCbm = perCartonCbm * cartons`
- `totalWeight = cartonWeightKg * cartons`

Quantity, cartons, and Qty/Ctn remain independent. A mismatch can display a warning but does not block saving. The grid remains staged: edits and source additions are not persisted until Save; Cancel restores the saved records.

## Production creation

The creation path is `select order → choose one or more order items → enter positive production quantities → create one Production`.

There is no supplier column, supplier selection, supplier validation, or supplier grouping in the creation UI. The workflow validates that every selected item belongs to the selected order and creates one Production header with nullable supplier fields, then creates all selected Production items under it. The existing server-side P01/P02/P03 sequence remains unchanged and represents the ordinal Production document for the Order, not a supplier group.

The Production detail and list no longer expose supplier controls or values. Historical supplier fields remain untouched in the database and are not cleared by edits to other Production fields.

## Numeric-input safety

A small app-level numeric-input guard handles every native `input[type=number]`, including existing commercial, fulfillment, payment, packing, and procurement fields. Shared base CSS hides browser spin controls. When a focused number input receives a wheel event, the guard blurs that input without calling `preventDefault()`: this prevents the browser's native increment/decrement behavior while preserving normal page scrolling. Existing numeric types, decimal `step`, validation, keyboard Tab, and Enter behavior stay unchanged.

## Calendar

Use FullCalendar React, with the current `romiku_calendar` view as the event source. The calendar grid is the page body and defaults to a Monday-first month view. Its toolbar supports previous period, next period, Today, and month/week/day views. FullCalendar's overflow handling displays `+N more` and opens its event list for busy days.

Events preserve their source title, source type, owner, status, and `due_at`. All-day events are represented without a time; timed events retain their local time. Owner and source-type filters remain compact controls above the grid. Clicking a task opens its source or task detail using the existing source routing. Clicking an empty date in month view opens a new manual-task route with the date prefilled; clicking a time slot in week or day view prefills both local date and time.

## Product Library alignment

The compact Product Library stays at exactly eight columns:

`Image | SKU | Qty/Ctn | Carton dimensions | CBM | Weight | Supplier | Internal note`

The same `<colgroup>` dimensions apply to both `<thead>` and `<tbody>`. Image, SKU, and numeric columns have fixed desktop widths; Supplier has a wider fixed width; Internal note consumes remaining space. Numeric headers and cells share right alignment.

Procurement display precedence is explicit:

- Qty/Ctn: Preferred Supplier, then the only Supplier where exactly one exists, then Sanity `cartonQty`, then `—`.
- Carton dimensions: Preferred Supplier, then the only Supplier where exactly one exists, then `—`.
- Carton weight: Preferred Supplier, then the only Supplier where exactly one exists, then `—`.
- CBM is calculated from the displayed dimensions only and is never stored as a redundant database field.
- Supplier display is Preferred Supplier plus `+N` for additional suppliers.

Product image preview and drawer editing remain intact.

## Testing and acceptance

- Packing regression coverage proves the 50 × 40 × 30 cm, 2-carton, 12.5 kg/carton example renders `0.060 m³`, `0.120 m³`, `12.5 kg`, and `25.00 kg` in the respective columns.
- Production workflow coverage proves multiple selected items yield one nullable-supplier Production and historical supplier fields are not part of update writes.
- Numeric guard coverage proves wheel leaves the value unchanged while the page scroll event remains unblocked, and preserves Tab, Enter, decimal input, and validation behavior.
- Calendar coverage proves default month/Monday settings, toolbar view changes, overflow behavior, filtering, detail navigation, and prefilled manual-task date behavior.
- Product Library coverage proves the column definition supplies aligned header/body columns.
- Run the full frontend suite, pgTAP/schema suite, typecheck, lint, build, then deploy and manually verify only Preview.
