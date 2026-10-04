# Production instruction inheritance implementation plan

Goal: Customer defaults → Order independent defaults → Production independent snapshot → resolved item overrides.
Architecture: Add Order production_defaults_snapshot and Production Item marking_override. Initialize new Orders in a database INSERT trigger (including conversions); conservatively initialize existing Orders from their own saved fields only. Keep Production marking_snapshot and all five XLSX renderers/models/templates frozen. Use a single pure item resolver and authenticated SECURITY INVOKER RPCs for atomic item batches and explicit Production reload.
Spec: User approved audit and implementation, including schema_version / initialized_at / source, legacy isolation, and exact UI warning: 产品级标签例外当前尚未输出到 Production XLSX.
Execution: Inline implementation with one independent final review; explicit user approval already covers implementation through Preview.

- [x] Domain: instruction metadata, labels, item override normalizer and sole resolver. Tests: inherit/append/replace, explicit empty, no mutation, preserved immutable references.
- [x] Database: two JSONB columns; new Order initializer; conservative legacy backfill; strict shape/mode validation; atomic same-parent batch RPC and reload RPC; authenticated-only invoker/RLS. pgTAP: conversion creation, clear never refills, batch rollback/scope, reload keeps overrides, anon rejected.
- [x] Workflow: Production creation copies only Order saved defaults; tests Customer→Order (SQL), P01/P02 independent snapshots and unchanged Customer/Order after Production edit.
- [x] UI: reuse marking editor for Order and Production, additional labels, source metadata, explicit reload confirmation; item mode editor/effective preview and atomic bulk reset/add; exact XLSX limitation warning.
- [x] Verify all frontend tests, five XLSX regressions, pgTAP, typecheck, lint, build. One independent read-only review and fixes.
- [ ] Preview-only migration ciwaibtotispazfviims via Session Pooler/getpass, push existing branch, existing romiku-crm-prod branch Preview; browser acceptance and final evidence.

Review focus: existing initialized empty values; legacy no-current-customer reads; converted Order initializer; replace remains replace in batches; no snapshot metadata/extra-label loss on editor save.
Frozen: all XLSX renderer/model/template files; no Production services, crm2.romiku.com, Sanity; do not commit .gitignore, output/, .vitest-attachments/.

Verification ledger:
- Domain RED missing module → 5 PASS; workflow RED current Customer fetch → saved Order copy and no Customer query PASS.
- Local all pgTAP: 491 PASS. Actual pre-migration legacy fixtures: 5 PASS, including no current Customer read and historical Production unchanged.
- Full frontend: 915 PASS, 2 existing skips before route-isolation follow-up. Five XLSX families included; renderer/model/template files unchanged.
- Typecheck, lint, build PASS; existing lint/build deprecation/size warnings only.
- Independent read-only review: no Critical/Important findings. Minor deferred: expand editor-save test fixture to cover all additional-label/source metadata (domain normalization already covered; implementation inspected).
- Author route-isolation regression: navigating P01→P02 retained the P01 local draft; test reproduced failure. Key editor state by resource/id and item state by parent id; final verification follows.
- Preview awaits getpass Session Pooler connection. No remote migration or deployment yet.
- Review scope ruling: remote deployment/backfill/browser checks remain execution tasks, not source-review claims; do not report them passed without evidence.

Final local verification: frontend 916 PASS / 2 existing skips; 135 files PASS / 1 existing skipped file. pgTAP 491 PASS; pre-migration fixtures 5 PASS. Typecheck/lint/build exit 0. Route-isolation regression now PASS. All five XLSX code/template/model files remain unchanged.
