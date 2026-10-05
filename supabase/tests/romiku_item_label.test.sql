begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select no_plan();
select has_column('public','romiku_orders','production_defaults_snapshot','Order has independent production defaults');
select has_column('public','romiku_production_items','marking_override','Item has independent override');
insert into auth.users(id,email,raw_user_meta_data) values ('de500000-0000-0000-0000-000000000001','instruction-test@example.test','{}');
create temporary table instruction_ids(kind text primary key,id uuid default gen_random_uuid());
insert into instruction_ids(kind) values ('customer'),('order'),('order2'),('item'),('production'),('production2'),('line'),('line2'),('quote');
grant all on instruction_ids to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','de500000-0000-0000-0000-000000000001',true);
insert into romiku_formal_customers(id,name,marking_profile) select id,'Instructions customer','{"version":1,"front_mark":{"mode":"image","image_asset":{"bucket":"romiku-marking-assets","path":"old/front.png"}},"small_label":{"mode":"text","text":"Made in China"},"production_requirements":"Protect cartons"}'::jsonb from instruction_ids where kind='customer';
insert into romiku_orders(id,formal_customer_id,notes) select id,(select id from instruction_ids where kind='customer'),'Saved Order note' from instruction_ids where kind='order';
select is((select production_defaults_snapshot#>>'{small_label,text}' from romiku_orders where id=(select id from instruction_ids where kind='order')),'Made in China','new Order copies customer defaults');
select ok((select production_defaults_snapshot->>'initialized_at' is not null from romiku_orders where id=(select id from instruction_ids where kind='order')),'initialization is explicit');
update romiku_formal_customers set marking_profile='{"small_label":{"mode":"text","text":"Changed customer"}}' where id=(select id from instruction_ids where kind='customer');
select is((select production_defaults_snapshot#>>'{small_label,text}' from romiku_orders where id=(select id from instruction_ids where kind='order')),'Made in China','customer edits do not mutate saved Order');
select is((select production_defaults_snapshot#>>'{front_mark,image_asset,path}' from romiku_orders where id=(select id from instruction_ids where kind='order')),'old/front.png','old asset reference stays stable');
insert into romiku_orders(id,notes) select id,'Legacy saved note' from instruction_ids where kind='order2';
select is(public.romiku_build_instruction_snapshot('{"small_label":{"mode":"none"}}','Saved legacy note','legacy_order',null)->>'production_requirements','Saved legacy note','legacy builder uses saved fields only');
insert into romiku_order_items(id,order_id,sku,quantity) select id,(select id from instruction_ids where kind='order'),'SUN5',160 from instruction_ids where kind='item';
insert into romiku_production_orders(id,order_id,marking_snapshot) select ids.id,o.id,o.production_defaults_snapshot from instruction_ids ids cross join romiku_orders o where ids.kind in ('production','production2') and o.id=(select id from instruction_ids where kind='order');
insert into romiku_production_items(id,production_order_id,order_id,source_order_item_id,sku,quantity) select id,(select id from instruction_ids where kind=case when ids.kind='line' then 'production' else 'production2' end),(select id from instruction_ids where kind='order'),(select id from instruction_ids where kind='item'),'SUN5',10 from instruction_ids ids where kind in ('line','line2');
select ok(romiku_valid_item_marking(v),'valid field-level data: '||v::text) from (values
 ('{"mode":"inherit","field_overrides":{"small_label":{"mode":"override","mark":{"mode":"text","text":"Label A"}}}}'::jsonb),
 ('{"mode":"inherit","field_overrides":{"front_mark":{"mode":"inherit"},"side_mark":{"mode":"none"},"small_label":{"mode":"none"},"labeling_requirements":{"mode":"append","text":"Each box"}}}'),
 ('{"mode":"replace","field_overrides":{"small_label":{"mode":"override","mark":{"mode":"image","image_asset":{"bucket":"romiku-marking-assets","path":"user/immutable.png"}}}}}'),
 ('{"mode":"append","additional_labels":[{"mode":"text","text":"Extra"}]}')
) t(v);
select ok(not romiku_valid_item_marking(v),'reject malformed field-level data: '||v::text) from (values
 ('{"mode":"inherit","field_overrides":[]}'::jsonb),
 ('{"mode":"inherit","field_overrides":{"unknown":{"mode":"none"}}}'),
 ('{"mode":"inherit","field_overrides":{"small_label":{"mode":"replace"}}}'),
 ('{"mode":"inherit","field_overrides":{"small_label":{"mode":"override"}}}'),
 ('{"mode":"inherit","field_overrides":{"small_label":{"mode":"override","mark":{"mode":"image"}}}}'),
 ('{"mode":"inherit","field_overrides":{"small_label":{"mode":"override","mark":{"mode":"text","text":123}}}}'),
 ('{"mode":"inherit","field_overrides":{"small_label":{"mode":"override","mark":{"mode":"image","image_asset":{"bucket":"other","path":"u/a.png"}}}}}'),
 ('{"mode":"inherit","field_overrides":{"small_label":{"mode":"override","mark":{"mode":"image","image_asset":{"bucket":"romiku-marking-assets","path":"u/../a.png"}}}}}'),
 ('{"mode":"inherit","field_overrides":{"labeling_requirements":{"mode":"override"}}}'),
 ('{"mode":"inherit","additional_labels":{}}')
) t(v);
select is(romiku_update_item_marking((select id from instruction_ids where kind='production'),array[(select id from instruction_ids where kind='line')],'set','{"mode":"inherit","field_overrides":{"small_label":{"mode":"override","mark":{"mode":"text","text":"Label A"}}}}'),1,'save per-field override with legacy inherit');
select is((select marking_override#>>'{field_overrides,small_label,mark,text}' from romiku_production_items where id=(select id from instruction_ids where kind='line')),'Label A','set preserves new field instead of compacting inherit');
select is(romiku_update_item_marking((select id from instruction_ids where kind='production'),array[(select id from instruction_ids where kind='line')],'add','{"labels":[{"mode":"text","text":"Extra"}]}'),1,'batch add works on field override');
select is((select marking_override#>>'{field_overrides,small_label,mark,text}' from romiku_production_items where id=(select id from instruction_ids where kind='line')),'Label A','batch add preserves field override');
select lives_ok($$select romiku_reload_production_defaults((select id from instruction_ids where kind='production'))$$,'reload shared remains compatible');
select is((select marking_override#>>'{field_overrides,small_label,mark,text}' from romiku_production_items where id=(select id from instruction_ids where kind='line')),'Label A','reload retains field override');
select throws_ok($$update romiku_production_items set marking_override='{"mode":"inherit","field_overrides":{"small_label":{"mode":"override"}}}' where id=(select id from instruction_ids where kind='line')$$,'23514',null,'table check rejects missing independent content');
select is(romiku_update_item_marking((select id from instruction_ids where kind='production'),array[(select id from instruction_ids where kind='line')],'reset','{}'),1,'explicit reset removes all exceptions');
select is((select marking_override from romiku_production_items where id=(select id from instruction_ids where kind='line')),'{"mode":"inherit"}'::jsonb,'reset returns compact inherit');
reset role;
select * from finish();rollback;
