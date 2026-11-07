# Workbench UI refinement implementation plan

Goal: implement the three user-approved UI changes on a979053 without database/API/security changes.
Architecture: preserve feed query and statistics, controlled RPC and revision contract; use local presentation state for overview and child folding.

- [ ] A: RomikuWorkbench overview has four compact cards, 65/35 recent/reminders columns, a detailed-list switch preserving all filters and paging. Chinese labels with neutral fallback; no recomputation of financial or task counts. Browser tests preserve source links/filter requests, unknown receivables and <=8 query limit.
- [ ] B: ProductionOrderGroups ongoing children hide cancelled and fold received; counts use server group received_count, not loaded pages. Hidden rows excluded from bulk selection. Keep load-more ability and all/received/cancelled view semantics. Test partial received, cancelled, >100 child paging and selection.
- [ ] C: ProductionDueControls reads snapshot immediately and shows one date field/save, optional details for classifications/follow-up. Ordinary reason defaults to authorized 调整工厂交期. Clear and not-required transitions explicitly confirmed. Preserve failed draft and original revision; explicit refresh loads newest revision while retaining date. Realtime does not overwrite dirty draft. ProductionWorkbench removes duplicate existing-record picker, leaves new-record creation and safe rollback rules unchanged.
- [ ] Run affected browser tests, typecheck/lint/build/PWA; reuse unaffected prior full-suite evidence.
- [ ] Preview deploy existing project, existing Preview-only environment; real two-user QA date conflicts and screenshots at desktop/390px; no original business data writes.
- [ ] Gate exact commit, baseline Production unchanged, rollback a979 ready; Production cloud guard on staged build; promote only after all Preview gates PASS. Readonly smoke, record evidence and stop.

No migration, secrets/env changes, backup/restore reruns, website changes or Production business mutations. User explicitly authorized direct execution without routine design or release reapproval.

User addition D (same release): ProductionChildren uses the same ProductionDueControls in a collapsed inline wrapper (current date + 修改日期 -> save/cancel). Received children stay readonly with existing detail link. No automatic date clearing on classification selection. Shared RPC preserves the selected child's ID/revision only. Add tests for inline cancel and received readonly; real Preview validates list/detail/workbench synchronization.
