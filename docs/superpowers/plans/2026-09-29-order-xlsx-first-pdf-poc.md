# Order XLSX-first PDF Conversion POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove or reject, in Preview only, whether LibreOffice can convert the already approved Order XLSX bytes to a visually acceptable PDF without changing XLSX generation.

**Architecture:** A dedicated Preview LibreOffice container accepts an authenticated, short-lived signed URL for an already-rendered XLSX, downloads it into an isolated `/tmp` job directory, converts it headlessly, and streams the PDF back. Supabase Preview private Storage carries only the temporary XLSX; the worker never receives business-database credentials or an Order id.

**Tech Stack:** Existing approved TypeScript XLSX renderer; Supabase Storage signed URLs in `ciwaibtotispazfviims`; a Preview-only container with LibreOffice; container-native font inspection; real Preview browser downloads for human comparison.

**Spec:** `docs/superpowers/specs/2026-09-29-order-xlsx-first-pdf-poc-design.md`

## Global Constraints

- Preview project only: `romiku-crm-preview` / `ciwaibtotispazfviims`; no Production service, database, Vercel deployment, `crm2.romiku.com`, or Sanity operation.
- Treat `src/components/romiku/orders/orderXlsxRenderer.ts`, the fixed template, and its package-level image handling as frozen.
- Do not invoke or tune the independent `pdf-lib` layout renderer for this POC.
- Converter input is final XLSX bytes only; no DB, Sanity, Product Library, Formal Customer, or seller-master reads.
- Do not log document content, signed URLs, credentials, or file bytes; use private Storage and short-lived signed URLs.
- Do not create a CRM UI integration or enable the Order PDF button in this POC.
- Stop at the human visual decision gate; no full service or cleanup scheduler is in scope.

## Review Focus

- Font substitution: block the POC when an exact template family cannot be resolved in the worker image; test this preflight before conversion.
- URL boundary: reject signed URLs outside the configured Preview Storage origin and never follow a redirect to another host.
- Data isolation: prove the worker operates with XLSX bytes only and has no database credentials or Order-id endpoint.
- Cleanup: simulate successful and failed conversion paths and verify `/tmp/<job>` removal plus best-effort private input-object deletion.
- Multi-page preservation: compare both a 3--5 item and 20+ item real Preview Order PDF to its approved XLSX, including page breaks and Terms placement.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `docs/superpowers/specs/2026-09-29-order-xlsx-first-pdf-poc-design.md` | Approved POC scope, isolation and decision criteria. |
| `services/order-pdf-poc/Dockerfile` | Preview-only LibreOffice worker image and legally approved fonts. |
| `services/order-pdf-poc/src/server.ts` | Minimal authenticated `POST /convert` endpoint: download allowed XLSX, convert, stream PDF, clean up. |
| `services/order-pdf-poc/src/fontPreflight.ts` | Extract font names from XLSX and validate exact worker font availability. |
| `services/order-pdf-poc/src/convert.ts` | Per-job temporary directory creation, `soffice` invocation, bounded file handling and cleanup. |
| `services/order-pdf-poc/test/*.test.ts` | Unit/integration coverage for font preflight, URL boundary, conversion response, and cleanup. |
| `services/order-pdf-poc/README.md` | Preview-only operator instructions and artifact-handling/teardown procedure. |

No existing frontend, XLSX-renderer, export-model, direct-PDF-renderer, schema, or migration file changes belong to the POC.

### Task 1: Verify the frozen source and worker font preflight

**Files:** Create `services/order-pdf-poc/src/fontPreflight.ts`, `services/order-pdf-poc/test/fontPreflight.test.ts`, and `services/order-pdf-poc/Dockerfile`.

**Interfaces:** `preflightTemplateFonts(xlsx: Buffer, inventory: FontInventory): FontPreflightResult` consumes the exact final XLSX and worker inventory; unresolved families make `ok === false`.

- [ ] Write failing tests that extract `Arial`, `Calibri`, `Carlito`, `Songti SC Regular`, and `宋体` from the latest template; assert a missing family fails rather than selecting a fallback.
- [ ] Run `npm test -- services/order-pdf-poc/test/fontPreflight.test.ts`; it must fail because the module does not yet exist.
- [ ] Implement `preflightTemplateFonts` without reading Order data; add a Docker inventory command for only legally approved fonts, with no automatic equivalence mapping.
- [ ] Build the Preview worker image and run preflight; require an explicit mapping of every family to an approved font file or stop before conversion.
- [ ] Commit only the POC font files with message `feat: add order PDF POC font preflight`.

### Task 2: Implement the isolated XLSX-to-PDF conversion endpoint

**Files:** Create `services/order-pdf-poc/src/convert.ts`, `services/order-pdf-poc/src/server.ts`, and `services/order-pdf-poc/test/convert.test.ts`.

**Interfaces:** `convertSignedXlsx(input: ConvertRequest): Promise<ReadableStream<Uint8Array>>` consumes `{ sourceUrl: string, authorization: string }`, never an Order id, and returns `application/pdf` only.

- [ ] Write failing tests that reject an off-origin URL, redirect, non-XLSX response, oversized source, and missing authorization; assert temp input/output removal both for success and a mocked `soffice` failure.
- [ ] Run `npm test -- services/order-pdf-poc/test/convert.test.ts`; it must fail because `convertSignedXlsx` does not exist.
- [ ] Implement `convertSignedXlsx`: allow only HTTPS URLs whose host equals the configured Preview Storage origin, use random `/tmp` job/profile directories, a bounded timeout and file limit, call `soffice --headless --convert-to pdf`, stream PDF bytes, and clean the job in `finally`.
- [ ] Implement `POST /convert` with a separate POC authorization check; do not accept raw Order data, database identifiers, or return local paths.
- [ ] Rerun the conversion tests and commit the POC converter with message `feat: add isolated order XLSX PDF POC converter`.

### Task 3: Provision the disposable Preview-only transport

**Files:** Create `services/order-pdf-poc/README.md`; deployment configuration is external and happens only after explicit infrastructure authorization.

**Interfaces:** The transport accepts a final XLSX from the existing CRM flow and produces a short-lived signed download URL usable only by the POC worker.

- [ ] Before any write, prove the Supabase target is `ciwaibtotispazfviims`; create one private Preview-only POC bucket with only the required upload/signing policy. Do not expose tables, run migrations, or touch Production.
- [ ] Deploy the container only to a disposable Preview worker target. Configure no Production or business-database credentials, restrict signed URL origin to Preview Storage, and keep the POC secret out of source control.
- [ ] Upload one approved final XLSX, create a short-lived URL, call the worker, download its streamed PDF, and confirm both `/tmp` files and the input object are removed in the `finally` path.
- [ ] Commit documentation only with message `docs: document preview order PDF POC operation`.

### Task 4: Execute the two real-order visual POC cases

**Files:** No repository source change. Output only the two user-requested local artifact pairs: real CRM `.xlsx` and matching LibreOffice `.pdf`.

**Interfaces:** Inputs are two saved Preview Order XLSX exports, one with 3--5 items and one with 20+ items; outputs are PDFs derived from exactly those bytes.

- [ ] Generate both source XLSX files through the existing Preview CRM, and record non-sensitive SHA-256 checksums for source and worker request.
- [ ] After font preflight succeeds, run both conversions. Do not create fixtures or Case A/B/C files.
- [ ] Check `application/pdf`, `%PDF-` signature, matching source checksum, and non-sensitive logs that exclude document content and signed URLs.
- [ ] Present both XLSX/PDF pairs for user page-by-page comparison of logo, headers, Seller/Buyer, Requirements, images, dimensions, summary, Terms, margins, and pagination.

### Task 5: Close the POC without expanding scope

**Files:** Modify `services/order-pdf-poc/README.md` and `docs/superpowers/specs/2026-09-29-order-xlsx-first-pdf-poc-design.md`.

**Interfaces:** Inputs are font/preflight evidence, transport checks, and user decision; output is either `accepted for full-service planning` or `rejected; evaluate Graph`.

- [ ] Record only Preview project ref, LibreOffice version, font result, artifact checksums, cleanup outcome, and user decision; do not commit XLSX/PDF files.
- [ ] If accepted, stop and prepare a separate full-service plan before changing the CRM PDF button. If rejected, stop LibreOffice work and evaluate Microsoft Excel / Graph. In neither case resume the hand-drawn `pdf-lib` renderer.
- [ ] Commit the outcome documentation with message `docs: record order PDF conversion POC result`.

## Plan self-review

- **Spec coverage:** Tasks 1--5 cover frozen XLSX, font audit, private Preview transport, isolated conversion, real artifacts, manual comparison, cleanup, and pass/fail gate.
- **Type consistency:** The sole public POC interfaces are `preflightTemplateFonts` and `convertSignedXlsx`; the latter consumes a signed XLSX URL, not business data.
- **Review coverage:** Task 1 pins fonts; Task 2 pins URL/data isolation and cleanup; Task 3 pins Preview transport; Task 4 pins multi-page visual comparison; Task 5 prevents post-gate scope creep.
- **Proportion:** CRM UI, async jobs, retry queues, durable retention, and other document exporters are intentionally deferred to a separately approved plan.

## Execution handoff

Implementation requires separate explicit authorization to create the private Preview bucket and deploy the disposable container. Review this plan and confirm it captures the desired POC before implementation.
