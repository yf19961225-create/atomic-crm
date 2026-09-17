# Workbench and unified Calendar

Workbench is a daily action center. Cards select a filtered priority feed using
the `action` URL parameter, and each feed item opens its exact source record.
Website and Outbound counts are independent. Pending Quotes and PI include draft
and sent documents even when no date is set. Overdue actions sort first by date,
then urgent tasks/production anomalies, new inquiries, scheduled and unscheduled
work. Receivables show separate deposit and balance amounts in each Order's
currency; they are never summed across currencies. Deposit is capped by the
Order's actual remaining amount, with the rest shown as balance.

The calendar reads the existing `romiku_calendar` security-invoker view. It
shows Website/Outbound follow-ups, Quote/PI follow-up and due dates, Order
delivery, Production due, Packing dates, and dated incomplete manual tasks.
Its date-grouped and list views support inclusive local dates, source type,
owner, and Only mine. ROMIKU ownership uses auth user UUIDs, so Only mine resolves
Atomic's numeric sales identity through `sales.user_id`. Both V1 users retain
shared access; these filters are not permissions.

Source edits are reflected by the database view without writing a second event.
Both aggregate screens reload on mount, focus and every minute, and provide a
manual Refresh action. All source reads page through the provider to avoid
silently truncating counts at 100 records. Workbench reuses `romiku_workbench`
and existing source/totals resources for undated work and financial breakdowns.
There is no new table, view, migration, or calendar event write.

Manual tasks can be unscheduled or dated, assigned, prioritized, completed and
reopened. Their optional relationship is limited to one of the existing schema's
Outbound, Formal Customer, Quote, PI, Order, Production Order or Supplier links.
Changing the relationship clears the previous foreign key. Website Inquiry and
Packing relationships are unavailable because the existing schema does not
allow them. Undated and completed tasks remain accessible in the manual task
list. No recurrence, reminder engine, calendar drag editing or external sync is
implemented.

Packing lists do not have a shipment-completed status in the existing schema;
all unarchived lists remain in the packing/shipping card. The UI currently
cannot archive a list, so removing an actionable Packing action requires a
database/API action. Order delivery appears as a separate action while its
expected delivery date is set and actual delivery is unset. Pending document
cards use document status; the calendar retains the dated Quote/PI behavior
defined by the original view.

Verification (Node 22):

```sh
npx vitest run --project app src/components/romiku/workbench
npx supabase test db supabase/tests/romiku_calendar.test.sql
npx supabase test db supabase/tests/romiku_core.test.sql
make typecheck
make lint
make build
make test
```

Task8 adds 15 frontend tests and 20 rollback-only database assertions. The full
suite at this task has 636 passing tests, one skipped test, and only the six
documented Atomic harness failures in `baseline-exception.md`.
