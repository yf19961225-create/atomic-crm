# ROMIKU CRM 2.0 Today MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` task-by-task. Every task has a focused test cycle, review, and independent commit.

**Goal:** Deliver a deployable two-user ROMIKU CRM MVP at `crm2.romiku.com`, backed by an independent Supabase project and covering inbound, outbound, customer, document, fulfillment, workbench, and calendar vertical slices.

**Architecture:** Atomic CRM remains the authentication, UI, data-provider, attachment, and Supabase foundation. ROMIKU domain objects use explicit `romiku_*` PostgreSQL tables, views, RPCs, and UI modules; none are mapped onto Atomic Company or Deal. Vercel hosts the Vite SPA and its single serverless Website Inquiry intake endpoint; Supabase owns Auth, PostgreSQL, Storage, and document conversion RPCs.

**Tech Stack:** React 19, TypeScript, React Router v7, ra-core/shadcn components, Supabase Postgres/Auth/Storage/RPC, Vercel Functions, Vitest, Playwright, Node 22.

**Spec:** `/Users/romiku/Downloads/2026-09-15-romiku-crm-2.0-design-v3.md`; the user-approved Today MVP instruction in this conversation controls delivery order and permitted simplifications.

## Global Constraints

- Work only on `codex/phase-1a-foundation-outbound`; never merge, push, or develop on `main`.
- Website Inquiry, Outbound Development, and Formal Customer are independent objects; no automatic conversion or Customer creation.
- Sanity is the product master. CRM stores only internal product extensions and document snapshots.
- Quote, PI, Order, Production Order, and Packing List creation copies snapshots and never mutates the source object.
- New ROMIKU tables enable RLS, deny `anon`, grant authenticated business access, and retain `created_by`, `updated_by`, and nullable owner where applicable.
- Two authenticated users have identical effective V1 access; no RBAC or owner-based matrix.
- Website Intake validates `X-ROMIKU-Website-Secret` only on Vercel server code. Service-role and Sanity private credentials never use `VITE_*` variables.
- Do not implement email parsing, history migration, campaign email, Google Calendar, complex reminder engine, document-template pixel reproduction, cost-history import, or full Quote versioning.
- `make test` may have only the fixed six Atomic `.claude` harness failures; typecheck, lint, and build must pass.

### Task 1: Foundation and ROMIKU application shell

**Files:** `src/App.tsx`, generic Atomic CRM extension seam as needed, `src/components/romiku/{routes,layout,workbench}/`, focused tests.

- [ ] Write a failing app/navigation test that proves ROMIKU branding and the ROMIKU-only primary navigation are rendered.
- [ ] Add a generic additional-resources/additional-routes seam to Atomic CRM only if its existing public props cannot register ROMIKU resources; keep ROMIKU names and behavior outside Atomic.
- [ ] Implement ROMIKU app shell, Workbench route placeholder, table-first navigation, and hide Atomic generic business modules from the ROMIKU navigation.
- [ ] Run focused tests, `make typecheck`, `make lint`, `make build`; commit `feat: add ROMIKU application shell`.

### Task 2: Core schema, RLS, numbering, and invariants

**Files:** `supabase/schemas/01_tables.sql` through `06_grants.sql`, generated migration, schema integration tests.

- [ ] Write database integration tests for anonymous denial, authenticated access, owner/audit defaults, generated document numbers, source immutability, and packing quantity rejection.
- [ ] Create all explicit `romiku_*` entities and foreign keys: inquiry/outbound/customer, documents/items/payments, suppliers/product extensions, production/packing, manual tasks.
- [ ] Add snapshot and conversion RPCs; add calculated views/RPCs for remaining quantities, calendar, and workbench.
- [ ] Enable RLS on every ROMIKU table; omit anon grants/policies, add authenticated CRUD and service-role intake access; make views security-invoker.
- [ ] Run `supabase db reset`, schema tests, `supabase db diff --local`; commit `feat: add ROMIKU core schema and invariants`.

### Task 3: Sanity read model and Supplier/Product sourcing

**Files:** `src/components/romiku/products/`, `src/components/romiku/suppliers/`, server-only Sanity adapter if private access is required, focused tests.

- [ ] Write failing tests for Sanity SKU lookup mapping, unmatchable SKU fallback, Product Extension persistence, and ProductSupplier many-to-many behavior.
- [ ] Implement a read-only Sanity adapter configured from public read configuration or server-only token; never persist a second full product master.
- [ ] Implement Supplier, Supplier Contact, Product Extension, ProductSupplier lists and forms.
- [ ] Run focused tests and type/build checks; commit `feat: add supplier and Sanity product sourcing`.

### Task 4: Independent Inbound, Outbound, and Customer workflows

**Files:** `src/components/romiku/{inquiries,outbound,customers}/`, focused tests.

- [ ] Write failing tests for independent record creation, multiple contacts, manual status, follow-up-derived dates/counts, no automatic customer conversion, and inquiry item preservation.
- [ ] Implement table/drawer UI for Website Inquiry, Outbound Company, associated contacts/follow-ups/source URLs, and manually created Formal Customer.
- [ ] Add advisory relationship links only; never merge/move source records.
- [ ] Run focused tests and type/build checks; commit `feat: add inbound outbound and customer workflows`.

### Task 5: Quote vertical slice

**Files:** `src/components/romiku/quotes/`, conversion client/RPC tests.

- [ ] Write failing tests for selection confirmation from Inquiry, item snapshot creation, editable Quote quantities/prices/terms, and unchanged Inquiry originals.
- [ ] Implement direct/Inbound/Outbound/Customer Quote creation and tabbed Quote editor with totals including Other Expenses.
- [ ] Run focused and schema conversion tests; commit `feat: add quote workflow and immutable source lineage`.

### Task 6: PI, Order, and payments vertical slice

**Files:** `src/components/romiku/{pi,orders,payments}/`, conversion tests.

- [ ] Write failing tests for Quote-to-PI and PI/Quote-to-Order snapshot independence, direct creation, and deposit/balance calculations.
- [ ] Implement tabbed PI and Order detail pages, conversion confirmation, and payment recording.
- [ ] Run focused tests and type/build checks; commit `feat: add PI order and payment workflows`.

### Task 7: Production and Packing vertical slice

**Files:** `src/components/romiku/{production,packing}/`, packing/production tests.

- [ ] Write failing tests for one Supplier per Production Order, multiple Production Orders per Order, partial packing, remaining quantity, overpacking rejection, CBM, and total weight.
- [ ] Implement production creation grouped by selected Supplier and packing forms linked to immutable Order items.
- [ ] Run focused tests plus local database invariant tests; commit `feat: add production and packing workflows`.

### Task 8: Workbench and Calendar aggregation

**Files:** `src/components/romiku/{workbench,calendar}/`, aggregate view tests.

- [ ] Write failing tests for separated Website/Outbound counts, priority ordering, source deep links, owner filtering, and calendar event aggregation without duplicate event storage.
- [ ] Implement action-center cards, priority feed, date/list calendar, source navigation, and manual tasks.
- [ ] Run focused tests and type/build checks; commit `feat: add workbench and unified calendar`.

### Task 9: Vercel Website Inquiry API and production configuration

**Files:** `api/website-inquiries.*`, `vercel.json`, environment example/docs, endpoint tests.

- [ ] Write endpoint tests for missing/wrong secret, payload validation, optional company, raw payload persistence, and successful backward-compatible response.
- [ ] Implement a Vercel serverless function that uses server-only Supabase service-role credentials; add SPA rewrite support without exposing secrets.
- [ ] Verify local Vercel-style endpoint against local Supabase; commit `feat: add secure website inquiry intake API`.

### Task 10: Release verification and deployment readiness

**Files:** `e2e/today-mvp.spec.ts`, deployment runbook, production environment documentation.

- [ ] Build one Playwright smoke workflow covering both users and every required conversion/immutability path.
- [ ] Run local Supabase reset, schema diff, API test, Playwright smoke, `make test`, typecheck, lint, build.
- [ ] Stop for user-provided Supabase, Vercel, Sanity, DNS, and website-server configuration before any remote write/deploy.
- [ ] After user authorizes deployment, deploy only the new Supabase/Vercel resources, verify HTTPS and endpoint, then commit `test: verify Today MVP release readiness`.
