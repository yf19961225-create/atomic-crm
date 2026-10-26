# Business date implementation coverage

All below refer to existing edit controls. No date schema or historical data rewrite.

| Modules/tables | Existing editable fields | Semantics/control |
|---|---|---|
| Quote, PI, Order | document_date | DATE / common DatePicker, required |
| Quote | valid_until | DATE / DatePicker, nullable |
| PI JSON terms | terms_snapshot.valid_until, terms_snapshot.expected_delivery | Existing date-only JSON strings / DatePicker, nullable |
| Quote, PI, Order | due_at | timestamptz / DateTimePicker |
| PI, Order | deposit_due_at, balance_due_at | timestamptz / DateTimePicker |
| Order | expected_delivery_at, actual_delivery_at | timestamptz / DateTimePicker |
| Outbound / Website Inquiry / Production followups | contacted_at, next_follow_up_at | timestamptz / WorkflowFields DateTimePicker; existing instants no longer truncated on entering edit |
| Production | factory_due_at | DatePicker; existing productionDueDateInput/Payload remain Shanghai-day conversion authority |
| Packing | packing_at | timestamptz / DateTimePicker, existing DB NOT NULL reflected in required control |
| Payments | received_at | timestamptz / DateTimePicker, required |
| Manual task/calendar | due_at | timestamptz / DateTimePicker; entering edit preserves full saved instant |
| ProductSupplier admin form | reference_date | DATE / scoped react-admin calendar adapter |
| Procurement cost create | effective_date | DATE / scoped react-admin calendar adapter, required |
| Sanity product drawer cost create | effective_date | DATE / common DatePicker, required; calendar changes participate in cost dirty signature, reset clears date |

Date-only fields never pass through UTC slicing. Timestamp controls show local timezone and preserve wall clock time/seconds/milliseconds when date changes. Opening or canceling a picker emits no change. Unchanged ambiguous timestamp retains its original instant; a new ambiguous wall time requires explicit offset choice; nonexistent DST times are rejected.

Schema-only fields without an existing edit entry stay unexposed: Quote follow_up_at/deposit_due_at/balance_due_at, PI/Order follow_up_at. Outbound/Website Inquiry next_follow_up_at summaries remain followup-derived. System created_at/updated_at/status timestamps and auto completed_at remain read-only.

Two existing JSON date fields were discovered during integration (PI terms validity/expected delivery); they are included rather than silently leaving plain text dates behind. No new stored field is introduced.

Automated evidence: businessDate.test.ts validates actual browser timezone before assertions; RomikuDatePicker.test.tsx covers DATE keys and datetime keys, calendar month/year/today/clear/required/open-clean. Existing production due date and workbench tests retain Shanghai serialization. Further same-SHA real Preview coverage pending.
