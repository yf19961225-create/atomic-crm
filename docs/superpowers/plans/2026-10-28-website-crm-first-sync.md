# Website CRM-first Sync Implementation Plan

**Goal:** A successful website cart submission always has a verified CRM receipt; notifications are independently recoverable without blind SMTP retries.
**Architecture:** Reuse website-production and website-runtime, adapt the exact observed 20261026081346 website app, preserve the contact WhatsApp flow. CRM API/RPC are retained unless a concrete incompatibility is reported first.
**Spec:** User-approved attachment 34f748af-d45c-417e-a466-3fda4d104949 (2026-10-28).
**Tech stack:** Existing PHP 8.1+, browser ES modules, Vercel Node API, Supabase.

## Boundaries
- Production is read-only; no live-file changes, secret changes, deploy, migrations, SMTP changes or business writes.
- No investigation, import or resend of eight historical inquiries.
- Preview-only synthetic records; external test emails require explicitly approved recipients.
- No secret in source/log/public files. Private state outside web root. Fail-closed rollback.

## Tasks
- [x] Audit active handler, app and API contract; reuse existing implementation.
- [ ] Read-only verify deployed RPC signature, unique constraint and privileges; record hashes of public website assets.
- [ ] Add failing tests for receipt-gated completion, corrupt responses, refresh recovery and concurrent submission; implement minimal client changes.
- [ ] Add failing tests for original SKU, empty image, packing/quantity preservation, SMTP uncertain state; minimally update shared pipeline and journals.
- [ ] Rebuild hash-pinned app patch against actual live app, preserving contact/search/layout/cart. Add offline patch verification and restoration integration.
- [ ] Local PHP/Node/API/XLSX regression and isolated HTTP/mail capture tests.
- [ ] Deploy isolated Preview and isolated website only after credentials/target guards verified; real synthetic multi-item intake and permitted mail checks; cleanup via controlled workflow.
- [ ] Prepare exact allowlisted release files, hashes, original backups and fail-closed cutover/rollback steps. No Production activation.

## Review focus
Receipt without completed notifications; network timeout after CRM commit; process death after SMTP acceptance; concurrent tabs; pending inquiry restored after catalog changes; exact SKU/case and image association; no overwrite of unrelated website code.

## Initial evidence
Base SHA cf4ec5813c6183dd79f90043339a26b8ff4abfc6, clean linked worktree reused on codex/website-crm-first-sync.
Production app.js?v=20261026081346 SHA256 ea25da64e7e1c3ebdc5223e7d9123ffe65b81cba92fab8bdff617feb0d47127b on both domains.
Initial browser module tests: 2 PASS. Native managed worktree creation could not resolve base in task root; existing linked worktree used without altering original branch.

## Continuation checkpoint (2026-10-28)
- Working changes preserved; no reimplementation or Production mutation.
- Production RPC read-only audit completed earlier: invoker, fixed search_path, service-role-only execute, submission_id unique, transactional header/items and normalized replay snapshot. No API or migration change required.
- PHP backup download NOT confirmed: no matching file in Downloads or /private/tmp; previous download wait was interrupted. Current browser attachment failed; do not repeat unbounded download waits. Must obtain source backup before release readiness.
- Vercel scope read-only inspection: no codex/website-crm-first-sync branch-scoped variables. Do not use unverified inherited Preview defaults. Requested branch variables and explicit mail test recipients remain pending; no external email sent.
- Additional RED→GREEN: persisted receipt retry must not depend on current catalogue; production_process now matches QA saved-state semantics.
- Latest tests: browser modules 11 PASS; audited live patch 1 PASS; production PHP runtime 10 PASS; existing seven PHP test files PASS; server API/XLSX/runtime 66 PASS; typecheck PASS; lint PASS (existing ESLintIgnoreWarning).
- Unified patch file has intentional space-only context lines; do not trim those blindly because they are patch syntax.
- Preview real intake, live SMTP receipt and cutover backups remain incomplete. No final candidate or readiness claim.

## Preview configuration checkpoint
- User explicitly authorized automatic branch-only Preview configuration (no Production changes).
- Vercel first refused URL variables because branch did not exist. Created remote codex/website-crm-first-sync at existing base cf4ec5813c6183dd79f90043339a26b8ff4abfc6; uncommitted implementation is not pushed.
- Added VITE_SUPABASE_URL and SUPABASE_URL successfully, each Preview + exact branch only, value https://ciwaibtotispazfviims.supabase.co.
- Remaining three variables require source-confirmed Preview credentials. Prepared /private/tmp/romiku-inquiry-preview-20261028/configure-preview.py: hidden terminal input; GET-only fixed Preview target verification; CLI stdin; branch-only scope; secrets not in argv/output; shared test secret stored private 0600 outside repo. Syntax and mocked subprocess scope/stdin test PASS. User asked to run this single setup operation; pending.
- Existing exposed/default Secret must not be reused. No external mail; capture only.
- No ~/.ssh/config or known_hosts detected; no confirmed SSH/SFTP session. No downloaded actual handler file found; repo public wrapper copies are NOT a backup of the live handler.
- Native Chrome reads worked, but File Manager action timed out at 20 seconds. Do not repeat stalled download loops; live PHP backup remains a cutover prerequisite.
- Latest build and PWA cache test PASS. No actual Preview intake performed yet.

## Review/configuration continuation (2026-10-29)
- User reports INQUIRY PREVIEW CONFIG COMPLETE. All credentials remain outside Git; branch-only scope is being rechecked before deployment.
- Final branch review fixes: late response cannot erase a different pending submission; retrying an older snapshot preserves newer cart/customer edits; cart hydration retains fractional quantity and item notes. Reproductions failed before fixes; final client tests 8 PASS and actual live-app patch tests 2 PASS.
- Capture-only mail remains mandatory. No Production modification. Live PHP source backup remains unconfirmed and blocks formal website cutover readiness.
