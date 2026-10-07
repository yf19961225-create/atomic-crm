# Migration inventory — not an execution list

Production status for every row: unknown until ledger audit. Current HEAD requires all 32 as a tested prefix; none is approved to skip. Dependencies are conservative release ordering, not a proof of minimal SQL dependencies. Preview evidence comes from retained local apply records; rows without such evidence require a live ledger read after separate authorization.

| Order | Migration | Introduced | Preview evidence | Dependencies |
|---|---|---|---|---|
| 1 | 20260920110000_commercial_line_items_v2.sql | 87cad68a5d6a | requires ledger confirmation | 20260918012451_romiku_website_intake.sql, 20260916023724_romiku_core_review_fixes.sql |
| 2 | 20260920120000_document_language.sql | 5a533b0631de | requires ledger confirmation | 20260920110000_commercial_line_items_v2.sql |
| 3 | 20260921090000_commercial_document_numbering.sql | e3a6427912bd | requires ledger confirmation | 20260920110000_commercial_line_items_v2.sql |
| 4 | 20260921093000_formal_customer_directory.sql | 4967b55d1b12 | requires ledger confirmation | 20260920110000_commercial_line_items_v2.sql |
| 5 | 20260921100000_production_supplier_optional.sql | 005fe0311dcb | requires ledger confirmation | 20260920110000_commercial_line_items_v2.sql |
| 6 | 20260923153000_order_export_snapshot.sql | 4f368c3fc60a | requires ledger confirmation | 20260920110000_commercial_line_items_v2.sql, 20260920120000_document_language.sql |
| 7 | 20260925090000_repair_daily_document_number_allocator.sql | 245d23e27923 | requires ledger confirmation | 20260921090000_commercial_document_numbering.sql |
| 8 | 20260928150000_order_document_number_od.sql | 36e5129eb32e | requires ledger confirmation | 20260925090000_repair_daily_document_number_allocator.sql |
| 9 | 20260930120000_pi_number_prefix.sql | e5458c0d3671 | requires ledger confirmation | 20260925090000_repair_daily_document_number_allocator.sql |
| 10 | 20260930130000_quote_export_snapshot.sql | e6bd02b78d24 | requires ledger confirmation | 20260923153000_order_export_snapshot.sql |
| 11 | 20260930143000_quote_fx_pricing.sql | 1fb42b45d602 | requires ledger confirmation | 20260930130000_quote_export_snapshot.sql |
| 12 | 20261002100000_packing_export_snapshot.sql | f4cbcf8eb285 | requires ledger confirmation | 20260920110000_commercial_line_items_v2.sql |
| 13 | 20261002143000_packing_independent_creation.sql | 8172c16c9084 | requires ledger confirmation | 20261002100000_packing_export_snapshot.sql |
| 14 | 20261002160000_controlled_record_delete.sql | bfb1528f89c1 | recorded applied | 20261002143000_packing_independent_creation.sql |
| 15 | 20261003100000_production_controlled_delete.sql | ba4510bd998b | recorded applied | 20261002160000_controlled_record_delete.sql |
| 16 | 20261003110000_business_search.sql | ba4510bd998b | recorded applied | 20260921093000_formal_customer_directory.sql, 20261002143000_packing_independent_creation.sql |
| 17 | 20261003150000_production_marking_snapshot.sql | f07f52a65036 | recorded applied | 20260921100000_production_supplier_optional.sql |
| 18 | 20261003180000_production_instruction_inheritance.sql | 76dbba3a3903 | recorded applied | 20261003150000_production_marking_snapshot.sql |
| 19 | 20261004160000_customer_business_history.sql | d0f03589bf42 | recorded applied | 20261003110000_business_search.sql, 20261003180000_production_instruction_inheritance.sql |
| 20 | 20261004190000_production_workbench.sql | 715cea47272f | recorded applied | 20261003180000_production_instruction_inheritance.sql |
| 21 | 20261004220000_production_allocation_guard.sql | 7fefa5cec6e9 | recorded applied | 20261004190000_production_workbench.sql |
| 22 | 20261005100000_production_sync_verification.sql | 233caa12291f | recorded applied | 20261004190000_production_workbench.sql, 20261004220000_production_allocation_guard.sql |
| 23 | 20261005120000_production_item_small_labels.sql | c176233c68fd | recorded applied | 20261003180000_production_instruction_inheritance.sql, 20261004190000_production_workbench.sql |
| 24 | 20261005150000_production_barcodes.sql | 03f5f18d843f | recorded applied | 20261005120000_production_item_small_labels.sql |
| 25 | 20261006100000_order_cascade_delete.sql | d6e45733988a | recorded applied | 20261003100000_production_controlled_delete.sql, 20261005150000_production_barcodes.sql |
| 26 | 20261006130000_workflow_status.sql | 00168a0ca5d5 | recorded applied | 20261006100000_order_cascade_delete.sql, 20261004160000_customer_business_history.sql |
| 27 | 20261006131000_financial_workflow.sql | 00168a0ca5d5 | recorded applied | 20261006130000_workflow_status.sql |
| 28 | 20261006132000_bulk_workflow.sql | 00168a0ca5d5 | recorded applied | 20261006130000_workflow_status.sql, 20261006131000_financial_workflow.sql |
| 29 | 20261006133000_controlled_inquiry_delete.sql | ba397a2b909a | recorded applied | 20261002160000_controlled_record_delete.sql, 20261006132000_bulk_workflow.sql |
| 30 | 20261006150000_quote_inquiry_workflow.sql | fc5537dd69fa | recorded applied | 20261006130000_workflow_status.sql, 20261006133000_controlled_inquiry_delete.sql |
| 31 | 20261006170000_status_history.sql | 94da58bc86e2 | recorded applied | 20261006130000_workflow_status.sql, 20261006131000_financial_workflow.sql, 20261006150000_quote_inquiry_workflow.sql |
| 32 | 20261006190000_inquiry_quote_snapshots.sql | a3ae722feae7 | recorded applied | 20260918012451_romiku_website_intake.sql, 20260920110000_commercial_line_items_v2.sql, 20261002160000_controlled_record_delete.sql, 20261003110000_business_search.sql, 20261006133000_controlled_inquiry_delete.sql, 20261006150000_quote_inquiry_workflow.sql, 20261006170000_status_history.sql |
