# Production shared instructions and allocation UX

Scope: existing Order → Production model and saved snapshot inheritance. Preview only ciwaibtotispazfviims. All five XLSX contracts/templates/renderers frozen.

## Read-only audit
- `romiku_order_item_remaining` already aggregates production quantity excluding cancelled only; archived still consumes capacity. Creation does not read this view and defaults each selection to full Order quantity.
- Workspace has a warning-only aggregate check and `allow_overassigned`; ordinary confirmation bypasses it. No invariant on direct item writes/status reactivation. Replace this with a hard guard.
- Shared summary exists for saved records but session editing opens every shared field. MarkEditor always renders a text input even for none/image. Reload is prominent.
- Item override already resolves through sole resolver; retain compact effective labels and on-demand editor, simplify Chinese replace label.
- Creation copies saved Order defaults and server preserves independent source metadata. Explicit reload/sync preserve item overrides; retain.

## Minimal implementation
1. Failing SQL/UI regressions for allocation, strict writes/reactivation, cancellation, historical overages, summary modes, no bypass.
2. One migration: invoker allocation RPC (saved Order items + grouped active Production allocations, one request), trigger-only fixed-search-path capacity enforcement on direct writes and reactivation. Serialize against parent Order and existing numbering counter (no numbering changes). Workspace preflight returns structured breakdown, no bypass, atomic changes with decreases before increases and final status restoration. Reject Order quantity reduction below committed allocations. Keep archived consuming quantity. No historic data rewrite.
3. Create and workspace use allocation query, remaining defaults/max, fully allocated disabled, linked allocation disclosures. Shared summary remains until explicitly edited; reload under More and confirmation.
4. Full frontend/pgTAP/typecheck/ESLint/build and frozen XLSX regressions; review once, apply only Preview after hidden Session Pooler input; push existing branch and existing project Preview; browser verify.

Ruling: Legacy overallocated records are not silently changed. Unchanged quantities/instruction edits and reductions/cancellation remain possible; any increase/reactivation that exceeds capacity is blocked. UI discloses existing excess. This allows repair without grandfathering new excess.
Ruling: archived retains its existing capacity semantics (counts unless cancelled); completed/received also count. Cancelled quantities do not count.
Ruling: no real Order fixtures rewritten to manufacture acceptance examples; test equivalent cases transactionally and use dedicated QA records for browser persistence.

## Ledger
- Audit, implementation and regression tests complete. Preview credentials pending via /private/tmp/romiku-allocation-preview.py.
- Local pgTAP: 599 passing. Independent local connection races: create, edit, restoration, repeatable-read all passing.
- Fresh review found shared editor stayed open after save: fixed with observed RED→GREEN test; no remaining review findings.
- Additional race regression clears selection when refetched allocations exhaust a selected item.
- Full frontend run exposed existing FormalCustomerSelector keyboard test racing asynchronous directory results (passes isolated, fails under concurrent suite). Test now waits for actual visible result before keyboard navigation; production selector untouched.
- Typecheck, ESLint and build pass. Five XLSX implementation files untouched. Final full frontend: 934 passing, 2 existing skips.

- Preview migration committed successfully; Preview pgTAP 358 passing. Branch URL and Preview-only Supabase env verified.
- Browser acceptance passed partial/full capacity, cancellation release, direct restoration blocker, transaction blocker, saved summary, conditional modes, saved Order inheritance and append Barcode.
- Browser uncovered stale InlineStatusSelect local state after cached rows refetch: added RED regressions for prop synchronization and query invalidation, then synchronized selected status and invalidated dependent caches after Production status writes. Final rerun/deployment in progress.
- QA P05 created under dedicated QA Order OD261004001. Final state will be cancelled; QA Order common defaults restored to original empty values. Real OD261004002 historical excess remains untouched.
