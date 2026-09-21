--
-- Row Level Security
-- This file declares RLS policies for all tables.
--

-- Enable RLS on all tables
alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.contact_notes enable row level security;
alter table public.deals enable row level security;
alter table public.deal_notes enable row level security;
alter table public.sales enable row level security;
alter table public.tags enable row level security;
alter table public.tasks enable row level security;
alter table public.configuration enable row level security;
alter table public.favicons_excluded_domains enable row level security;

-- Companies
create policy "Enable read access for authenticated users" on public.companies for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.companies for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.companies for update to authenticated using (true) with check (true);
create policy "Company Delete Policy" on public.companies for delete to authenticated using (true);

-- Contacts
create policy "Enable read access for authenticated users" on public.contacts for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.contacts for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.contacts for update to authenticated using (true) with check (true);
create policy "Contact Delete Policy" on public.contacts for delete to authenticated using (true);

-- Contact Notes
create policy "Enable read access for authenticated users" on public.contact_notes for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.contact_notes for insert to authenticated with check (true);
create policy "Contact Notes Update policy" on public.contact_notes for update to authenticated using (true);
create policy "Contact Notes Delete Policy" on public.contact_notes for delete to authenticated using (true);

-- Deals
create policy "Enable read access for authenticated users" on public.deals for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.deals for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.deals for update to authenticated using (true) with check (true);
create policy "Deals Delete Policy" on public.deals for delete to authenticated using (true);

-- Deal Notes
create policy "Enable read access for authenticated users" on public.deal_notes for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.deal_notes for insert to authenticated with check (true);
create policy "Deal Notes Update Policy" on public.deal_notes for update to authenticated using (true);
create policy "Deal Notes Delete Policy" on public.deal_notes for delete to authenticated using (true);

-- Sales
create policy "Enable read access for authenticated users" on public.sales for select to authenticated using (true);

-- Tags
create policy "Enable read access for authenticated users" on public.tags for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tags for insert to authenticated with check (true);
create policy "Enable update for authenticated users only" on public.tags for update to authenticated using (true);
create policy "Enable delete for authenticated users only" on public.tags for delete to authenticated using (true);

-- Tasks
create policy "Enable read access for authenticated users" on public.tasks for select to authenticated using (true);
create policy "Enable insert for authenticated users only" on public.tasks for insert to authenticated with check (true);
create policy "Task Update Policy" on public.tasks for update to authenticated using (true);
create policy "Task Delete Policy" on public.tasks for delete to authenticated using (true);

-- Configuration (admin-only for writes)
create policy "Enable read for authenticated" on public.configuration for select to authenticated using (true);
create policy "Enable insert for admins" on public.configuration for insert to authenticated with check (public.is_admin());
create policy "Enable update for admins" on public.configuration for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Favicons excluded domains
create policy "Enable access for authenticated users only" on public.favicons_excluded_domains to authenticated using (true) with check (true);

-- ROMIKU shared-team MVP access; no anonymous policies.
alter table public.romiku_numbering_rules enable row level security;
create policy romiku_read on public.romiku_numbering_rules for select to authenticated using (true);
create policy romiku_write on public.romiku_numbering_rules for all to authenticated using (true) with check (true);
alter table public.romiku_outbound_companies enable row level security;
create policy romiku_read on public.romiku_outbound_companies for select to authenticated using (true);
create policy romiku_insert on public.romiku_outbound_companies for insert to authenticated with check (true);
create policy romiku_update on public.romiku_outbound_companies for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_outbound_companies for delete to authenticated using (true);
alter table public.romiku_outbound_contacts enable row level security;
create policy romiku_read on public.romiku_outbound_contacts for select to authenticated using (true);
create policy romiku_insert on public.romiku_outbound_contacts for insert to authenticated with check (true);
create policy romiku_update on public.romiku_outbound_contacts for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_outbound_contacts for delete to authenticated using (true);
alter table public.romiku_outbound_followups enable row level security;
create policy romiku_read on public.romiku_outbound_followups for select to authenticated using (true);
create policy romiku_insert on public.romiku_outbound_followups for insert to authenticated with check (true);
create policy romiku_update on public.romiku_outbound_followups for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_outbound_followups for delete to authenticated using (true);
alter table public.romiku_source_urls enable row level security;
create policy romiku_read on public.romiku_source_urls for select to authenticated using (true);
create policy romiku_insert on public.romiku_source_urls for insert to authenticated with check (true);
create policy romiku_update on public.romiku_source_urls for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_source_urls for delete to authenticated using (true);
alter table public.romiku_formal_customers enable row level security;
create policy romiku_read on public.romiku_formal_customers for select to authenticated using (true);
create policy romiku_insert on public.romiku_formal_customers for insert to authenticated with check (true);
create policy romiku_update on public.romiku_formal_customers for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_formal_customers for delete to authenticated using (true);
alter table public.romiku_customer_contacts enable row level security;
create policy romiku_read on public.romiku_customer_contacts for select to authenticated using (true);
create policy romiku_insert on public.romiku_customer_contacts for insert to authenticated with check (true);
create policy romiku_update on public.romiku_customer_contacts for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_customer_contacts for delete to authenticated using (true);
alter table public.romiku_website_inquiries enable row level security;
create policy romiku_read on public.romiku_website_inquiries for select to authenticated using (true);
create policy romiku_insert on public.romiku_website_inquiries for insert to authenticated with check (true);
create policy romiku_update on public.romiku_website_inquiries for update to authenticated using (true) with check (true);
alter table public.romiku_website_inquiry_items enable row level security;
create policy romiku_read on public.romiku_website_inquiry_items for select to authenticated using (true);
create policy romiku_insert on public.romiku_website_inquiry_items for insert to authenticated with check (true);
create policy romiku_update on public.romiku_website_inquiry_items for update to authenticated using (true) with check (true);
alter table public.romiku_website_inquiry_followups enable row level security;
create policy romiku_read on public.romiku_website_inquiry_followups for select to authenticated using (true);
create policy romiku_insert on public.romiku_website_inquiry_followups for insert to authenticated with check (true);
create policy romiku_update on public.romiku_website_inquiry_followups for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_website_inquiry_followups for delete to authenticated using (true);
alter table public.romiku_quotes enable row level security;
create policy romiku_read on public.romiku_quotes for select to authenticated using (true);
create policy romiku_insert on public.romiku_quotes for insert to authenticated with check (true);
create policy romiku_update on public.romiku_quotes for update to authenticated using (true) with check (true);
alter table public.romiku_quote_items enable row level security;
create policy romiku_read on public.romiku_quote_items for select to authenticated using (true);
create policy romiku_insert on public.romiku_quote_items for insert to authenticated with check (true);
create policy romiku_update on public.romiku_quote_items for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_quote_items for delete to authenticated using (true);
alter table public.romiku_quote_versions enable row level security;
create policy romiku_read on public.romiku_quote_versions for select to authenticated using (true);
create policy romiku_insert on public.romiku_quote_versions for insert to authenticated with check (true);
alter table public.romiku_pis enable row level security;
create policy romiku_read on public.romiku_pis for select to authenticated using (true);
create policy romiku_insert on public.romiku_pis for insert to authenticated with check (true);
create policy romiku_update on public.romiku_pis for update to authenticated using (true) with check (true);
alter table public.romiku_pi_items enable row level security;
create policy romiku_read on public.romiku_pi_items for select to authenticated using (true);
create policy romiku_insert on public.romiku_pi_items for insert to authenticated with check (true);
create policy romiku_update on public.romiku_pi_items for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_pi_items for delete to authenticated using (true);
alter table public.romiku_orders enable row level security;
create policy romiku_read on public.romiku_orders for select to authenticated using (true);
create policy romiku_insert on public.romiku_orders for insert to authenticated with check (true);
create policy romiku_update on public.romiku_orders for update to authenticated using (true) with check (true);
alter table public.romiku_document_daily_counters enable row level security;
alter table public.romiku_production_order_counters enable row level security;
alter table public.romiku_order_items enable row level security;
create policy romiku_read on public.romiku_order_items for select to authenticated using (true);
create policy romiku_insert on public.romiku_order_items for insert to authenticated with check (true);
create policy romiku_update on public.romiku_order_items for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_order_items for delete to authenticated using (true);
alter table public.romiku_payments enable row level security;
create policy romiku_read on public.romiku_payments for select to authenticated using (true);
create policy romiku_insert on public.romiku_payments for insert to authenticated with check (true);
create policy romiku_update on public.romiku_payments for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_payments for delete to authenticated using (true);
alter table public.romiku_suppliers enable row level security;
create policy romiku_read on public.romiku_suppliers for select to authenticated using (true);
create policy romiku_insert on public.romiku_suppliers for insert to authenticated with check (true);
create policy romiku_update on public.romiku_suppliers for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_suppliers for delete to authenticated using (true);
alter table public.romiku_supplier_contacts enable row level security;
create policy romiku_read on public.romiku_supplier_contacts for select to authenticated using (true);
create policy romiku_insert on public.romiku_supplier_contacts for insert to authenticated with check (true);
create policy romiku_update on public.romiku_supplier_contacts for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_supplier_contacts for delete to authenticated using (true);
alter table public.romiku_product_extensions enable row level security;
create policy romiku_read on public.romiku_product_extensions for select to authenticated using (true);
create policy romiku_insert on public.romiku_product_extensions for insert to authenticated with check (true);
create policy romiku_update on public.romiku_product_extensions for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_product_extensions for delete to authenticated using (true);
alter table public.romiku_product_suppliers enable row level security;
create policy romiku_read on public.romiku_product_suppliers for select to authenticated using (true);
create policy romiku_insert on public.romiku_product_suppliers for insert to authenticated with check (true);
create policy romiku_update on public.romiku_product_suppliers for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_product_suppliers for delete to authenticated using (true);
alter table public.romiku_procurement_cost_history enable row level security;
create policy romiku_read on public.romiku_procurement_cost_history for select to authenticated using (true);
create policy romiku_insert on public.romiku_procurement_cost_history for insert to authenticated with check (true);
alter table public.romiku_production_orders enable row level security;
create policy romiku_read on public.romiku_production_orders for select to authenticated using (true);
create policy romiku_insert on public.romiku_production_orders for insert to authenticated with check (true);
create policy romiku_update on public.romiku_production_orders for update to authenticated using (true) with check (true);
alter table public.romiku_production_items enable row level security;
create policy romiku_read on public.romiku_production_items for select to authenticated using (true);
create policy romiku_insert on public.romiku_production_items for insert to authenticated with check (true);
create policy romiku_update on public.romiku_production_items for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_production_items for delete to authenticated using (true);
alter table public.romiku_production_followups enable row level security;
create policy romiku_read on public.romiku_production_followups for select to authenticated using (true);
create policy romiku_insert on public.romiku_production_followups for insert to authenticated with check (true);
create policy romiku_update on public.romiku_production_followups for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_production_followups for delete to authenticated using (true);
alter table public.romiku_packing_lists enable row level security;
create policy romiku_read on public.romiku_packing_lists for select to authenticated using (true);
create policy romiku_insert on public.romiku_packing_lists for insert to authenticated with check (true);
create policy romiku_update on public.romiku_packing_lists for update to authenticated using (true) with check (true);
alter table public.romiku_packing_items enable row level security;
create policy romiku_read on public.romiku_packing_items for select to authenticated using (true);
create policy romiku_insert on public.romiku_packing_items for insert to authenticated with check (true);
create policy romiku_update on public.romiku_packing_items for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_packing_items for delete to authenticated using (true);
alter table public.romiku_manual_tasks enable row level security;
create policy romiku_read on public.romiku_manual_tasks for select to authenticated using (true);
create policy romiku_insert on public.romiku_manual_tasks for insert to authenticated with check (true);
create policy romiku_update on public.romiku_manual_tasks for update to authenticated using (true) with check (true);
create policy romiku_delete on public.romiku_manual_tasks for delete to authenticated using (true);
