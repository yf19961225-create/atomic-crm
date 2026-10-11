# CRM version updates and Inquiry freshness

The client build and `/version.json` use the same Git SHA (`VERCEL_GIT_COMMIT_SHA`, local Git HEAD fallback). Version JSON is not precached and is served with `Cache-Control: no-store`. It never reads Supabase.

Visible clients check every 60 seconds, on focus/visibility and after reconnecting. The global banner is the single update entry point, including waiting workers and chunk-load errors. Nothing reloads automatically. Explicit refresh checks draft protection before and after asynchronous worker update/activation, then reloads after controller change. Authentication and preferences are retained.

Business draft signals feed a registry keyed by independent editor IDs. Each editor compares only its editable fields with a normalized saved/initial baseline; opening a Create/Edit page, hydration, validation issues and submitting alone are clean. Exact revert clears dirty, successful save adopts the saved baseline, and closing/unmounting removes only that editor. Refetch preserves actual drafts. React Hook Form contributes isDirty, not isSubmitting. A collapsed editor that retains user input stays protected. No page reloads silently; once every source is clean, the banner permits explicit refresh.

Inquiry rows/count remain in the existing active server query. The last refresh label advances only for non-manual query success events, not restored or optimistic cache. A separate one-row/count query detects new arrivals hidden by pagination/filtering. A failed refresh retains prior rows/count and timestamp. `查看最新` returns page one, clears text search, and preserves a status filter matching the latest inquiry. No automatic navigation occurs.

## Cross-deployment acceptance

1. Deploy A to the existing Preview branch alias; confirm `meta[name=crm-build]` and `/version.json` match A.
2. Leave an ordinary clean tab, untouched Quote/Production/Packing Create pages, separate real unsaved Quote/Production/Packing drafts, and a standalone Preview PWA open.
3. Deploy B to the same branch (a documentation-only commit is sufficient: build SHA and generated SW change).
4. Wait for visible polling or focus. Clean and untouched Create pages must allow refresh without an unsaved warning. All three dirty documents must retain their inputs and refuse refresh; opening Edit alone must remain clean.
5. Inspect the waiting worker without forcing activation. Restore edited fields to their exact visible original values, including a legacy Quote specification with a presentation prefix; the update banner must immediately allow refresh. Repeat an edit then Cancel. Explicitly refresh and verify HTML build B without clearing storage.
6. Verify Inquiry success/failure/recovery, old tab, fresh session and PWA reopen. Record actual evidence outside Git. A test that only mocks two versions is not cross-deployment acceptance.

## Separate Production hotfix plan — requires user authorization

- Freeze the Preview-accepted final SHA; retain the current Production deployment ID as rollback target.
- Read-only verify `romiku-crm-prod`, Production URL/key target `vddjodsbmuarshnytyvb`, and Preview overrides `ciwaibtotispazfviims`; never print keys.
- After explicit authorization, build that exact SHA using Production variables and perform read-only smoke tests, then follow the established controlled alias release process.
- No database migration, DB writes, Namecheap/ingestion/secret changes or XLSX changes are needed.
- Validate version JSON no-store, Inquiry freshness, Quote readiness, draft protection, PWA and target. Roll back the frontend alias if necessary; do not roll back or alter the database.
- Existing tabs running c429843 without a detector need one manual refresh/reopen to acquire this feature. Future releases can then be announced. This release cannot remotely retrofit old running JavaScript.
