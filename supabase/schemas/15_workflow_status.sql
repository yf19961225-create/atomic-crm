create or replace function public.romiku_normalize_workflow_status() returns trigger language plpgsql set search_path='' as $$ begin
 if tg_table_name='romiku_quotes' and new.status='draft' then new.status:='pending_quote';
 elsif tg_table_name='romiku_quotes' and new.status='sent' then new.status:='quoted';
 elsif tg_table_name='romiku_production_orders' and new.status='pending' then new.status:='pending_send';
 elsif tg_table_name='romiku_production_orders' and new.status='in_production' then new.status:='scheduled';
 elsif tg_table_name='romiku_website_inquiries' and new.status='new' then new.status:='pending_screening'; end if;
 return new; end $$;
create trigger aa_normalize_workflow_status before insert or update of status on public.romiku_quotes for each row execute function public.romiku_normalize_workflow_status();
create trigger aa_normalize_workflow_status before insert or update of status on public.romiku_production_orders for each row execute function public.romiku_normalize_workflow_status();
create trigger aa_normalize_workflow_status before insert or update of status on public.romiku_website_inquiries for each row execute function public.romiku_normalize_workflow_status();

revoke all on function public.romiku_normalize_workflow_status() from public,anon,authenticated;
