# Website Inquiry → Quote final chain implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated implementation tasks and independent review. User explicitly requests continuous implementation of the detailed final specification.

**Goal:** Persist each website submission exactly once before notifications, then explicitly create an independent Quote with immutable requested quantities and correct fixed XLSX template.
**Architecture:** Existing intake RPC remains service-role-only and transactional; unique submission UUID plus serialization/replay preserves the first saved normalized snapshot. Quote conversion copies saved customer/item snapshots. Website QA is isolated from public submit flow and old CRM. Three fixed workbook packages reuse the existing package-preserving renderer.
**Tech Stack:** PostgreSQL/Supabase, Vercel Node/Zod, React, ExcelJS/package preservation, Namecheap PHP, Node/PHP test fixtures.
**Spec:** /Users/romiku/.codex/attachments/ea4fd10d-d11a-4347-ab2c-7700dd460426/已粘贴的文本.txt

## Constraints
- Preview Supabase ciwaibtotispazfviims; branch codex/commercial-line-items-v2; existing Vercel project romiku-crm-prod.
- No Production Supabase/crm2.romiku.com, no old CRM writes, no Sanity writes, no public website submission switch, no automatic Formal Customer.
- PI/Order/Production/Packing XLSX frozen. Website Inquiry and new Quote use own saved snapshots; no export-time lookup of master data.
- Secrets server-only, never logs/Git/browser. QA mail defaults to capture, never real customer delivery in automated tests.
- Preserve status history and current status whitelist. Conversion does not change Inquiry status.
- User confirmed the two unsuffixed desktop files as final templates on 2026-10-06; originals remain unchanged.

## Audit
- Existing intake accepts no submission ID, creates every retry, enriches post-save from live Sanity. Replace authoritative snapshot path with normalized PHP inputs; retain compatibility for legacy source rows without inventing historical fields.
- Existing quote_from_inquiry already copies provenance but lacks requested_quantity_snapshot and uses enriched product shape.
- Website outputs/api/submit-rfq.php sends mail before old CRM and returns success regardless of CRM failure. New isolated QA pipeline must not reuse that active request handler.
- Desktop templates: worksheet ROMIKU PI; header row 8, product rows 9–12; print A1:H12 / A1:I12. Customer F3:F7 merged horizontally. Inquiry number I1, Quote H1. Preserve template name/styles/drawings.

## Review focus
- Concurrent retries and timeout-after-commit must return the same WI; same email/different submissionId remains separate. Replays must not mutate snapshots or create extra status history.
- Client-owned quantity must preserve numeric(18,4), WhatsApp remains text, unknown SKU/image cannot silently use browser-authoritative data.
- Historical website-source Quote missing requested quantity stays blank; direct Quote stays null and has no REQUEST QTY column.
- Saved image/name/spec never depend on current Product Library or Sanity. Failure before CRM success never sends success mail or clears cart.
- Mail retry uses original normalized submission and original saved WI date/number; never reconstruct an altered submission under the same ID.

## Tasks
- [x] Database/API: add nullable legacy-compatible submission_id, source/brand and complete item snapshot; unique key and replay receipt; preserve first submission. Numeric requested_quantity_snapshot with immutable update guard; conversion copy. Add focused pgTAP/API/local concurrency tests (red → green).
- [x] XLSX: audit/canonicalize confirmed templates; fixed Direct/Website-source Quote choice based on source_website_inquiry_id; snapshot-only buyer/products/request qty; 1/5/20 package regression plus frozen four exporters. Website Inquiry server attachment renderer shared where possible.
- [x] CRM UI: readonly requested qty only for website-source quotes; creation and both source navigation directions with WI/RFQ business numbers; full inquiry snapshot/brand display. Tests for independence, no status/customer side effects.
- [x] Website QA: separate gated endpoint/page, stable submission UUID/cart failure persistence, server catalog normalization, CRM-first pipeline, shared normalized submission for mail/XLSX, optional WhatsApp/brand, sanitized config/logs and capture-mail tests. Package without touching public form or live legacy handler.
- [x] Full frontend/API/pgTAP/typecheck/lint/build and website npm/PHP tests; independent review. Prepare hidden getpass Preview migration connection only as needed.
- [ ] Apply verified Preview migration; push branch, verify matching Vercel Preview/env, controlled QA integration and browser/API/XLSX acceptance. Report any real hosting/configuration blocker without claiming unexecuted mail delivery.

## Verification ledger — 2026-10-07

- Local pgTAP: 987/987; Preview business suites: 854 PASS, all fixture transactions rolled back; historical business values unchanged.
- Applied Preview migration `20261006190000_inquiry_quote_snapshots.sql`.
- Full frontend: 105 files, 604 PASS / 1 existing skipped. Server + functions: 173 PASS / 2 opt-in local skipped. Local real PostgreSQL concurrency test separately PASS.
- Typecheck and build PASS; ESLint and changed-source Prettier PASS. Repository-wide Prettier still reports three untouched Product Library files and excluded output artifacts; they were preserved.
- Three canonical templates confirmed; 1/5/20 products covered, frozen four exporters unchanged. Final review fixed UTC/business-day mismatch and edited Quote contact export, plus legacy saved localized product names and stable submission item order.
- Vercel project/branch environment verified; existing automation protection credential available, project security settings unchanged. Actual Website shared secret is sensitive/unreadable; secure user input requested for real PHP integration.
- Hosted Namecheap QA and actual internal mail delivery not yet executed. Public submit flow/old CRM/Production untouched.
