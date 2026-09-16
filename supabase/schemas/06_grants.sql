--
-- Grants
-- This file declares all grants and default privileges for the public schema.
--

-- Schema usage
grant usage on schema public to postgres;
grant usage on schema public to anon;
grant usage on schema public to authenticated;
grant usage on schema public to service_role;

-- Function grants
grant all on function public.cleanup_note_attachments() to anon;
grant all on function public.cleanup_note_attachments() to authenticated;
grant all on function public.cleanup_note_attachments() to service_role;

grant all on function public.get_avatar_for_email(text) to anon;
grant all on function public.get_avatar_for_email(text) to authenticated;
grant all on function public.get_avatar_for_email(text) to service_role;

grant all on function public.get_domain_favicon(text) to anon;
grant all on function public.get_domain_favicon(text) to authenticated;
grant all on function public.get_domain_favicon(text) to service_role;

grant all on function public.get_note_attachments_function_url() to anon;
grant all on function public.get_note_attachments_function_url() to authenticated;
grant all on function public.get_note_attachments_function_url() to service_role;

revoke all on function public.get_user_id_by_email(text) from public;
grant all on function public.get_user_id_by_email(text) to service_role;

grant all on function public.handle_company_saved() to anon;
grant all on function public.handle_company_saved() to authenticated;
grant all on function public.handle_company_saved() to service_role;

grant all on function public.handle_contact_note_created_or_updated() to anon;
grant all on function public.handle_contact_note_created_or_updated() to authenticated;
grant all on function public.handle_contact_note_created_or_updated() to service_role;

grant all on function public.handle_contact_saved() to anon;
grant all on function public.handle_contact_saved() to authenticated;
grant all on function public.handle_contact_saved() to service_role;

grant all on function public.handle_new_user() to anon;
grant all on function public.handle_new_user() to authenticated;
grant all on function public.handle_new_user() to service_role;

grant all on function public.handle_update_user() to anon;
grant all on function public.handle_update_user() to authenticated;
grant all on function public.handle_update_user() to service_role;

grant all on function public.is_admin() to anon;
grant all on function public.is_admin() to authenticated;
grant all on function public.is_admin() to service_role;

grant all on function public.lowercase_email_jsonb() to anon;
grant all on function public.lowercase_email_jsonb() to authenticated;
grant all on function public.lowercase_email_jsonb() to service_role;

grant all on function public.merge_contacts(bigint, bigint) to anon;
grant all on function public.merge_contacts(bigint, bigint) to authenticated;
grant all on function public.merge_contacts(bigint, bigint) to service_role;

grant all on function public.set_sales_id_default() to anon;
grant all on function public.set_sales_id_default() to authenticated;
grant all on function public.set_sales_id_default() to service_role;

-- Table grants
grant all on table public.companies to anon;
grant all on table public.companies to authenticated;
grant all on table public.companies to service_role;

grant all on table public.contacts to anon;
grant all on table public.contacts to authenticated;
grant all on table public.contacts to service_role;

grant all on table public.contact_notes to anon;
grant all on table public.contact_notes to authenticated;
grant all on table public.contact_notes to service_role;

grant all on table public.deals to anon;
grant all on table public.deals to authenticated;
grant all on table public.deals to service_role;

grant all on table public.deal_notes to anon;
grant all on table public.deal_notes to authenticated;
grant all on table public.deal_notes to service_role;

grant all on table public.sales to anon;
grant all on table public.sales to authenticated;
grant all on table public.sales to service_role;

grant all on table public.tags to anon;
grant all on table public.tags to authenticated;
grant all on table public.tags to service_role;

grant all on table public.tasks to anon;
grant all on table public.tasks to authenticated;
grant all on table public.tasks to service_role;

grant all on table public.configuration to anon;
grant all on table public.configuration to authenticated;
grant all on table public.configuration to service_role;

grant all on table public.favicons_excluded_domains to anon;
grant all on table public.favicons_excluded_domains to authenticated;
grant all on table public.favicons_excluded_domains to service_role;

-- View grants
grant all on table public.activity_log to anon;
grant all on table public.activity_log to authenticated;
grant all on table public.activity_log to service_role;

grant all on table public.companies_summary to anon;
grant all on table public.companies_summary to authenticated;
grant all on table public.companies_summary to service_role;

grant all on table public.contacts_summary to anon;
grant all on table public.contacts_summary to authenticated;
grant all on table public.contacts_summary to service_role;

grant all on table public.init_state to anon;
grant all on table public.init_state to authenticated;
grant all on table public.init_state to service_role;

-- Sequence grants
grant all on sequence public.companies_id_seq to anon;
grant all on sequence public.companies_id_seq to authenticated;
grant all on sequence public.companies_id_seq to service_role;

grant all on sequence public."contactNotes_id_seq" to anon;
grant all on sequence public."contactNotes_id_seq" to authenticated;
grant all on sequence public."contactNotes_id_seq" to service_role;

grant all on sequence public.contacts_id_seq to anon;
grant all on sequence public.contacts_id_seq to authenticated;
grant all on sequence public.contacts_id_seq to service_role;

grant all on sequence public."dealNotes_id_seq" to anon;
grant all on sequence public."dealNotes_id_seq" to authenticated;
grant all on sequence public."dealNotes_id_seq" to service_role;

grant all on sequence public.deals_id_seq to anon;
grant all on sequence public.deals_id_seq to authenticated;
grant all on sequence public.deals_id_seq to service_role;

grant all on sequence public.favicons_excluded_domains_id_seq to anon;
grant all on sequence public.favicons_excluded_domains_id_seq to authenticated;
grant all on sequence public.favicons_excluded_domains_id_seq to service_role;

grant all on sequence public.sales_id_seq to anon;
grant all on sequence public.sales_id_seq to authenticated;
grant all on sequence public.sales_id_seq to service_role;

grant all on sequence public.tags_id_seq to anon;
grant all on sequence public.tags_id_seq to authenticated;
grant all on sequence public.tags_id_seq to service_role;

grant all on sequence public.tasks_id_seq to anon;
grant all on sequence public.tasks_id_seq to authenticated;
grant all on sequence public.tasks_id_seq to service_role;

-- Default privileges
alter default privileges for role postgres in schema public grant all on sequences to postgres;
alter default privileges for role postgres in schema public grant all on sequences to anon;
alter default privileges for role postgres in schema public grant all on sequences to authenticated;
alter default privileges for role postgres in schema public grant all on sequences to service_role;

alter default privileges for role postgres in schema public grant all on functions to postgres;
alter default privileges for role postgres in schema public grant all on functions to anon;
alter default privileges for role postgres in schema public grant all on functions to authenticated;
alter default privileges for role postgres in schema public grant all on functions to service_role;

alter default privileges for role postgres in schema public grant all on tables to postgres;
alter default privileges for role postgres in schema public grant all on tables to anon;
alter default privileges for role postgres in schema public grant all on tables to authenticated;
alter default privileges for role postgres in schema public grant all on tables to service_role;

-- Explicit revokes override Supabase/Atomic default PUBLIC/anon privileges.
revoke all on table public.romiku_numbering_rules from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_numbering_rules to authenticated;
grant all on table public.romiku_numbering_rules to service_role;
revoke all on table public.romiku_outbound_companies from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_outbound_companies to authenticated;
grant all on table public.romiku_outbound_companies to service_role;
revoke all on table public.romiku_outbound_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_outbound_contacts to authenticated;
grant all on table public.romiku_outbound_contacts to service_role;
revoke all on table public.romiku_outbound_followups from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_outbound_followups to authenticated;
grant all on table public.romiku_outbound_followups to service_role;
revoke all on table public.romiku_source_urls from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_source_urls to authenticated;
grant all on table public.romiku_source_urls to service_role;
revoke all on table public.romiku_formal_customers from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_formal_customers to authenticated;
grant all on table public.romiku_formal_customers to service_role;
revoke all on table public.romiku_customer_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_customer_contacts to authenticated;
grant all on table public.romiku_customer_contacts to service_role;
revoke all on table public.romiku_website_inquiries from public, anon, authenticated;
grant select, insert, update on table public.romiku_website_inquiries to authenticated;
grant all on table public.romiku_website_inquiries to service_role;
revoke all on table public.romiku_website_inquiry_items from public, anon, authenticated;
grant select, insert, update on table public.romiku_website_inquiry_items to authenticated;
grant all on table public.romiku_website_inquiry_items to service_role;
revoke all on table public.romiku_website_inquiry_followups from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_website_inquiry_followups to authenticated;
grant all on table public.romiku_website_inquiry_followups to service_role;
revoke all on table public.romiku_quotes from public, anon, authenticated;
grant select, insert, update on table public.romiku_quotes to authenticated;
grant all on table public.romiku_quotes to service_role;
revoke all on table public.romiku_quote_items from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_quote_items to authenticated;
grant all on table public.romiku_quote_items to service_role;
revoke all on table public.romiku_quote_versions from public, anon, authenticated;
grant select, insert on table public.romiku_quote_versions to authenticated;
grant all on table public.romiku_quote_versions to service_role;
revoke all on table public.romiku_pis from public, anon, authenticated;
grant select, insert, update on table public.romiku_pis to authenticated;
grant all on table public.romiku_pis to service_role;
revoke all on table public.romiku_pi_items from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_pi_items to authenticated;
grant all on table public.romiku_pi_items to service_role;
revoke all on table public.romiku_orders from public, anon, authenticated;
grant select, insert, update on table public.romiku_orders to authenticated;
grant all on table public.romiku_orders to service_role;
revoke all on table public.romiku_order_items from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_order_items to authenticated;
grant all on table public.romiku_order_items to service_role;
revoke all on table public.romiku_payments from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_payments to authenticated;
grant all on table public.romiku_payments to service_role;
revoke all on table public.romiku_suppliers from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_suppliers to authenticated;
grant all on table public.romiku_suppliers to service_role;
revoke all on table public.romiku_supplier_contacts from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_supplier_contacts to authenticated;
grant all on table public.romiku_supplier_contacts to service_role;
revoke all on table public.romiku_product_extensions from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_product_extensions to authenticated;
grant all on table public.romiku_product_extensions to service_role;
revoke all on table public.romiku_product_suppliers from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_product_suppliers to authenticated;
grant all on table public.romiku_product_suppliers to service_role;
revoke all on table public.romiku_procurement_cost_history from public, anon, authenticated;
grant select, insert on table public.romiku_procurement_cost_history to authenticated;
grant all on table public.romiku_procurement_cost_history to service_role;
revoke all on table public.romiku_production_orders from public, anon, authenticated;
grant select, insert, update on table public.romiku_production_orders to authenticated;
grant all on table public.romiku_production_orders to service_role;
revoke all on table public.romiku_production_items from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_production_items to authenticated;
grant all on table public.romiku_production_items to service_role;
revoke all on table public.romiku_production_followups from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_production_followups to authenticated;
grant all on table public.romiku_production_followups to service_role;
revoke all on table public.romiku_packing_lists from public, anon, authenticated;
grant select, insert, update on table public.romiku_packing_lists to authenticated;
grant all on table public.romiku_packing_lists to service_role;
revoke all on table public.romiku_packing_items from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_packing_items to authenticated;
grant all on table public.romiku_packing_items to service_role;
revoke all on table public.romiku_manual_tasks from public, anon, authenticated;
grant select, insert, update, delete on table public.romiku_manual_tasks to authenticated;
grant all on table public.romiku_manual_tasks to service_role;
revoke all on table public.romiku_quote_totals from public, anon, authenticated;
grant select on table public.romiku_quote_totals to authenticated, service_role;
revoke all on table public.romiku_pi_totals from public, anon, authenticated;
grant select on table public.romiku_pi_totals to authenticated, service_role;
revoke all on table public.romiku_order_totals from public, anon, authenticated;
grant select on table public.romiku_order_totals to authenticated, service_role;
revoke all on table public.romiku_order_item_remaining from public, anon, authenticated;
grant select on table public.romiku_order_item_remaining to authenticated, service_role;
revoke all on table public.romiku_packing_totals from public, anon, authenticated;
grant select on table public.romiku_packing_totals to authenticated, service_role;
revoke all on table public.romiku_outbound_summary from public, anon, authenticated;
grant select on table public.romiku_outbound_summary to authenticated, service_role;
revoke all on table public.romiku_current_reference_cost from public, anon, authenticated;
grant select on table public.romiku_current_reference_cost to authenticated, service_role;
revoke all on table public.romiku_calendar from public, anon, authenticated;
grant select on table public.romiku_calendar to authenticated, service_role;
revoke all on table public.romiku_workbench from public, anon, authenticated;
grant select on table public.romiku_workbench to authenticated, service_role;
revoke all on sequence public.romiku_document_number_seq from public, anon, authenticated;
grant usage on sequence public.romiku_document_number_seq to authenticated, service_role;
revoke all on function public.romiku_audit() from public, anon, authenticated;
grant execute on function public.romiku_audit() to authenticated, service_role;
revoke all on function public.romiku_assign_number() from public, anon, authenticated;
grant execute on function public.romiku_assign_number() to authenticated, service_role;
revoke all on function public.romiku_preserve_inquiry() from public, anon, authenticated;
grant execute on function public.romiku_preserve_inquiry() to authenticated, service_role;
revoke all on function public.romiku_preserve_history() from public, anon, authenticated;
grant execute on function public.romiku_preserve_history() to authenticated, service_role;
revoke all on function public.romiku_lock_document_parent() from public, anon, authenticated;
grant execute on function public.romiku_lock_document_parent() to authenticated, service_role;
revoke all on function public.romiku_check_packing_quantity() from public, anon, authenticated;
grant execute on function public.romiku_check_packing_quantity() to authenticated, service_role;
revoke all on function public.romiku_check_order_quantity() from public, anon, authenticated;
grant execute on function public.romiku_check_order_quantity() to authenticated, service_role;
revoke all on function public.romiku_quote_from_inquiry(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.romiku_quote_from_inquiry(uuid, uuid[]) to authenticated, service_role;
revoke all on function public.romiku_convert_document(text, uuid, text) from public, anon, authenticated;
grant execute on function public.romiku_convert_document(text, uuid, text) to authenticated, service_role;
revoke all on function public.romiku_publish_quote_version(uuid) from public, anon, authenticated;
grant execute on function public.romiku_publish_quote_version(uuid) to authenticated, service_role;
