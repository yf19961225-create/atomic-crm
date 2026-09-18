# Today MVP release runbook

Status: local readiness only. No Supabase/Vercel remote write, push, DNS change,
deployment or website URL switch is part of this commit. Production is pending
the inputs in [production-environment.md](production-environment.md) and explicit
deployment authorization. Work stays on `codex/phase-1a-foundation-outbound`.

## Reproduce local evidence

Prerequisites: Node 22, installed npm dependencies and Playwright Chromium,
Docker Desktop, Supabase CLI on `PATH`, and the disposable local
`atomic-crm-demo` stack. Port 54321 must be that stack; port 5176 must be free.
These commands use local data and the reset clears the disposable local database:

```sh
supabase start
supabase db reset --local
supabase test db
node --test supabase/tests/romiku_concurrency.mjs
ROMIKU_TEST_LOCAL_DB=1 npx vitest run --project server
supabase db diff --local
CI=1 npm run test:smoke:today
CI=1 make test
make typecheck
make lint
make build
```

The dedicated smoke config starts/stops its own Vite app, reads temporary local
keys from `supabase status` without printing them, rejects other API/app targets,
and creates two random local users. Cleanup removes only those users and their
fixtures. It does not reuse Atomic's all-users deletion fixture. A forcibly
terminated test can leave fixtures; replay the local reset before the next release
run. Never point the smoke at a hosted environment. SQL tests roll back.

Do not report `make test` as entirely green if the known Atomic harness failures
are present. Only the exact six cases/reasons in
[baseline-exception.md](baseline-exception.md) are accepted; new failures block
release. Review the captured result, not just its exit status.

## Coverage and limits

| Requirement | Evidence |
| --- | --- |
| Two independent users | Real local Auth accounts, password sign-in and separate browser contexts; each logs in through the actual UI |
| Shared access and audit | Second user's real JWT reads Order and edits first user's Outbound; creator retained, editor changed; anonymous query rejected |
| Outbound + contact + follow-up | Real authenticated persistence; production follow-up sync helper; no automatic Customer creation |
| Website API + inquiry items | Actual Node handler invoked in-process, real local PostgREST/RPC; raw JSON and both original items checked; only optional Sanity lookup is offline |
| Inquiry → Quote | Real RPC, downstream quantity/price edits, exact before/after Inquiry header and original-item comparisons |
| Quote → PI → Order | Real RPCs, downstream edits, exact source header/item comparisons at both boundaries |
| Quote → Order direct path and rollback | Existing `romiku_core.test.sql` and conversion unit tests; not repeated as a separate browser flow |
| Payments | Real deposit write, server total 130 and remaining balance 100; SQL additionally tests currency/movement constraints |
| Supplier-grouped production | Actual production helper against local authenticated persistence; two suppliers create two headers with one item each |
| Partial packing | Actual packing helper; 50 ordered, 20 packed, 30 remaining, 0.12 CBM and 20 kg; exact Order/header/item equality; SQL covers overpacking and concurrency |
| Workbench / Calendar | Both users click actual rendered Outbound links to its populated detail drawer; SQL and unit suites cover other event types/owners/priority |
| API rejection / transaction rollback | Server unit suite, opt-in handler integration, and `romiku_website_intake.test.sql` |
| UI forms, selection confirmation and validation | Existing browser-based component tests for inbound/outbound, Quote, PI/Order, production/packing and action center |

The smoke deliberately combines browser login/navigation with API/database
workflow verification. It does not claim every business operation was entered by
clicking a form. It also does not verify hosted Vercel routing/runtime, HTTPS/DNS,
production Auth email, website PHP behavior, live Sanity CORS, attachment privacy,
mobile rendering or every user-administration screen. Those need the configured
production/preview environment and the acceptance steps below.

## Deployment procedure — execute only after authorization

1. Record the approved commit, new Supabase project reference and Vercel team/project.
   Verify the project is separate from existing CRM. Record existing website
   endpoint configuration for rollback without disclosing its credentials.
2. In the new Supabase project, review migration SQL and apply all committed
   migrations in timestamp order. With CLI, explicitly link only the confirmed
   new reference, inspect `supabase migration list --linked`, review
   `supabase db push --linked --dry-run`, then apply `supabase db push --linked`.
   These are remote writes and have not been run for this task. Do not run any
   reset, seed or local smoke command against the hosted database.
3. Verify ROMIKU tables have RLS; anonymous roles cannot query tables/views or
   call conversion/intake RPCs. Confirm intake RPC execution is service-role only.
   Create the two users and configure Auth/Storage as documented. Close signups.
4. Create a separate Vercel project using the approved branch/commit, Node 22,
   build `npm run build`, output `dist` and the committed `vercel.json`. Add public
   build variables and server secrets through project settings. Provision a
   separate database if using a persistent preview environment. Do not enable
   automatic deployment from an unrelated branch or write to `main`.
5. Deploy the approved build to the new project. Confirm `/api/website-inquiries`
   invokes the function, while `/quotes/<id>` and frontend refreshes serve the
   SPA. A missing API path must not return the SPA's HTML as an intake success.
6. Add `crm2.romiku.com` to this Vercel project and apply the exact DNS record it
   provides for host `crm2`. Leave the apex, `www`, `crm`, mail and existing API
   records unchanged. Wait for Vercel domain verification and valid HTTPS.
7. Verify both intended users independently in fresh browser sessions. Create
   clearly marked acceptance records and execute the business checklist below.
   Keep a release log with commit, deployment ID, migration version and outcomes;
   exclude tokens, customer payloads and credentials.
8. From the website server, submit a marked request using the configured secret.
   Verify HTTP 201, `success: true`, a generated WI number, and the exact saved
   request/items. Verify missing/wrong secret is 401 and malformed business data
   is 422 without new records. Review PHP handling of both success and errors.
9. Switch only the website server's CRM endpoint URL/secret, then submit one real
   browser-to-PHP acceptance request. Confirm it arrives once in CRM 2.0. Monitor
   the function's fixed error codes; avoid logging request data or headers.

## Hosted acceptance checklist

- Both users can log in, see the same business record and save changes; signups
  are closed and anonymous access is denied.
- Create Outbound, multiple contacts and a follow-up; find it through Workbench
  and Calendar. Create Formal Customer manually and confirm it was not automatic.
- Submit Website Inquiry through the actual website PHP server, inspect its raw
  request and item requirements, choose items for Quote and edit Quote quantity,
  price and terms while Inquiry originals remain unchanged.
- Convert Quote to PI, edit PI and confirm Quote is unchanged; convert PI to Order,
  edit Order and confirm PI is unchanged. Verify direct Quote → Order once.
- Record payment and check outstanding balance; create production documents for
  two suppliers; partially pack an Order and verify remainder and unchanged Order.
- Open/reload document URLs, workbench links and calendar links over HTTPS.
- Check the public Sanity catalog from the production browser origin; an unknown
  SKU still retains its original inquiry details.
- Test account recovery/user management only if those screens are in release
  scope; test confidential attachments only after a private-file workflow exists.

## Rollback

If intake acceptance fails, keep or restore the website backend's previous URL
and secret configuration. Do not retry uncertain submissions blindly. Keep CRM
2.0 records for inspection and reconcile submitted IDs before re-enabling intake.
For a frontend/function regression, promote the previous known-good deployment
inside the new Vercel project after checking database compatibility. For schema
issues, take a new-project backup and prepare a forward correction; do not drop
tables, reverse migrations or reset production. A rollback must not modify the
existing `crm.romiku.com` deployment or its database.
