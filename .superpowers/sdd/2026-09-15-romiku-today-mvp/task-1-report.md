# Task 1 report — ROMIKU application shell

## Scope delivered

- Branded the app as `ROMIKU CRM 2.0`.
- Replaced the Atomic business navigation with the 13 intended ROMIKU primary
  modules: Workbench, Website Inquiries, Outbound Development, Formal
  Customers, Quotes, PI, Orders, Production, Packing & Shipping, Calendar,
  Suppliers, Product Library, and Settings.
- Made Workbench the dashboard and left it explicitly action-free while the
  aggregation feature is still pending.
- Registered explicitly non-data, "coming next" placeholder routes for every
  non-Workbench primary module. ROMIKU routes are inserted ahead of built-in
  routes, so the shell's Settings link also resolves to its placeholder.
- Added a mobile navigation trigger; the same primary shell remains reachable
  when the sidebar is rendered as a drawer.

No ROMIKU business data, schemas, RLS, APIs, supplier/product workflows,
documents, or deployment work were introduced.

## Atomic extension seam

`CRMProps` now accepts a generic `additionalRoutes: ReactNode` option. The
option is rendered through Atomic's existing `CustomRoutes` mechanism for both
desktop and mobile admins, before Atomic's built-in layout routes. This keeps
ROMIKU names and UI out of Atomic CRM. An additional-resources seam was not
needed because all Task 1 ROMIKU views are static placeholders and do not
register a data resource.

## TDD evidence

1. Added `RomikuLayout.test.tsx` before the layout existed. The focused test
   initially failed because `./RomikuLayout` could not be resolved.
2. Implemented the minimum ROMIKU shell, route configuration, Workbench
   placeholder, and generic Atomic route extension.
3. The focused navigation contract passed after implementation. It asserts the
   ROMIKU brand, every intended primary link and href, and that Atomic
   Contacts, Companies, and Deals are absent.
4. Self-review found the mobile drawer had no opener. Added a second focused
   test first; it failed because no button named `Open primary navigation`
   existed. Added the small `SidebarTrigger`; the focused suite then passed
   with 2/2 tests.

## Final verification

- `npm run test:unit:app -- src/components/romiku/layout/RomikuLayout.test.tsx --run`
  — 1 file, 2 tests passed.
- `make typecheck` — passed.
- `make lint` — passed; ESLint emitted the repository's existing
  `.eslintignore` deprecation warning.
- `make build` — passed. Existing Rollup circular chunk, chunk-size, and
  Browserslist-data warnings remain.
- `make test` — 555 passed, 1 skipped, and exactly the six acknowledged
  Atomic `.claude` harness failures remain: four
  `cleanup-worktree` assertions, one `setup-worktree` idempotency assertion,
  and one `cleanup-session` worktree-cleanup assertion.

## Self-review

- All new ROMIKU UI is contained under `src/components/romiku/`.
- The Atomic change is generic and minimal: route injection only.
- No generic Atomic module is present in the ROMIKU primary navigation.
- Placeholder text explicitly states that neither records nor actions are
  available, avoiding fabricated business capability.
- The generated failure screenshot directory was removed and is not part of
  the change.
