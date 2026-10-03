# Production marking / XLSX audit and field mapping

User-authorized source: `/Users/romiku/Desktop/crm2.0 表格模板/ROMIKU生产单模板.xlsx` (confirmed by user attachment after initial filename discrepancy). Scope: existing branch, Preview Supabase ciwaibtotispazfviims, existing romiku-crm-prod branch Preview only. Order/PI/Quote/Packing output frozen; no PDF, Sanity or Production environment operations.

## Actual template (OOXML read-only audit)

- Worksheet: `ROMIKU PI` (preserve template name, despite historical name).
- Product header row 3; single prototype product row 4; total row 5; requirements row 6. Rows 7–9 contain only blank formatting.
- Merges: E1:G1, E2:G2, A5:D5, A6:B6, C6:G6.
- Heights in points: rows 1–8 = 35, 137, 34, 112, 35, 50, 88, 57.
- A:G widths = 8, 31.4230769230769, 30.5673076923077, 31.8269230769231, 12.3173076923077, 11.4711538461538, 13.75.
- Styled centered wrapped product cells with borders; preserve prototype styles, fonts, fills and border edges.
- A4 paper (paperSize=9), portrait, scale=62. Margins left/right .751388888888889, top/bottom 1, header/footer .5 inches.
- No defined Print Area/Print Titles; no drawing/media parts. Shared package image code currently assumes a preexisting drawing and column D; extend optional image target columns and creation of missing drawing parts, leaving existing caller defaults/output unchanged.
- For n>=1 products: productStart=4, footerStart=4+n, requirementsStart=5+n. Copy prototype row 4 n times. Move total and requirements styles/merges together. Print Area A1:G(5+n). No invented number/date/logo sections.

## Current schema and proposed mapping

| CRM field | Saved record/snapshot | Normalized model | Template region |
|---|---|---|---|
| Production number | production_orders.document_number (existing trigger) | document.number | filename only |
| Item order | new production_items.position; deterministic legacy backfill | items[].position | A4+ |
| SKU | production_items.sku | items[].sku | B4+ |
| Product photo | product_snapshot.image_url | items[].imageUrl | C4+ |
| Name/specification/description | product_snapshot.name/specification + production_note_zh | items[].description | D4+ |
| Cartons | existing packaging_snapshot.cartons, legacy carton_qty fallback | items[].cartons | E4+ |
| Qty per carton | existing packaging_snapshot.qty_per_carton | items[].qtyPerCarton | F4+ |
| Production quantity | production_items.quantity | items[].quantity | G4+ |
| Front/side/small label | new production_orders.marking_snapshot.front_mark/side_mark/small_label | marking (mode,text,image_asset) | B2 / C2 / D2 |
| Labeling requirements | marking_snapshot.labeling_requirements | marking.labeling_requirements | E2:G2 |
| Production requirements | marking_snapshot.production_requirements | requirements | C(requirementsStart):G(requirementsStart) |
| Totals | sums of saved items (not source Order) | totals.cartons / quantity | E(footerStart) / G(footerStart) |

Production items already own product_snapshot and packaging_snapshot. Cartons/qty_per_carton have no dedicated columns or complete editor; reuse the semantically correct packaging snapshot. quantity remains independently editable; mismatch warning only. Current UI incorrectly labels live source Order quantity as total; replace Production columns with saved production fields.

Formal Customer currently uses romiku_formal_customers.requirements JSON with legacy shipping_marks/shipping_mark_image_url/product_labels/packaging. Add dedicated marking_profile JSONB; preserve legacy fields. Production has no appropriate header marking location: add marking_snapshot JSONB, never overload notes. New profiles use version=1 and stable asset references, allowing later brand-level defaults without adding brands now.

## Snapshot creation and history

At creation only: load source Order, load its linked Formal Customer once when present, copy marking defaults into Production. If no Formal Customer, normalize any saved source marking snapshot; otherwise empty. Initialize production requirements from saved Order requirements/notes and customer packaging defaults. No missing defaults block creation. Existing Productions receive empty marking snapshot (no live customer backfill). New item position, product, packaging snapshots are saved at creation. Existing item edits do not recopy current Order/Product Library fields. Export reads saved Production/items/marking only.

## Storage audit and safe reuse

Existing Supabase client/Storage infrastructure supports uploads; existing attachments bucket is public, uses random object names and authenticated delete permissions, with note cleanup triggers. This is not a sufficient immutable historical asset contract for customer marking images.

Reuse Supabase client and Storage, with a dedicated private `romiku-marking-assets` bucket: UUID object names, no upsert, authenticated insert/select only, no authenticated update/delete policy. Store bucket/path/name/MIME/size metadata, never base64 or expiring signed URLs in DB. Preview/download resolves the saved path using authenticated Storage. Replace/remove clears only default/snapshot reference; old object remains. Do not involve note cleanup. Validate PNG/JPEG/WebP and file size. Runtime image bytes may be prepared in memory for the existing image renderer. Missing requested images must fail export with a user-readable message rather than silently omitting marking.

## Migration and search

One minimal new migration adds marking_profile, marking_snapshot, item position plus private immutable bucket policies. Add explicit marking text search projection/index through existing business search infrastructure; never index asset JSON or entire profiles. Keep authenticated RLS and controlled delete boundaries. Apply only named Preview after local verification using Session Pooler + Python getpass. No secrets in chat or repository.

## Tests and acceptance

Customer image/text/none edits, upload validation, save/error/preview, immutable paths; creation copy and no back-write; legacy empty profiles; quantity independence; saved-only normalization. XLSX 1/5/25 items, template styles/merges/page setup, dynamic Print Area, all three marking modes, missing image failure, contain/aspect ratio/centering in B2/C2/D2/C4+, requirements/totals. Full frozen exporter regression, frontend suite, typecheck/lint/build, pgTAP snapshot/security checks. Browser Preview create/edit/export and history checks. Exclude .gitignore, .vitest-attachments, output from commits.
