# ROMIKU core database contract

The declarative source is `supabase/schemas/01_tables.sql` through `06_grants.sql`.
All ROMIKU business objects use explicit `romiku_*` tables. Atomic tables and
permissions remain unchanged. Sanity remains external: product extensions store
only IDs, SKUs and internal information; commercial rows own their JSON snapshots.

## Access and audit

Authenticated business users share read/write access in this two-user MVP.
Ownership supports filtering and assignment; it is not a row visibility boundary.
Every table has owner, created/updated timestamps and auth-user audit references.
Audit triggers stamp the actual actor and preserve the original creator.
Website inquiries default to an unassigned owner, including service-role intake;
service writes without a user have null audit-user references.

Anonymous roles have no ROMIKU table, view, sequence or RPC privileges.
Core document headers and original inquiry items cannot be deleted by business
users; use `archived_at` on headers. Quote versions and cost history are append-only.
Numbering configuration writes require Atomic's existing admin check.
The MVP shares procurement and bank snapshots with authenticated users; finer
field-level permissions remain a future permissions task.

## Document snapshots and RPCs

- `romiku_quote_from_inquiry(inquiry_id, selected_item_ids)` copies only the
  explicitly selected, distinct inquiry item IDs. Empty/foreign selections fail.
- `romiku_convert_document(source_kind, source_id, target_kind)` accepts
  Quote → PI, Quote → Order and PI → Order. It inserts a separate header and item
  rows transactionally. A failure rolls the whole call back.
- `romiku_publish_quote_version(quote_id)` retains the header and all item JSON
  as a numbered historical version. Draft edits never rewrite that version.

RPC calls execute as the caller under RLS. Header locks and item-parent locks
serialize document edits against snapshot creation. Downstream edits never
write to the source. Inbound, outbound and formal-customer records never
automatically convert, synchronize, or create one another. Statuses stay manual.

`product_snapshot`, `packing_snapshot`, `counterparty_snapshot`,
`terms_snapshot` and `bank_snapshot` contain the selected values at document
creation; consumers render these saved values rather than re-querying master data.
Draft snapshot fields remain editable. An issued quote can be retained explicitly
using the version RPC. Temporary items need only a SKU and quantity.

Numbers are generated on insert, unique within each document table, and immutable.
The global PostgreSQL sequence avoids concurrent collisions; gaps are normal.
Default prefixes are WI, Q, PI, SO, PO and PL. Admins may override prefix and
minimum digits by document kind in `romiku_numbering_rules`.

## Quantities and financial data

Amounts are generated from quantity × unit price, rounded per line to two decimals.
The totals views derive subtotal + freight + other expenses − discount. No client
total is stored or trusted. Payment currency is inherited from the order.
`romiku_order_totals` includes received, remaining and deposit amounts.

Production headers require exactly one supplier. Items inherit that supplier.
Composite foreign keys prevent production and packing items from referencing a
different order. Production quantities and unallocated quantities are derived for
auditing; this MVP does not automatically select suppliers or block reallocations.

Packing supports multiple partial lists. A row lock serializes allocations against
the source order item; inserts, updates and reductions of the ordered quantity
cannot leave packed quantity above ordered quantity. Source item identity cannot
be moved. These quantity-changing writes require PostgreSQL READ COMMITTED (the
PostgREST default); fixed-snapshot transactions are rejected with SQLSTATE 40001
and must retry in READ COMMITTED. Packing changes do not rewrite order quantities
or product snapshots. Dimensions are centimetres and weights kilograms.

## Derived read models

`romiku_calendar` and `romiku_workbench` are security-invoker views over source
dates and states, with source table/ID, owner and event type. There is no duplicate
business-event table. Manual tasks use real foreign keys and at most one related
object. Recurrence is stored as metadata; no background expansion is implemented.

Other views cover document totals, remaining packing/production quantities,
packing carton/CBM/weight totals, outbound follow-up statistics, and latest
applicable supplier cost per currency. Follow-up record history and the parent
record's current next-follow-up schedule are distinct fields; callers update the
current schedule explicitly without changing business status.

## Local verification and migration caveat

Use Node 22 and the local `atomic-crm-demo` Supabase stack:

```sh
npx supabase db reset --local
npx supabase test db supabase/tests/romiku_core.test.sql
node --test supabase/tests/romiku_concurrency.mjs
npx supabase db diff --local
```

The SQL suite uses real roles, auth users and transactions, and rolls back fixtures.
Concurrency tests use Docker/psql with fresh UUIDs and remove only their own rows.

The installed migra generator omits view `security_invoker` options and privilege
revocations inherited from default grants. The generated migration therefore ends
with explicit view options and the exact ROMIKU grant/revoke block from the
declarative schema. Keep these corrections when regenerating: a no-diff report
alone does not validate permissions. The SQL suite checks actual post-reset
privileges and view options.

