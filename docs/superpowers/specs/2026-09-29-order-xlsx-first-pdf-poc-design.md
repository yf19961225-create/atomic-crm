# Order XLSX-first PDF Conversion POC Design

## Status and decision

This is a **Preview-only decision POC**. It replaces the rejected proposal to
hand-draw an Order PDF with `pdf-lib`. The POC does not ship a CRM PDF-export
feature and must not alter the approved XLSX renderer.

The only question to answer is whether LibreOffice headless can turn the
already approved, final Order XLSX into a PDF that is visually close enough to
the spreadsheet's own printed output.

## Scope

The POC input is one already generated final Order XLSX byte stream. It is
not an Order id and it is not a request to reconstruct a document:

```text
saved Order and item snapshots
  -> normalizeOrderExportModel(...)
  -> approved fixed-template XLSX renderer
  -> final .xlsx bytes
  -> LibreOffice headless conversion
  -> final .pdf bytes
```

The converter receives only the final `.xlsx`; it must not read Supabase,
Sanity, Product Library, Formal Customer records, or a seller master. XLSX
remains the sole layout source of truth.

The POC uses only the Preview project `romiku-crm-preview`
(`ciwaibtotispazfviims`). It must not deploy, migrate, query, or write any
Production service, `crm2.romiku.com`, or Sanity.

## Explicit non-goals

- No replacement of `orderXlsxRenderer.ts`, its template, package-level
  product-image drawings, merge/layout planner, or print settings.
- No adjustment of logo, rows, columns, terms, margins, images, or page setup
  to accommodate LibreOffice.
- No change to the current `normalizeOrderExportModel` business mapping.
- No Order-page UI wiring, no enabled PDF button, and no full conversion
  service, scheduled cleanup service, Production infrastructure, or other
  document exporter.
- No use of the existing independent `pdf-lib` layout renderer for the POC.

The existing direct `pdf-lib` renderer may remain in source history while the
POC is evaluated, but it is not a candidate for this conversion path.

## Frozen XLSX source

The fixed source is the latest committed Order template asset at
`src/assets/order-templates/ROMIKU_订单_模板.xlsx`, which is the repository
copy of the user-approved `ROMIKU_订单_模板(2).xlsx`. Its output worksheet is
`ORDER`.

The template audit performed on 2026-09-29 found:

| Property | Observed value |
| --- | --- |
| Source worksheet | `ROMIKU PI` |
| Product start row | 9 |
| Worksheet print dimension | `A1:J55` |
| Zoom | 85% |
| Page mode | portrait; `pageSetUpPr fitToPage="1"` |
| Margins | 0.25 in left/right/top/bottom; 0.12 in header/footer |
| Declared fonts | Arial, Calibri, Carlito, Songti SC Regular, 宋体 |

The development host does not have `fc-match`, so this audit deliberately
does not infer availability. A container preflight is mandatory: every
declared family must be located in the actual worker image before visual
results can be accepted. If a family is proprietary or unavailable, the POC
must stop for a user-approved, legally deployable equivalent or move to the
Microsoft Excel / Graph evaluation; it must not silently substitute a font and
call the result representative.

## Preview-only POC boundary

The proposed disposable topology is:

```text
operator-selected real Preview Order
  -> approved CRM XLSX export
  -> short-lived signed upload to private Preview Storage object
  -> dedicated Preview LibreOffice worker receives signed XLSX download URL
  -> /tmp/<random-job>/input.xlsx
  -> soffice --headless conversion
  -> PDF response to the operator
  -> delete local files and Preview input object in finally
```

`romiku-crm-preview` private Supabase Storage is preferred; create no bucket
until implementation is approved. The worker has no Supabase database
credentials and no Production credentials. It downloads the XLSX only through
a short-lived signed URL, does not log document content, and streams the PDF
to the caller instead of persisting a second business artifact. The input
object and local files are deleted in a `finally` path. A failed cleanup must
be recorded only as a non-sensitive object key for manual removal and is a
full-service design concern, not an excuse to retain document data.

The worker must reject non-XLSX media types, untrusted source URLs, oversized
objects, redirects outside the configured Preview Storage origin, and requests
without its short-lived POC authorization. It must never accept an arbitrary
database identifier.

## Conversion runtime

Use a dedicated Preview-only container with LibreOffice, not the current Vite
application or a normal Vercel function. The current Vercel function limits
and read-only runtime make a native office binary unsuitable for a reliable
embedded-image POC. The container is intentionally provider-neutral in this
design; Cloud Run is the recommended deployment target because it can run the
LibreOffice image separately from Vercel and can be shut down after the POC.

The worker command must operate only on the downloaded XLSX path and write to
its private `/tmp/<random-job>` output directory. It must use a fresh
LibreOffice user profile per job to prevent state carry-over. On all outcomes,
it removes the temporary directory before responding.

## Font preflight gate

Before either acceptance conversion:

1. Extract template font families from `xl/styles.xml` in the exact XLSX bytes
   that will be converted.
2. In the worker image, enumerate installed fonts and resolve each declared
   family.
3. Record family name, installed resolved name, and font-file checksum in a
   non-document diagnostic result.
4. Fail the POC before conversion if a required family is unresolved or uses
   an unapproved substitute.

The goal is to eliminate a font-substitution false negative: wrapping,
row-height, and pagination differences cannot be attributed to LibreOffice
until the required fonts are demonstrably available.

## Test inputs and manual gate

Use two real, saved Preview Orders whose source XLSX is generated by the
approved CRM renderer:

1. A 3--5 product Order.
2. A 20+ product (or otherwise multi-page) Order.

For each, retain only the user-requested pair of locally downloaded artifacts:
the CRM-generated `.xlsx` and the converter-generated `.pdf`. Do not generate
fixture Case A/B/C documents.

The human comparison checks, page by page:

- Logo crop, size, and position.
- `ORDER.NO`, date, Seller, Buyer, and Requirements.
- Product headings, product images, row height, column width, and borders.
- Summary and terms content, sequence, and page placement.
- Portrait page size, margins, fit-to-page behavior, and page breaks.

### Decision gate

- **Pass:** the user accepts both PDFs as sufficiently close to the XLSX print
  output. Only then write and approve the full conversion-service plan and
  connect the Order `导出 PDF` button.
- **Fail:** do not tune the XLSX or resume a hand-drawn PDF. Preserve the XLSX
  path and evaluate Microsoft Excel / Graph conversion next.

## Evidence and safety record

The POC result records only the Preview project ref, conversion job id,
font-preflight outcome, LibreOffice version, source/output byte lengths,
checksums, and cleanup outcome. It must not log sheet cells, product data,
customer data, signed URLs, access tokens, database passwords, or file bytes.
