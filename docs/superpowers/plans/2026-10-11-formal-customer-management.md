# Formal Customer management implementation plan

Goal: implement the approved controlled deletion and active/inactive UX, through Preview only.
Spec: user attachment 067a5d61-49f8-4857-bcd2-a5b4bbffbb34 (2026-10-11).
Architecture: extend existing fixed-kind delete/preflight/batch RPCs, existing status and directory view; preserve all document relations and snapshots.
Execution: inline with tests before implementation. No Production changes, XLSX, website intake, or Sanity changes.

- [ ] Add pgTAP cases and reproduce unsupported customer deletion/security failure in isolated copy.
- [ ] One migration: dependencies helper, controlled delete/preflight/batch/status extensions, revoke direct DELETE, append directory status. Sync declarative schemas.
- [ ] Customer management UI component, row menu/selection, batch results, inactive selector toggle and Customer 360 badge. Regression tests.
- [ ] Run full pgTAP, actual two-session race test, all frontend/server/XLSX tests, typecheck, lint, build.
- [ ] Preview-only guarded migration with hidden Session Pooler input; verify no existing business changes.
- [ ] Existing-project branch Preview build and browser QA; stop before Production.
