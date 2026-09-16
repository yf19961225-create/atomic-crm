--
-- Triggers
-- This file declares all triggers.
--

-- Auto-populate sales_id from current auth user on insert
create or replace trigger set_company_sales_id_trigger
    before insert on public.companies
    for each row execute function public.set_sales_id_default();

create or replace trigger set_contact_sales_id_trigger
    before insert on public.contacts
    for each row execute function public.set_sales_id_default();

create or replace trigger set_contact_notes_sales_id_trigger
    before insert on public.contact_notes
    for each row execute function public.set_sales_id_default();

create or replace trigger set_deal_sales_id_trigger
    before insert on public.deals
    for each row execute function public.set_sales_id_default();

create or replace trigger set_deal_notes_sales_id_trigger
    before insert on public.deal_notes
    for each row execute function public.set_sales_id_default();

create or replace trigger set_task_sales_id_trigger
    before insert on public.tasks
    for each row execute function public.set_sales_id_default();

-- Auto-fetch company logo from website favicon on save
create or replace trigger company_saved
    before insert or update on public.companies
    for each row execute function public.handle_company_saved();

-- Lowercase contact emails before insert or update (must run before contact_saved)
create or replace trigger "10_lowercase_contact_emails"
    before insert or update on public.contacts
    for each row execute function public.lowercase_email_jsonb();

-- Auto-fetch contact avatar from email on save (runs after lowercase_contact_emails)
create or replace trigger "20_contact_saved"
    before insert or update on public.contacts
    for each row execute function public.handle_contact_saved();

-- Update contact.last_seen when a contact note is created
create or replace trigger on_public_contact_notes_created_or_updated
    after insert on public.contact_notes
    for each row execute function public.handle_contact_note_created_or_updated();

-- Cleanup storage attachments when contact notes are updated or deleted
create or replace trigger on_contact_notes_attachments_updated_delete_note_attachments
    after update on public.contact_notes
    for each row
    when (old.attachments is distinct from new.attachments)
    execute function public.cleanup_note_attachments();

create or replace trigger on_contact_notes_deleted_delete_note_attachments
    after delete on public.contact_notes
    for each row execute function public.cleanup_note_attachments();

-- Cleanup storage attachments when deal notes are updated or deleted
create or replace trigger on_deal_notes_attachments_updated_delete_note_attachments
    after update on public.deal_notes
    for each row
    when (old.attachments is distinct from new.attachments)
    execute function public.cleanup_note_attachments();

create or replace trigger on_deal_notes_deleted_delete_note_attachments
    after delete on public.deal_notes
    for each row execute function public.cleanup_note_attachments();

-- Auth triggers: sync auth.users to public.sales
create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

create or replace trigger on_auth_user_updated
    after update on auth.users
    for each row execute function public.handle_update_user();

-- ROMIKU triggers
create trigger romiku_audit before insert or update on public.romiku_numbering_rules for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_outbound_companies for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_outbound_contacts for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_outbound_followups for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_source_urls for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_formal_customers for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_customer_contacts for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_website_inquiries for each row execute function public.romiku_audit();
create trigger romiku_number before insert or update on public.romiku_website_inquiries for each row execute function public.romiku_assign_number('inquiry','WI');
create trigger romiku_audit before insert or update on public.romiku_website_inquiry_items for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_website_inquiry_followups for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_quotes for each row execute function public.romiku_audit();
create trigger romiku_number before insert or update on public.romiku_quotes for each row execute function public.romiku_assign_number('quote','Q');
create trigger romiku_audit before insert or update on public.romiku_quote_items for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_quote_versions for each row execute function public.romiku_audit();
create trigger romiku_history before update or delete on public.romiku_quote_versions for each row execute function public.romiku_preserve_history();
create trigger romiku_audit before insert or update on public.romiku_pis for each row execute function public.romiku_audit();
create trigger romiku_number before insert or update on public.romiku_pis for each row execute function public.romiku_assign_number('pi','PI');
create trigger romiku_audit before insert or update on public.romiku_pi_items for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_orders for each row execute function public.romiku_audit();
create trigger romiku_number before insert or update on public.romiku_orders for each row execute function public.romiku_assign_number('order','SO');
create trigger romiku_audit before insert or update on public.romiku_order_items for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_payments for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_suppliers for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_supplier_contacts for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_product_extensions for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_product_suppliers for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_procurement_cost_history for each row execute function public.romiku_audit();
create trigger romiku_history before update or delete on public.romiku_procurement_cost_history for each row execute function public.romiku_preserve_history();
create trigger romiku_audit before insert or update on public.romiku_production_orders for each row execute function public.romiku_audit();
create trigger romiku_number before insert or update on public.romiku_production_orders for each row execute function public.romiku_assign_number('production','PO');
create trigger romiku_audit before insert or update on public.romiku_production_items for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_production_followups for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_packing_lists for each row execute function public.romiku_audit();
create trigger romiku_number before insert or update on public.romiku_packing_lists for each row execute function public.romiku_assign_number('packing','PL');
create trigger romiku_audit before insert or update on public.romiku_packing_items for each row execute function public.romiku_audit();
create trigger romiku_audit before insert or update on public.romiku_manual_tasks for each row execute function public.romiku_audit();
create trigger romiku_original before update or delete on public.romiku_website_inquiries for each row execute function public.romiku_preserve_inquiry();
create trigger romiku_original before update or delete on public.romiku_website_inquiry_items for each row execute function public.romiku_preserve_inquiry();
create trigger romiku_parent_lock before insert or update or delete on public.romiku_quote_items for each row execute function public.romiku_lock_document_parent('romiku_quotes','quote_id');
create trigger romiku_parent_lock before insert or update or delete on public.romiku_pi_items for each row execute function public.romiku_lock_document_parent('romiku_pis','pi_id');
create trigger romiku_parent_lock before insert or update or delete on public.romiku_order_items for each row execute function public.romiku_lock_document_parent('romiku_orders','order_id');
create trigger romiku_parent_lock before insert or update or delete on public.romiku_website_inquiry_items for each row execute function public.romiku_lock_document_parent('romiku_website_inquiries','inquiry_id');
create trigger romiku_packing_quantity before insert or update on public.romiku_packing_items for each row execute function public.romiku_check_packing_quantity();
create trigger romiku_order_quantity before update of quantity on public.romiku_order_items for each row execute function public.romiku_check_order_quantity();
