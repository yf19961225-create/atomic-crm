create sequence "public"."romiku_document_number_seq";


  create table "public"."romiku_customer_contacts" (
    "id" uuid not null default gen_random_uuid(),
    "formal_customer_id" uuid not null,
    "name" text not null,
    "title" text,
    "department" text,
    "role" text,
    "email" text,
    "phone" text,
    "whatsapp" text,
    "wechat" text,
    "social_urls" jsonb not null default '{}'::jsonb,
    "is_primary" boolean not null default false,
    "is_active" boolean not null default true,
    "notes" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_customer_contacts" enable row level security;


  create table "public"."romiku_formal_customers" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "country" text,
    "status" text not null default 'active'::text,
    "source_outbound_company_id" uuid,
    "logistics" jsonb not null default '{}'::jsonb,
    "requirements" jsonb not null default '{}'::jsonb,
    "notes" text,
    "archived_at" timestamp with time zone,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_formal_customers" enable row level security;


  create table "public"."romiku_manual_tasks" (
    "id" uuid not null default gen_random_uuid(),
    "title" text not null,
    "due_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "priority" text not null default 'normal'::text,
    "co_owner_id" uuid,
    "recurrence" jsonb,
    "notes" text,
    "outbound_company_id" uuid,
    "formal_customer_id" uuid,
    "quote_id" uuid,
    "pi_id" uuid,
    "order_id" uuid,
    "production_order_id" uuid,
    "supplier_id" uuid,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_manual_tasks" enable row level security;


  create table "public"."romiku_numbering_rules" (
    "id" uuid not null default gen_random_uuid(),
    "document_kind" text not null,
    "prefix" text not null,
    "min_digits" integer not null default 6,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_numbering_rules" enable row level security;


  create table "public"."romiku_order_items" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" uuid not null,
    "source_quote_item_id" uuid,
    "source_pi_item_id" uuid,
    "sanity_product_id" text,
    "sku" text not null,
    "product_snapshot" jsonb not null default '{}'::jsonb,
    "packing_snapshot" jsonb not null default '{}'::jsonb,
    "quantity" numeric(18,4) not null,
    "unit_price" numeric(18,4) not null default 0,
    "amount" numeric(18,2) generated always as (round((quantity * unit_price), 2)) stored,
    "requirement" text,
    "customer_code" text,
    "notes" text,
    "position" integer not null default 0,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_order_items" enable row level security;


  create table "public"."romiku_orders" (
    "id" uuid not null default gen_random_uuid(),
    "document_number" text not null,
    "status" text not null default 'draft'::text,
    "counterparty_snapshot" jsonb not null default '{}'::jsonb,
    "bank_snapshot" jsonb not null default '{}'::jsonb,
    "terms_snapshot" jsonb not null default '{}'::jsonb,
    "currency" text not null default 'USD'::text,
    "document_date" date not null default CURRENT_DATE,
    "follow_up_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "freight" numeric(18,2) not null default 0,
    "discount" numeric(18,2) not null default 0,
    "other_expenses" numeric(18,2) not null default 0,
    "deposit_percent" numeric(5,2) not null default 30,
    "deposit_due_at" timestamp with time zone,
    "balance_due_at" timestamp with time zone,
    "price_term" text,
    "shipment_method" text,
    "notes" text,
    "archived_at" timestamp with time zone,
    "source_website_inquiry_id" uuid,
    "outbound_company_id" uuid,
    "formal_customer_id" uuid,
    "source_quote_id" uuid,
    "source_pi_id" uuid,
    "expected_delivery_at" timestamp with time zone,
    "actual_delivery_at" timestamp with time zone,
    "co_owner_id" uuid,
    "purchase_order_number" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_orders" enable row level security;


  create table "public"."romiku_outbound_companies" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "brand_name" text,
    "country" text,
    "city" text,
    "address" text,
    "registration_number" text,
    "customer_type" text,
    "website" text,
    "social_urls" jsonb not null default '{}'::jsonb,
    "purchasing_categories" text[],
    "business_intelligence" jsonb not null default '{}'::jsonb,
    "grade" text,
    "status" text not null default 'to_develop'::text,
    "next_follow_up_at" timestamp with time zone,
    "notes" text,
    "archived_at" timestamp with time zone,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_outbound_companies" enable row level security;


  create table "public"."romiku_outbound_contacts" (
    "id" uuid not null default gen_random_uuid(),
    "outbound_company_id" uuid not null,
    "name" text not null,
    "title" text,
    "department" text,
    "role" text,
    "email" text,
    "phone" text,
    "whatsapp" text,
    "wechat" text,
    "social_urls" jsonb not null default '{}'::jsonb,
    "is_primary" boolean not null default false,
    "is_active" boolean not null default true,
    "notes" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_outbound_contacts" enable row level security;


  create table "public"."romiku_outbound_followups" (
    "id" uuid not null default gen_random_uuid(),
    "outbound_company_id" uuid not null,
    "contact_id" uuid,
    "method" text not null,
    "summary" text not null,
    "contacted_at" timestamp with time zone not null default now(),
    "next_follow_up_at" timestamp with time zone,
    "notes" text,
    "attachments" jsonb not null default '[]'::jsonb,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_outbound_followups" enable row level security;


  create table "public"."romiku_packing_items" (
    "id" uuid not null default gen_random_uuid(),
    "packing_list_id" uuid not null,
    "order_id" uuid not null,
    "source_order_item_id" uuid not null,
    "sanity_product_id" text,
    "sku" text not null,
    "product_snapshot" jsonb not null default '{}'::jsonb,
    "quantity" numeric(18,4) not null,
    "cartons" integer not null default 0,
    "qty_per_carton" numeric(18,4),
    "length_cm" numeric(12,4) not null default 0,
    "width_cm" numeric(12,4) not null default 0,
    "height_cm" numeric(12,4) not null default 0,
    "carton_weight_kg" numeric(12,4) not null default 0,
    "total_cbm" numeric generated always as (((((length_cm * width_cm) * height_cm) * (cartons)::numeric) / (1000000)::numeric)) stored,
    "total_weight_kg" numeric generated always as ((carton_weight_kg * (cartons)::numeric)) stored,
    "remark" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_packing_items" enable row level security;


  create table "public"."romiku_packing_lists" (
    "id" uuid not null default gen_random_uuid(),
    "document_number" text not null,
    "name" text,
    "order_id" uuid not null,
    "packing_at" timestamp with time zone,
    "shipping_mark" text,
    "batch_label" text,
    "notes" text,
    "archived_at" timestamp with time zone,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_packing_lists" enable row level security;


  create table "public"."romiku_payments" (
    "id" uuid not null default gen_random_uuid(),
    "order_id" uuid not null,
    "kind" text not null,
    "amount" numeric(18,2) not null,
    "received_at" timestamp with time zone not null default now(),
    "proof" jsonb not null default '[]'::jsonb,
    "notes" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_payments" enable row level security;


  create table "public"."romiku_pi_items" (
    "id" uuid not null default gen_random_uuid(),
    "pi_id" uuid not null,
    "source_quote_item_id" uuid,
    "sanity_product_id" text,
    "sku" text not null,
    "product_snapshot" jsonb not null default '{}'::jsonb,
    "packing_snapshot" jsonb not null default '{}'::jsonb,
    "quantity" numeric(18,4) not null,
    "unit_price" numeric(18,4) not null default 0,
    "amount" numeric(18,2) generated always as (round((quantity * unit_price), 2)) stored,
    "requirement" text,
    "customer_code" text,
    "notes" text,
    "position" integer not null default 0,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_pi_items" enable row level security;


  create table "public"."romiku_pis" (
    "id" uuid not null default gen_random_uuid(),
    "document_number" text not null,
    "status" text not null default 'draft'::text,
    "counterparty_snapshot" jsonb not null default '{}'::jsonb,
    "bank_snapshot" jsonb not null default '{}'::jsonb,
    "terms_snapshot" jsonb not null default '{}'::jsonb,
    "currency" text not null default 'USD'::text,
    "document_date" date not null default CURRENT_DATE,
    "follow_up_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "freight" numeric(18,2) not null default 0,
    "discount" numeric(18,2) not null default 0,
    "other_expenses" numeric(18,2) not null default 0,
    "deposit_percent" numeric(5,2) not null default 30,
    "deposit_due_at" timestamp with time zone,
    "balance_due_at" timestamp with time zone,
    "price_term" text,
    "shipment_method" text,
    "notes" text,
    "archived_at" timestamp with time zone,
    "source_website_inquiry_id" uuid,
    "outbound_company_id" uuid,
    "formal_customer_id" uuid,
    "source_quote_id" uuid,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_pis" enable row level security;


  create table "public"."romiku_procurement_cost_history" (
    "id" uuid not null default gen_random_uuid(),
    "product_supplier_id" uuid not null,
    "cost" numeric(18,4) not null,
    "currency" text not null,
    "effective_date" date not null,
    "source_type" text not null,
    "source_note" text,
    "source_file" jsonb,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_procurement_cost_history" enable row level security;


  create table "public"."romiku_product_extensions" (
    "id" uuid not null default gen_random_uuid(),
    "sanity_product_id" text,
    "sku" text not null,
    "internal_notes" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_product_extensions" enable row level security;


  create table "public"."romiku_product_suppliers" (
    "id" uuid not null default gen_random_uuid(),
    "sanity_product_id" text,
    "sku" text not null,
    "supplier_id" uuid not null,
    "supplier_item_number" text,
    "moq" numeric(18,4),
    "lead_days" integer,
    "qty_per_carton" numeric(18,4),
    "length_cm" numeric(12,4),
    "width_cm" numeric(12,4),
    "height_cm" numeric(12,4),
    "carton_weight_kg" numeric(12,4),
    "preferred" boolean not null default false,
    "active" boolean not null default true,
    "reference_date" date,
    "notes" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_product_suppliers" enable row level security;


  create table "public"."romiku_production_followups" (
    "id" uuid not null default gen_random_uuid(),
    "production_order_id" uuid not null,
    "method" text not null,
    "summary" text not null,
    "contacted_at" timestamp with time zone not null default now(),
    "next_follow_up_at" timestamp with time zone,
    "notes" text,
    "attachments" jsonb not null default '[]'::jsonb,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_production_followups" enable row level security;


  create table "public"."romiku_production_items" (
    "id" uuid not null default gen_random_uuid(),
    "production_order_id" uuid not null,
    "order_id" uuid not null,
    "source_order_item_id" uuid not null,
    "sanity_product_id" text,
    "sku" text not null,
    "quantity" numeric(18,4) not null,
    "product_snapshot" jsonb not null default '{}'::jsonb,
    "packaging_snapshot" jsonb not null default '{}'::jsonb,
    "production_note_zh" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_production_items" enable row level security;


  create table "public"."romiku_production_orders" (
    "id" uuid not null default gen_random_uuid(),
    "document_number" text not null,
    "name" text,
    "order_id" uuid not null,
    "supplier_id" uuid not null,
    "supplier_snapshot" jsonb not null default '{}'::jsonb,
    "status" text not null default 'pending'::text,
    "factory_due_at" timestamp with time zone,
    "co_owner_id" uuid,
    "anomaly_flags" text[] not null default '{}'::text[],
    "anomaly_notes" text,
    "notes" text,
    "archived_at" timestamp with time zone,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_production_orders" enable row level security;


  create table "public"."romiku_quote_items" (
    "id" uuid not null default gen_random_uuid(),
    "quote_id" uuid not null,
    "source_website_inquiry_item_id" uuid,
    "sanity_product_id" text,
    "sku" text not null,
    "product_snapshot" jsonb not null default '{}'::jsonb,
    "packing_snapshot" jsonb not null default '{}'::jsonb,
    "quantity" numeric(18,4) not null,
    "unit_price" numeric(18,4) not null default 0,
    "amount" numeric(18,2) generated always as (round((quantity * unit_price), 2)) stored,
    "requirement" text,
    "customer_code" text,
    "notes" text,
    "position" integer not null default 0,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_quote_items" enable row level security;


  create table "public"."romiku_quote_versions" (
    "id" uuid not null default gen_random_uuid(),
    "quote_id" uuid not null,
    "version" integer not null,
    "document_snapshot" jsonb not null,
    "items_snapshot" jsonb not null,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_quote_versions" enable row level security;


  create table "public"."romiku_quotes" (
    "id" uuid not null default gen_random_uuid(),
    "document_number" text not null,
    "status" text not null default 'draft'::text,
    "counterparty_snapshot" jsonb not null default '{}'::jsonb,
    "bank_snapshot" jsonb not null default '{}'::jsonb,
    "terms_snapshot" jsonb not null default '{}'::jsonb,
    "currency" text not null default 'USD'::text,
    "document_date" date not null default CURRENT_DATE,
    "follow_up_at" timestamp with time zone,
    "due_at" timestamp with time zone,
    "freight" numeric(18,2) not null default 0,
    "discount" numeric(18,2) not null default 0,
    "other_expenses" numeric(18,2) not null default 0,
    "deposit_percent" numeric(5,2) not null default 30,
    "deposit_due_at" timestamp with time zone,
    "balance_due_at" timestamp with time zone,
    "price_term" text,
    "shipment_method" text,
    "notes" text,
    "archived_at" timestamp with time zone,
    "source_website_inquiry_id" uuid,
    "outbound_company_id" uuid,
    "formal_customer_id" uuid,
    "valid_until" date,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_quotes" enable row level security;


  create table "public"."romiku_source_urls" (
    "id" uuid not null default gen_random_uuid(),
    "outbound_company_id" uuid not null,
    "source_type" text not null,
    "url" text not null,
    "label" text,
    "notes" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_source_urls" enable row level security;


  create table "public"."romiku_supplier_contacts" (
    "id" uuid not null default gen_random_uuid(),
    "supplier_id" uuid not null,
    "name" text not null,
    "title" text,
    "department" text,
    "role" text,
    "email" text,
    "phone" text,
    "whatsapp" text,
    "wechat" text,
    "social_urls" jsonb not null default '{}'::jsonb,
    "is_primary" boolean not null default false,
    "is_active" boolean not null default true,
    "notes" text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_supplier_contacts" enable row level security;


  create table "public"."romiku_suppliers" (
    "id" uuid not null default gen_random_uuid(),
    "name" text not null,
    "categories" text[],
    "region" text,
    "address" text,
    "shipping_address" text,
    "default_lead_days" integer,
    "grade" text,
    "status" text not null default 'active'::text,
    "notes" text,
    "archived_at" timestamp with time zone,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_suppliers" enable row level security;


  create table "public"."romiku_website_inquiries" (
    "id" uuid not null default gen_random_uuid(),
    "document_number" text not null,
    "submitted_at" timestamp with time zone not null default now(),
    "customer_name" text not null,
    "company" text,
    "email" text,
    "whatsapp" text,
    "country" text,
    "message" text,
    "status" text not null default 'new'::text,
    "raw_payload" jsonb not null default '{}'::jsonb,
    "processing_notes" text,
    "next_follow_up_at" timestamp with time zone,
    "outbound_company_id" uuid,
    "formal_customer_id" uuid,
    "archived_at" timestamp with time zone,
    "owner_id" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_website_inquiries" enable row level security;


  create table "public"."romiku_website_inquiry_followups" (
    "id" uuid not null default gen_random_uuid(),
    "inquiry_id" uuid not null,
    "method" text not null,
    "summary" text not null,
    "contacted_at" timestamp with time zone not null default now(),
    "next_follow_up_at" timestamp with time zone,
    "notes" text,
    "attachments" jsonb not null default '[]'::jsonb,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_website_inquiry_followups" enable row level security;


  create table "public"."romiku_website_inquiry_items" (
    "id" uuid not null default gen_random_uuid(),
    "inquiry_id" uuid not null,
    "sku" text not null,
    "quantity" numeric(18,4) not null,
    "requirement" text,
    "sanity_product_id" text,
    "product_snapshot" jsonb not null default '{}'::jsonb,
    "match_status" text not null default 'unresolved'::text,
    "owner_id" uuid default auth.uid(),
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "created_by" uuid default auth.uid(),
    "updated_by" uuid default auth.uid()
      );


alter table "public"."romiku_website_inquiry_items" enable row level security;

CREATE UNIQUE INDEX romiku_customer_contacts_pkey ON public.romiku_customer_contacts USING btree (id);

CREATE UNIQUE INDEX romiku_formal_customers_pkey ON public.romiku_formal_customers USING btree (id);

CREATE UNIQUE INDEX romiku_manual_tasks_pkey ON public.romiku_manual_tasks USING btree (id);

CREATE UNIQUE INDEX romiku_numbering_rules_document_kind_key ON public.romiku_numbering_rules USING btree (document_kind);

CREATE UNIQUE INDEX romiku_numbering_rules_pkey ON public.romiku_numbering_rules USING btree (id);

CREATE UNIQUE INDEX romiku_order_items_id_order_id_key ON public.romiku_order_items USING btree (id, order_id);

CREATE INDEX romiku_order_items_order_id_idx ON public.romiku_order_items USING btree (order_id);

CREATE UNIQUE INDEX romiku_order_items_pkey ON public.romiku_order_items USING btree (id);

CREATE UNIQUE INDEX romiku_orders_document_number_key ON public.romiku_orders USING btree (document_number);

CREATE UNIQUE INDEX romiku_orders_pkey ON public.romiku_orders USING btree (id);

CREATE UNIQUE INDEX romiku_outbound_companies_pkey ON public.romiku_outbound_companies USING btree (id);

CREATE UNIQUE INDEX romiku_outbound_contacts_id_outbound_company_id_key ON public.romiku_outbound_contacts USING btree (id, outbound_company_id);

CREATE INDEX romiku_outbound_contacts_outbound_company_id_idx ON public.romiku_outbound_contacts USING btree (outbound_company_id);

CREATE UNIQUE INDEX romiku_outbound_contacts_pkey ON public.romiku_outbound_contacts USING btree (id);

CREATE INDEX romiku_outbound_followups_outbound_company_id_idx ON public.romiku_outbound_followups USING btree (outbound_company_id);

CREATE UNIQUE INDEX romiku_outbound_followups_pkey ON public.romiku_outbound_followups USING btree (id);

CREATE UNIQUE INDEX romiku_packing_items_pkey ON public.romiku_packing_items USING btree (id);

CREATE INDEX romiku_packing_items_source_order_item_id_idx ON public.romiku_packing_items USING btree (source_order_item_id);

CREATE UNIQUE INDEX romiku_packing_lists_document_number_key ON public.romiku_packing_lists USING btree (document_number);

CREATE UNIQUE INDEX romiku_packing_lists_id_order_id_key ON public.romiku_packing_lists USING btree (id, order_id);

CREATE INDEX romiku_packing_lists_order_id_idx ON public.romiku_packing_lists USING btree (order_id);

CREATE UNIQUE INDEX romiku_packing_lists_pkey ON public.romiku_packing_lists USING btree (id);

CREATE INDEX romiku_payments_order_id_idx ON public.romiku_payments USING btree (order_id);

CREATE UNIQUE INDEX romiku_payments_pkey ON public.romiku_payments USING btree (id);

CREATE INDEX romiku_pi_items_pi_id_idx ON public.romiku_pi_items USING btree (pi_id);

CREATE UNIQUE INDEX romiku_pi_items_pkey ON public.romiku_pi_items USING btree (id);

CREATE UNIQUE INDEX romiku_pis_document_number_key ON public.romiku_pis USING btree (document_number);

CREATE UNIQUE INDEX romiku_pis_pkey ON public.romiku_pis USING btree (id);

CREATE UNIQUE INDEX romiku_procurement_cost_history_pkey ON public.romiku_procurement_cost_history USING btree (id);

CREATE INDEX romiku_procurement_cost_history_product_supplier_id_idx ON public.romiku_procurement_cost_history USING btree (product_supplier_id);

CREATE UNIQUE INDEX romiku_product_extensions_pkey ON public.romiku_product_extensions USING btree (id);

CREATE UNIQUE INDEX romiku_product_extensions_sanity_product_id_key ON public.romiku_product_extensions USING btree (sanity_product_id);

CREATE UNIQUE INDEX romiku_product_extensions_sku_key ON public.romiku_product_extensions USING btree (sku);

CREATE UNIQUE INDEX romiku_product_suppliers_pkey ON public.romiku_product_suppliers USING btree (id);

CREATE UNIQUE INDEX romiku_product_suppliers_sku_supplier_id_key ON public.romiku_product_suppliers USING btree (sku, supplier_id);

CREATE UNIQUE INDEX romiku_production_followups_pkey ON public.romiku_production_followups USING btree (id);

CREATE UNIQUE INDEX romiku_production_items_pkey ON public.romiku_production_items USING btree (id);

CREATE INDEX romiku_production_items_source_order_item_id_idx ON public.romiku_production_items USING btree (source_order_item_id);

CREATE UNIQUE INDEX romiku_production_orders_document_number_key ON public.romiku_production_orders USING btree (document_number);

CREATE UNIQUE INDEX romiku_production_orders_id_order_id_key ON public.romiku_production_orders USING btree (id, order_id);

CREATE INDEX romiku_production_orders_order_id_idx ON public.romiku_production_orders USING btree (order_id);

CREATE UNIQUE INDEX romiku_production_orders_pkey ON public.romiku_production_orders USING btree (id);

CREATE UNIQUE INDEX romiku_quote_items_pkey ON public.romiku_quote_items USING btree (id);

CREATE INDEX romiku_quote_items_quote_id_idx ON public.romiku_quote_items USING btree (quote_id);

CREATE UNIQUE INDEX romiku_quote_versions_pkey ON public.romiku_quote_versions USING btree (id);

CREATE UNIQUE INDEX romiku_quote_versions_quote_id_version_key ON public.romiku_quote_versions USING btree (quote_id, version);

CREATE UNIQUE INDEX romiku_quotes_document_number_key ON public.romiku_quotes USING btree (document_number);

CREATE UNIQUE INDEX romiku_quotes_pkey ON public.romiku_quotes USING btree (id);

CREATE UNIQUE INDEX romiku_source_urls_pkey ON public.romiku_source_urls USING btree (id);

CREATE UNIQUE INDEX romiku_supplier_contacts_pkey ON public.romiku_supplier_contacts USING btree (id);

CREATE UNIQUE INDEX romiku_suppliers_pkey ON public.romiku_suppliers USING btree (id);

CREATE UNIQUE INDEX romiku_website_inquiries_document_number_key ON public.romiku_website_inquiries USING btree (document_number);

CREATE UNIQUE INDEX romiku_website_inquiries_pkey ON public.romiku_website_inquiries USING btree (id);

CREATE INDEX romiku_website_inquiry_followups_inquiry_id_idx ON public.romiku_website_inquiry_followups USING btree (inquiry_id);

CREATE UNIQUE INDEX romiku_website_inquiry_followups_pkey ON public.romiku_website_inquiry_followups USING btree (id);

CREATE INDEX romiku_website_inquiry_items_inquiry_id_idx ON public.romiku_website_inquiry_items USING btree (inquiry_id);

CREATE UNIQUE INDEX romiku_website_inquiry_items_pkey ON public.romiku_website_inquiry_items USING btree (id);

alter table "public"."romiku_customer_contacts" add constraint "romiku_customer_contacts_pkey" PRIMARY KEY using index "romiku_customer_contacts_pkey";

alter table "public"."romiku_formal_customers" add constraint "romiku_formal_customers_pkey" PRIMARY KEY using index "romiku_formal_customers_pkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_pkey" PRIMARY KEY using index "romiku_manual_tasks_pkey";

alter table "public"."romiku_numbering_rules" add constraint "romiku_numbering_rules_pkey" PRIMARY KEY using index "romiku_numbering_rules_pkey";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_pkey" PRIMARY KEY using index "romiku_order_items_pkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_pkey" PRIMARY KEY using index "romiku_orders_pkey";

alter table "public"."romiku_outbound_companies" add constraint "romiku_outbound_companies_pkey" PRIMARY KEY using index "romiku_outbound_companies_pkey";

alter table "public"."romiku_outbound_contacts" add constraint "romiku_outbound_contacts_pkey" PRIMARY KEY using index "romiku_outbound_contacts_pkey";

alter table "public"."romiku_outbound_followups" add constraint "romiku_outbound_followups_pkey" PRIMARY KEY using index "romiku_outbound_followups_pkey";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_pkey" PRIMARY KEY using index "romiku_packing_items_pkey";

alter table "public"."romiku_packing_lists" add constraint "romiku_packing_lists_pkey" PRIMARY KEY using index "romiku_packing_lists_pkey";

alter table "public"."romiku_payments" add constraint "romiku_payments_pkey" PRIMARY KEY using index "romiku_payments_pkey";

alter table "public"."romiku_pi_items" add constraint "romiku_pi_items_pkey" PRIMARY KEY using index "romiku_pi_items_pkey";

alter table "public"."romiku_pis" add constraint "romiku_pis_pkey" PRIMARY KEY using index "romiku_pis_pkey";

alter table "public"."romiku_procurement_cost_history" add constraint "romiku_procurement_cost_history_pkey" PRIMARY KEY using index "romiku_procurement_cost_history_pkey";

alter table "public"."romiku_product_extensions" add constraint "romiku_product_extensions_pkey" PRIMARY KEY using index "romiku_product_extensions_pkey";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_pkey" PRIMARY KEY using index "romiku_product_suppliers_pkey";

alter table "public"."romiku_production_followups" add constraint "romiku_production_followups_pkey" PRIMARY KEY using index "romiku_production_followups_pkey";

alter table "public"."romiku_production_items" add constraint "romiku_production_items_pkey" PRIMARY KEY using index "romiku_production_items_pkey";

alter table "public"."romiku_production_orders" add constraint "romiku_production_orders_pkey" PRIMARY KEY using index "romiku_production_orders_pkey";

alter table "public"."romiku_quote_items" add constraint "romiku_quote_items_pkey" PRIMARY KEY using index "romiku_quote_items_pkey";

alter table "public"."romiku_quote_versions" add constraint "romiku_quote_versions_pkey" PRIMARY KEY using index "romiku_quote_versions_pkey";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_pkey" PRIMARY KEY using index "romiku_quotes_pkey";

alter table "public"."romiku_source_urls" add constraint "romiku_source_urls_pkey" PRIMARY KEY using index "romiku_source_urls_pkey";

alter table "public"."romiku_supplier_contacts" add constraint "romiku_supplier_contacts_pkey" PRIMARY KEY using index "romiku_supplier_contacts_pkey";

alter table "public"."romiku_suppliers" add constraint "romiku_suppliers_pkey" PRIMARY KEY using index "romiku_suppliers_pkey";

alter table "public"."romiku_website_inquiries" add constraint "romiku_website_inquiries_pkey" PRIMARY KEY using index "romiku_website_inquiries_pkey";

alter table "public"."romiku_website_inquiry_followups" add constraint "romiku_website_inquiry_followups_pkey" PRIMARY KEY using index "romiku_website_inquiry_followups_pkey";

alter table "public"."romiku_website_inquiry_items" add constraint "romiku_website_inquiry_items_pkey" PRIMARY KEY using index "romiku_website_inquiry_items_pkey";

alter table "public"."romiku_customer_contacts" add constraint "romiku_customer_contacts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_customer_contacts" validate constraint "romiku_customer_contacts_created_by_fkey";

alter table "public"."romiku_customer_contacts" add constraint "romiku_customer_contacts_formal_customer_id_fkey" FOREIGN KEY (formal_customer_id) REFERENCES public.romiku_formal_customers(id) not valid;

alter table "public"."romiku_customer_contacts" validate constraint "romiku_customer_contacts_formal_customer_id_fkey";

alter table "public"."romiku_customer_contacts" add constraint "romiku_customer_contacts_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_customer_contacts" validate constraint "romiku_customer_contacts_owner_id_fkey";

alter table "public"."romiku_customer_contacts" add constraint "romiku_customer_contacts_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_customer_contacts" validate constraint "romiku_customer_contacts_updated_by_fkey";

alter table "public"."romiku_formal_customers" add constraint "romiku_formal_customers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_formal_customers" validate constraint "romiku_formal_customers_created_by_fkey";

alter table "public"."romiku_formal_customers" add constraint "romiku_formal_customers_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_formal_customers" validate constraint "romiku_formal_customers_owner_id_fkey";

alter table "public"."romiku_formal_customers" add constraint "romiku_formal_customers_source_outbound_company_id_fkey" FOREIGN KEY (source_outbound_company_id) REFERENCES public.romiku_outbound_companies(id) not valid;

alter table "public"."romiku_formal_customers" validate constraint "romiku_formal_customers_source_outbound_company_id_fkey";

alter table "public"."romiku_formal_customers" add constraint "romiku_formal_customers_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_formal_customers" validate constraint "romiku_formal_customers_updated_by_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_check" CHECK ((num_nonnulls(outbound_company_id, formal_customer_id, quote_id, pi_id, order_id, production_order_id, supplier_id) <= 1)) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_check";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_co_owner_id_fkey" FOREIGN KEY (co_owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_co_owner_id_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_created_by_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_formal_customer_id_fkey" FOREIGN KEY (formal_customer_id) REFERENCES public.romiku_formal_customers(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_formal_customer_id_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.romiku_orders(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_order_id_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_outbound_company_id_fkey" FOREIGN KEY (outbound_company_id) REFERENCES public.romiku_outbound_companies(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_outbound_company_id_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_owner_id_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_pi_id_fkey" FOREIGN KEY (pi_id) REFERENCES public.romiku_pis(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_pi_id_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_priority_check";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_production_order_id_fkey" FOREIGN KEY (production_order_id) REFERENCES public.romiku_production_orders(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_production_order_id_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES public.romiku_quotes(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_quote_id_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.romiku_suppliers(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_supplier_id_fkey";

alter table "public"."romiku_manual_tasks" add constraint "romiku_manual_tasks_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_manual_tasks" validate constraint "romiku_manual_tasks_updated_by_fkey";

alter table "public"."romiku_numbering_rules" add constraint "romiku_numbering_rules_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_numbering_rules" validate constraint "romiku_numbering_rules_created_by_fkey";

alter table "public"."romiku_numbering_rules" add constraint "romiku_numbering_rules_document_kind_check" CHECK ((document_kind = ANY (ARRAY['inquiry'::text, 'quote'::text, 'pi'::text, 'order'::text, 'production'::text, 'packing'::text]))) not valid;

alter table "public"."romiku_numbering_rules" validate constraint "romiku_numbering_rules_document_kind_check";

alter table "public"."romiku_numbering_rules" add constraint "romiku_numbering_rules_document_kind_key" UNIQUE using index "romiku_numbering_rules_document_kind_key";

alter table "public"."romiku_numbering_rules" add constraint "romiku_numbering_rules_min_digits_check" CHECK (((min_digits >= 1) AND (min_digits <= 12))) not valid;

alter table "public"."romiku_numbering_rules" validate constraint "romiku_numbering_rules_min_digits_check";

alter table "public"."romiku_numbering_rules" add constraint "romiku_numbering_rules_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_numbering_rules" validate constraint "romiku_numbering_rules_owner_id_fkey";

alter table "public"."romiku_numbering_rules" add constraint "romiku_numbering_rules_prefix_check" CHECK ((prefix ~ '^[A-Za-z0-9-]{1,16}$'::text)) not valid;

alter table "public"."romiku_numbering_rules" validate constraint "romiku_numbering_rules_prefix_check";

alter table "public"."romiku_numbering_rules" add constraint "romiku_numbering_rules_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_numbering_rules" validate constraint "romiku_numbering_rules_updated_by_fkey";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_order_items" validate constraint "romiku_order_items_created_by_fkey";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_id_order_id_key" UNIQUE using index "romiku_order_items_id_order_id_key";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.romiku_orders(id) not valid;

alter table "public"."romiku_order_items" validate constraint "romiku_order_items_order_id_fkey";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_order_items" validate constraint "romiku_order_items_owner_id_fkey";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_quantity_check" CHECK ((quantity > (0)::numeric)) not valid;

alter table "public"."romiku_order_items" validate constraint "romiku_order_items_quantity_check";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_source_pi_item_id_fkey" FOREIGN KEY (source_pi_item_id) REFERENCES public.romiku_pi_items(id) not valid;

alter table "public"."romiku_order_items" validate constraint "romiku_order_items_source_pi_item_id_fkey";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_source_quote_item_id_fkey" FOREIGN KEY (source_quote_item_id) REFERENCES public.romiku_quote_items(id) not valid;

alter table "public"."romiku_order_items" validate constraint "romiku_order_items_source_quote_item_id_fkey";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_unit_price_check" CHECK ((unit_price >= (0)::numeric)) not valid;

alter table "public"."romiku_order_items" validate constraint "romiku_order_items_unit_price_check";

alter table "public"."romiku_order_items" add constraint "romiku_order_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_order_items" validate constraint "romiku_order_items_updated_by_fkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_co_owner_id_fkey" FOREIGN KEY (co_owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_co_owner_id_fkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_created_by_fkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_currency_check";

alter table "public"."romiku_orders" add constraint "romiku_orders_deposit_percent_check" CHECK (((deposit_percent >= (0)::numeric) AND (deposit_percent <= (100)::numeric))) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_deposit_percent_check";

alter table "public"."romiku_orders" add constraint "romiku_orders_discount_check" CHECK ((discount >= (0)::numeric)) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_discount_check";

alter table "public"."romiku_orders" add constraint "romiku_orders_document_number_key" UNIQUE using index "romiku_orders_document_number_key";

alter table "public"."romiku_orders" add constraint "romiku_orders_formal_customer_id_fkey" FOREIGN KEY (formal_customer_id) REFERENCES public.romiku_formal_customers(id) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_formal_customer_id_fkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_freight_check" CHECK ((freight >= (0)::numeric)) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_freight_check";

alter table "public"."romiku_orders" add constraint "romiku_orders_other_expenses_check" CHECK ((other_expenses >= (0)::numeric)) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_other_expenses_check";

alter table "public"."romiku_orders" add constraint "romiku_orders_outbound_company_id_fkey" FOREIGN KEY (outbound_company_id) REFERENCES public.romiku_outbound_companies(id) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_outbound_company_id_fkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_owner_id_fkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_source_pi_id_fkey" FOREIGN KEY (source_pi_id) REFERENCES public.romiku_pis(id) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_source_pi_id_fkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_source_quote_id_fkey" FOREIGN KEY (source_quote_id) REFERENCES public.romiku_quotes(id) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_source_quote_id_fkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_source_website_inquiry_id_fkey" FOREIGN KEY (source_website_inquiry_id) REFERENCES public.romiku_website_inquiries(id) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_source_website_inquiry_id_fkey";

alter table "public"."romiku_orders" add constraint "romiku_orders_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_orders" validate constraint "romiku_orders_updated_by_fkey";

alter table "public"."romiku_outbound_companies" add constraint "romiku_outbound_companies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_outbound_companies" validate constraint "romiku_outbound_companies_created_by_fkey";

alter table "public"."romiku_outbound_companies" add constraint "romiku_outbound_companies_grade_check" CHECK ((grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'D'::text]))) not valid;

alter table "public"."romiku_outbound_companies" validate constraint "romiku_outbound_companies_grade_check";

alter table "public"."romiku_outbound_companies" add constraint "romiku_outbound_companies_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_outbound_companies" validate constraint "romiku_outbound_companies_owner_id_fkey";

alter table "public"."romiku_outbound_companies" add constraint "romiku_outbound_companies_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_outbound_companies" validate constraint "romiku_outbound_companies_updated_by_fkey";

alter table "public"."romiku_outbound_contacts" add constraint "romiku_outbound_contacts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_outbound_contacts" validate constraint "romiku_outbound_contacts_created_by_fkey";

alter table "public"."romiku_outbound_contacts" add constraint "romiku_outbound_contacts_id_outbound_company_id_key" UNIQUE using index "romiku_outbound_contacts_id_outbound_company_id_key";

alter table "public"."romiku_outbound_contacts" add constraint "romiku_outbound_contacts_outbound_company_id_fkey" FOREIGN KEY (outbound_company_id) REFERENCES public.romiku_outbound_companies(id) not valid;

alter table "public"."romiku_outbound_contacts" validate constraint "romiku_outbound_contacts_outbound_company_id_fkey";

alter table "public"."romiku_outbound_contacts" add constraint "romiku_outbound_contacts_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_outbound_contacts" validate constraint "romiku_outbound_contacts_owner_id_fkey";

alter table "public"."romiku_outbound_contacts" add constraint "romiku_outbound_contacts_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_outbound_contacts" validate constraint "romiku_outbound_contacts_updated_by_fkey";

alter table "public"."romiku_outbound_followups" add constraint "romiku_outbound_followups_contact_id_outbound_company_id_fkey" FOREIGN KEY (contact_id, outbound_company_id) REFERENCES public.romiku_outbound_contacts(id, outbound_company_id) not valid;

alter table "public"."romiku_outbound_followups" validate constraint "romiku_outbound_followups_contact_id_outbound_company_id_fkey";

alter table "public"."romiku_outbound_followups" add constraint "romiku_outbound_followups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_outbound_followups" validate constraint "romiku_outbound_followups_created_by_fkey";

alter table "public"."romiku_outbound_followups" add constraint "romiku_outbound_followups_outbound_company_id_fkey" FOREIGN KEY (outbound_company_id) REFERENCES public.romiku_outbound_companies(id) not valid;

alter table "public"."romiku_outbound_followups" validate constraint "romiku_outbound_followups_outbound_company_id_fkey";

alter table "public"."romiku_outbound_followups" add constraint "romiku_outbound_followups_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_outbound_followups" validate constraint "romiku_outbound_followups_owner_id_fkey";

alter table "public"."romiku_outbound_followups" add constraint "romiku_outbound_followups_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_outbound_followups" validate constraint "romiku_outbound_followups_updated_by_fkey";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_carton_weight_kg_check" CHECK ((carton_weight_kg >= (0)::numeric)) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_carton_weight_kg_check";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_cartons_check" CHECK ((cartons >= 0)) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_cartons_check";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_created_by_fkey";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_height_cm_check" CHECK ((height_cm >= (0)::numeric)) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_height_cm_check";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_length_cm_check" CHECK ((length_cm >= (0)::numeric)) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_length_cm_check";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_owner_id_fkey";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_packing_list_id_order_id_fkey" FOREIGN KEY (packing_list_id, order_id) REFERENCES public.romiku_packing_lists(id, order_id) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_packing_list_id_order_id_fkey";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_qty_per_carton_check" CHECK ((qty_per_carton > (0)::numeric)) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_qty_per_carton_check";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_quantity_check" CHECK ((quantity > (0)::numeric)) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_quantity_check";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_source_order_item_id_order_id_fkey" FOREIGN KEY (source_order_item_id, order_id) REFERENCES public.romiku_order_items(id, order_id) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_source_order_item_id_order_id_fkey";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_updated_by_fkey";

alter table "public"."romiku_packing_items" add constraint "romiku_packing_items_width_cm_check" CHECK ((width_cm >= (0)::numeric)) not valid;

alter table "public"."romiku_packing_items" validate constraint "romiku_packing_items_width_cm_check";

alter table "public"."romiku_packing_lists" add constraint "romiku_packing_lists_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_packing_lists" validate constraint "romiku_packing_lists_created_by_fkey";

alter table "public"."romiku_packing_lists" add constraint "romiku_packing_lists_document_number_key" UNIQUE using index "romiku_packing_lists_document_number_key";

alter table "public"."romiku_packing_lists" add constraint "romiku_packing_lists_id_order_id_key" UNIQUE using index "romiku_packing_lists_id_order_id_key";

alter table "public"."romiku_packing_lists" add constraint "romiku_packing_lists_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.romiku_orders(id) not valid;

alter table "public"."romiku_packing_lists" validate constraint "romiku_packing_lists_order_id_fkey";

alter table "public"."romiku_packing_lists" add constraint "romiku_packing_lists_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_packing_lists" validate constraint "romiku_packing_lists_owner_id_fkey";

alter table "public"."romiku_packing_lists" add constraint "romiku_packing_lists_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_packing_lists" validate constraint "romiku_packing_lists_updated_by_fkey";

alter table "public"."romiku_payments" add constraint "romiku_payments_amount_check" CHECK ((amount > (0)::numeric)) not valid;

alter table "public"."romiku_payments" validate constraint "romiku_payments_amount_check";

alter table "public"."romiku_payments" add constraint "romiku_payments_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_payments" validate constraint "romiku_payments_created_by_fkey";

alter table "public"."romiku_payments" add constraint "romiku_payments_kind_check" CHECK ((kind = ANY (ARRAY['deposit'::text, 'balance'::text, 'other'::text]))) not valid;

alter table "public"."romiku_payments" validate constraint "romiku_payments_kind_check";

alter table "public"."romiku_payments" add constraint "romiku_payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.romiku_orders(id) not valid;

alter table "public"."romiku_payments" validate constraint "romiku_payments_order_id_fkey";

alter table "public"."romiku_payments" add constraint "romiku_payments_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_payments" validate constraint "romiku_payments_owner_id_fkey";

alter table "public"."romiku_payments" add constraint "romiku_payments_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_payments" validate constraint "romiku_payments_updated_by_fkey";

alter table "public"."romiku_pi_items" add constraint "romiku_pi_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_pi_items" validate constraint "romiku_pi_items_created_by_fkey";

alter table "public"."romiku_pi_items" add constraint "romiku_pi_items_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_pi_items" validate constraint "romiku_pi_items_owner_id_fkey";

alter table "public"."romiku_pi_items" add constraint "romiku_pi_items_pi_id_fkey" FOREIGN KEY (pi_id) REFERENCES public.romiku_pis(id) not valid;

alter table "public"."romiku_pi_items" validate constraint "romiku_pi_items_pi_id_fkey";

alter table "public"."romiku_pi_items" add constraint "romiku_pi_items_quantity_check" CHECK ((quantity > (0)::numeric)) not valid;

alter table "public"."romiku_pi_items" validate constraint "romiku_pi_items_quantity_check";

alter table "public"."romiku_pi_items" add constraint "romiku_pi_items_source_quote_item_id_fkey" FOREIGN KEY (source_quote_item_id) REFERENCES public.romiku_quote_items(id) not valid;

alter table "public"."romiku_pi_items" validate constraint "romiku_pi_items_source_quote_item_id_fkey";

alter table "public"."romiku_pi_items" add constraint "romiku_pi_items_unit_price_check" CHECK ((unit_price >= (0)::numeric)) not valid;

alter table "public"."romiku_pi_items" validate constraint "romiku_pi_items_unit_price_check";

alter table "public"."romiku_pi_items" add constraint "romiku_pi_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_pi_items" validate constraint "romiku_pi_items_updated_by_fkey";

alter table "public"."romiku_pis" add constraint "romiku_pis_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_created_by_fkey";

alter table "public"."romiku_pis" add constraint "romiku_pis_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_currency_check";

alter table "public"."romiku_pis" add constraint "romiku_pis_deposit_percent_check" CHECK (((deposit_percent >= (0)::numeric) AND (deposit_percent <= (100)::numeric))) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_deposit_percent_check";

alter table "public"."romiku_pis" add constraint "romiku_pis_discount_check" CHECK ((discount >= (0)::numeric)) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_discount_check";

alter table "public"."romiku_pis" add constraint "romiku_pis_document_number_key" UNIQUE using index "romiku_pis_document_number_key";

alter table "public"."romiku_pis" add constraint "romiku_pis_formal_customer_id_fkey" FOREIGN KEY (formal_customer_id) REFERENCES public.romiku_formal_customers(id) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_formal_customer_id_fkey";

alter table "public"."romiku_pis" add constraint "romiku_pis_freight_check" CHECK ((freight >= (0)::numeric)) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_freight_check";

alter table "public"."romiku_pis" add constraint "romiku_pis_other_expenses_check" CHECK ((other_expenses >= (0)::numeric)) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_other_expenses_check";

alter table "public"."romiku_pis" add constraint "romiku_pis_outbound_company_id_fkey" FOREIGN KEY (outbound_company_id) REFERENCES public.romiku_outbound_companies(id) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_outbound_company_id_fkey";

alter table "public"."romiku_pis" add constraint "romiku_pis_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_owner_id_fkey";

alter table "public"."romiku_pis" add constraint "romiku_pis_source_quote_id_fkey" FOREIGN KEY (source_quote_id) REFERENCES public.romiku_quotes(id) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_source_quote_id_fkey";

alter table "public"."romiku_pis" add constraint "romiku_pis_source_website_inquiry_id_fkey" FOREIGN KEY (source_website_inquiry_id) REFERENCES public.romiku_website_inquiries(id) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_source_website_inquiry_id_fkey";

alter table "public"."romiku_pis" add constraint "romiku_pis_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_pis" validate constraint "romiku_pis_updated_by_fkey";

alter table "public"."romiku_procurement_cost_history" add constraint "romiku_procurement_cost_history_cost_check" CHECK ((cost >= (0)::numeric)) not valid;

alter table "public"."romiku_procurement_cost_history" validate constraint "romiku_procurement_cost_history_cost_check";

alter table "public"."romiku_procurement_cost_history" add constraint "romiku_procurement_cost_history_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_procurement_cost_history" validate constraint "romiku_procurement_cost_history_created_by_fkey";

alter table "public"."romiku_procurement_cost_history" add constraint "romiku_procurement_cost_history_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."romiku_procurement_cost_history" validate constraint "romiku_procurement_cost_history_currency_check";

alter table "public"."romiku_procurement_cost_history" add constraint "romiku_procurement_cost_history_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_procurement_cost_history" validate constraint "romiku_procurement_cost_history_owner_id_fkey";

alter table "public"."romiku_procurement_cost_history" add constraint "romiku_procurement_cost_history_product_supplier_id_fkey" FOREIGN KEY (product_supplier_id) REFERENCES public.romiku_product_suppliers(id) not valid;

alter table "public"."romiku_procurement_cost_history" validate constraint "romiku_procurement_cost_history_product_supplier_id_fkey";

alter table "public"."romiku_procurement_cost_history" add constraint "romiku_procurement_cost_history_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_procurement_cost_history" validate constraint "romiku_procurement_cost_history_updated_by_fkey";

alter table "public"."romiku_product_extensions" add constraint "romiku_product_extensions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_product_extensions" validate constraint "romiku_product_extensions_created_by_fkey";

alter table "public"."romiku_product_extensions" add constraint "romiku_product_extensions_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_product_extensions" validate constraint "romiku_product_extensions_owner_id_fkey";

alter table "public"."romiku_product_extensions" add constraint "romiku_product_extensions_sanity_product_id_key" UNIQUE using index "romiku_product_extensions_sanity_product_id_key";

alter table "public"."romiku_product_extensions" add constraint "romiku_product_extensions_sku_key" UNIQUE using index "romiku_product_extensions_sku_key";

alter table "public"."romiku_product_extensions" add constraint "romiku_product_extensions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_product_extensions" validate constraint "romiku_product_extensions_updated_by_fkey";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_carton_weight_kg_check" CHECK ((carton_weight_kg >= (0)::numeric)) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_carton_weight_kg_check";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_created_by_fkey";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_height_cm_check" CHECK ((height_cm >= (0)::numeric)) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_height_cm_check";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_lead_days_check" CHECK ((lead_days >= 0)) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_lead_days_check";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_length_cm_check" CHECK ((length_cm >= (0)::numeric)) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_length_cm_check";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_moq_check" CHECK ((moq >= (0)::numeric)) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_moq_check";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_owner_id_fkey";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_qty_per_carton_check" CHECK ((qty_per_carton > (0)::numeric)) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_qty_per_carton_check";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_sku_supplier_id_key" UNIQUE using index "romiku_product_suppliers_sku_supplier_id_key";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.romiku_suppliers(id) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_supplier_id_fkey";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_updated_by_fkey";

alter table "public"."romiku_product_suppliers" add constraint "romiku_product_suppliers_width_cm_check" CHECK ((width_cm >= (0)::numeric)) not valid;

alter table "public"."romiku_product_suppliers" validate constraint "romiku_product_suppliers_width_cm_check";

alter table "public"."romiku_production_followups" add constraint "romiku_production_followups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_followups" validate constraint "romiku_production_followups_created_by_fkey";

alter table "public"."romiku_production_followups" add constraint "romiku_production_followups_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_followups" validate constraint "romiku_production_followups_owner_id_fkey";

alter table "public"."romiku_production_followups" add constraint "romiku_production_followups_production_order_id_fkey" FOREIGN KEY (production_order_id) REFERENCES public.romiku_production_orders(id) not valid;

alter table "public"."romiku_production_followups" validate constraint "romiku_production_followups_production_order_id_fkey";

alter table "public"."romiku_production_followups" add constraint "romiku_production_followups_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_followups" validate constraint "romiku_production_followups_updated_by_fkey";

alter table "public"."romiku_production_items" add constraint "romiku_production_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_items" validate constraint "romiku_production_items_created_by_fkey";

alter table "public"."romiku_production_items" add constraint "romiku_production_items_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_items" validate constraint "romiku_production_items_owner_id_fkey";

alter table "public"."romiku_production_items" add constraint "romiku_production_items_production_order_id_order_id_fkey" FOREIGN KEY (production_order_id, order_id) REFERENCES public.romiku_production_orders(id, order_id) not valid;

alter table "public"."romiku_production_items" validate constraint "romiku_production_items_production_order_id_order_id_fkey";

alter table "public"."romiku_production_items" add constraint "romiku_production_items_quantity_check" CHECK ((quantity > (0)::numeric)) not valid;

alter table "public"."romiku_production_items" validate constraint "romiku_production_items_quantity_check";

alter table "public"."romiku_production_items" add constraint "romiku_production_items_source_order_item_id_order_id_fkey" FOREIGN KEY (source_order_item_id, order_id) REFERENCES public.romiku_order_items(id, order_id) not valid;

alter table "public"."romiku_production_items" validate constraint "romiku_production_items_source_order_item_id_order_id_fkey";

alter table "public"."romiku_production_items" add constraint "romiku_production_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_items" validate constraint "romiku_production_items_updated_by_fkey";

alter table "public"."romiku_production_orders" add constraint "romiku_production_orders_co_owner_id_fkey" FOREIGN KEY (co_owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_orders" validate constraint "romiku_production_orders_co_owner_id_fkey";

alter table "public"."romiku_production_orders" add constraint "romiku_production_orders_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_orders" validate constraint "romiku_production_orders_created_by_fkey";

alter table "public"."romiku_production_orders" add constraint "romiku_production_orders_document_number_key" UNIQUE using index "romiku_production_orders_document_number_key";

alter table "public"."romiku_production_orders" add constraint "romiku_production_orders_id_order_id_key" UNIQUE using index "romiku_production_orders_id_order_id_key";

alter table "public"."romiku_production_orders" add constraint "romiku_production_orders_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.romiku_orders(id) not valid;

alter table "public"."romiku_production_orders" validate constraint "romiku_production_orders_order_id_fkey";

alter table "public"."romiku_production_orders" add constraint "romiku_production_orders_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_orders" validate constraint "romiku_production_orders_owner_id_fkey";

alter table "public"."romiku_production_orders" add constraint "romiku_production_orders_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.romiku_suppliers(id) not valid;

alter table "public"."romiku_production_orders" validate constraint "romiku_production_orders_supplier_id_fkey";

alter table "public"."romiku_production_orders" add constraint "romiku_production_orders_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_production_orders" validate constraint "romiku_production_orders_updated_by_fkey";

alter table "public"."romiku_quote_items" add constraint "romiku_quote_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_quote_items" validate constraint "romiku_quote_items_created_by_fkey";

alter table "public"."romiku_quote_items" add constraint "romiku_quote_items_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_quote_items" validate constraint "romiku_quote_items_owner_id_fkey";

alter table "public"."romiku_quote_items" add constraint "romiku_quote_items_quantity_check" CHECK ((quantity > (0)::numeric)) not valid;

alter table "public"."romiku_quote_items" validate constraint "romiku_quote_items_quantity_check";

alter table "public"."romiku_quote_items" add constraint "romiku_quote_items_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES public.romiku_quotes(id) not valid;

alter table "public"."romiku_quote_items" validate constraint "romiku_quote_items_quote_id_fkey";

alter table "public"."romiku_quote_items" add constraint "romiku_quote_items_source_website_inquiry_item_id_fkey" FOREIGN KEY (source_website_inquiry_item_id) REFERENCES public.romiku_website_inquiry_items(id) not valid;

alter table "public"."romiku_quote_items" validate constraint "romiku_quote_items_source_website_inquiry_item_id_fkey";

alter table "public"."romiku_quote_items" add constraint "romiku_quote_items_unit_price_check" CHECK ((unit_price >= (0)::numeric)) not valid;

alter table "public"."romiku_quote_items" validate constraint "romiku_quote_items_unit_price_check";

alter table "public"."romiku_quote_items" add constraint "romiku_quote_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_quote_items" validate constraint "romiku_quote_items_updated_by_fkey";

alter table "public"."romiku_quote_versions" add constraint "romiku_quote_versions_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_quote_versions" validate constraint "romiku_quote_versions_created_by_fkey";

alter table "public"."romiku_quote_versions" add constraint "romiku_quote_versions_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_quote_versions" validate constraint "romiku_quote_versions_owner_id_fkey";

alter table "public"."romiku_quote_versions" add constraint "romiku_quote_versions_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES public.romiku_quotes(id) not valid;

alter table "public"."romiku_quote_versions" validate constraint "romiku_quote_versions_quote_id_fkey";

alter table "public"."romiku_quote_versions" add constraint "romiku_quote_versions_quote_id_version_key" UNIQUE using index "romiku_quote_versions_quote_id_version_key";

alter table "public"."romiku_quote_versions" add constraint "romiku_quote_versions_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_quote_versions" validate constraint "romiku_quote_versions_updated_by_fkey";

alter table "public"."romiku_quote_versions" add constraint "romiku_quote_versions_version_check" CHECK ((version > 0)) not valid;

alter table "public"."romiku_quote_versions" validate constraint "romiku_quote_versions_version_check";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_created_by_fkey";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_currency_check" CHECK ((currency ~ '^[A-Z]{3}$'::text)) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_currency_check";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_deposit_percent_check" CHECK (((deposit_percent >= (0)::numeric) AND (deposit_percent <= (100)::numeric))) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_deposit_percent_check";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_discount_check" CHECK ((discount >= (0)::numeric)) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_discount_check";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_document_number_key" UNIQUE using index "romiku_quotes_document_number_key";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_formal_customer_id_fkey" FOREIGN KEY (formal_customer_id) REFERENCES public.romiku_formal_customers(id) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_formal_customer_id_fkey";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_freight_check" CHECK ((freight >= (0)::numeric)) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_freight_check";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_other_expenses_check" CHECK ((other_expenses >= (0)::numeric)) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_other_expenses_check";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_outbound_company_id_fkey" FOREIGN KEY (outbound_company_id) REFERENCES public.romiku_outbound_companies(id) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_outbound_company_id_fkey";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_owner_id_fkey";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_source_website_inquiry_id_fkey" FOREIGN KEY (source_website_inquiry_id) REFERENCES public.romiku_website_inquiries(id) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_source_website_inquiry_id_fkey";

alter table "public"."romiku_quotes" add constraint "romiku_quotes_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_quotes" validate constraint "romiku_quotes_updated_by_fkey";

alter table "public"."romiku_source_urls" add constraint "romiku_source_urls_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_source_urls" validate constraint "romiku_source_urls_created_by_fkey";

alter table "public"."romiku_source_urls" add constraint "romiku_source_urls_outbound_company_id_fkey" FOREIGN KEY (outbound_company_id) REFERENCES public.romiku_outbound_companies(id) not valid;

alter table "public"."romiku_source_urls" validate constraint "romiku_source_urls_outbound_company_id_fkey";

alter table "public"."romiku_source_urls" add constraint "romiku_source_urls_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_source_urls" validate constraint "romiku_source_urls_owner_id_fkey";

alter table "public"."romiku_source_urls" add constraint "romiku_source_urls_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_source_urls" validate constraint "romiku_source_urls_updated_by_fkey";

alter table "public"."romiku_source_urls" add constraint "romiku_source_urls_url_check" CHECK ((url ~ '^https?://'::text)) not valid;

alter table "public"."romiku_source_urls" validate constraint "romiku_source_urls_url_check";

alter table "public"."romiku_supplier_contacts" add constraint "romiku_supplier_contacts_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_supplier_contacts" validate constraint "romiku_supplier_contacts_created_by_fkey";

alter table "public"."romiku_supplier_contacts" add constraint "romiku_supplier_contacts_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_supplier_contacts" validate constraint "romiku_supplier_contacts_owner_id_fkey";

alter table "public"."romiku_supplier_contacts" add constraint "romiku_supplier_contacts_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES public.romiku_suppliers(id) not valid;

alter table "public"."romiku_supplier_contacts" validate constraint "romiku_supplier_contacts_supplier_id_fkey";

alter table "public"."romiku_supplier_contacts" add constraint "romiku_supplier_contacts_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_supplier_contacts" validate constraint "romiku_supplier_contacts_updated_by_fkey";

alter table "public"."romiku_suppliers" add constraint "romiku_suppliers_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_suppliers" validate constraint "romiku_suppliers_created_by_fkey";

alter table "public"."romiku_suppliers" add constraint "romiku_suppliers_default_lead_days_check" CHECK ((default_lead_days >= 0)) not valid;

alter table "public"."romiku_suppliers" validate constraint "romiku_suppliers_default_lead_days_check";

alter table "public"."romiku_suppliers" add constraint "romiku_suppliers_grade_check" CHECK ((grade = ANY (ARRAY['A'::text, 'B'::text, 'C'::text]))) not valid;

alter table "public"."romiku_suppliers" validate constraint "romiku_suppliers_grade_check";

alter table "public"."romiku_suppliers" add constraint "romiku_suppliers_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_suppliers" validate constraint "romiku_suppliers_owner_id_fkey";

alter table "public"."romiku_suppliers" add constraint "romiku_suppliers_status_check" CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text, 'inactive'::text]))) not valid;

alter table "public"."romiku_suppliers" validate constraint "romiku_suppliers_status_check";

alter table "public"."romiku_suppliers" add constraint "romiku_suppliers_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_suppliers" validate constraint "romiku_suppliers_updated_by_fkey";

alter table "public"."romiku_website_inquiries" add constraint "romiku_website_inquiries_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_website_inquiries" validate constraint "romiku_website_inquiries_created_by_fkey";

alter table "public"."romiku_website_inquiries" add constraint "romiku_website_inquiries_document_number_key" UNIQUE using index "romiku_website_inquiries_document_number_key";

alter table "public"."romiku_website_inquiries" add constraint "romiku_website_inquiries_formal_customer_id_fkey" FOREIGN KEY (formal_customer_id) REFERENCES public.romiku_formal_customers(id) not valid;

alter table "public"."romiku_website_inquiries" validate constraint "romiku_website_inquiries_formal_customer_id_fkey";

alter table "public"."romiku_website_inquiries" add constraint "romiku_website_inquiries_outbound_company_id_fkey" FOREIGN KEY (outbound_company_id) REFERENCES public.romiku_outbound_companies(id) not valid;

alter table "public"."romiku_website_inquiries" validate constraint "romiku_website_inquiries_outbound_company_id_fkey";

alter table "public"."romiku_website_inquiries" add constraint "romiku_website_inquiries_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_website_inquiries" validate constraint "romiku_website_inquiries_owner_id_fkey";

alter table "public"."romiku_website_inquiries" add constraint "romiku_website_inquiries_status_check" CHECK ((status = ANY (ARRAY['new'::text, 'pending'::text, 'following_up'::text, 'processed'::text, 'invalid'::text]))) not valid;

alter table "public"."romiku_website_inquiries" validate constraint "romiku_website_inquiries_status_check";

alter table "public"."romiku_website_inquiries" add constraint "romiku_website_inquiries_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_website_inquiries" validate constraint "romiku_website_inquiries_updated_by_fkey";

alter table "public"."romiku_website_inquiry_followups" add constraint "romiku_website_inquiry_followups_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_website_inquiry_followups" validate constraint "romiku_website_inquiry_followups_created_by_fkey";

alter table "public"."romiku_website_inquiry_followups" add constraint "romiku_website_inquiry_followups_inquiry_id_fkey" FOREIGN KEY (inquiry_id) REFERENCES public.romiku_website_inquiries(id) not valid;

alter table "public"."romiku_website_inquiry_followups" validate constraint "romiku_website_inquiry_followups_inquiry_id_fkey";

alter table "public"."romiku_website_inquiry_followups" add constraint "romiku_website_inquiry_followups_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_website_inquiry_followups" validate constraint "romiku_website_inquiry_followups_owner_id_fkey";

alter table "public"."romiku_website_inquiry_followups" add constraint "romiku_website_inquiry_followups_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_website_inquiry_followups" validate constraint "romiku_website_inquiry_followups_updated_by_fkey";

alter table "public"."romiku_website_inquiry_items" add constraint "romiku_website_inquiry_items_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_website_inquiry_items" validate constraint "romiku_website_inquiry_items_created_by_fkey";

alter table "public"."romiku_website_inquiry_items" add constraint "romiku_website_inquiry_items_inquiry_id_fkey" FOREIGN KEY (inquiry_id) REFERENCES public.romiku_website_inquiries(id) not valid;

alter table "public"."romiku_website_inquiry_items" validate constraint "romiku_website_inquiry_items_inquiry_id_fkey";

alter table "public"."romiku_website_inquiry_items" add constraint "romiku_website_inquiry_items_match_status_check" CHECK ((match_status = ANY (ARRAY['unresolved'::text, 'matched'::text, 'not_found'::text, 'error'::text]))) not valid;

alter table "public"."romiku_website_inquiry_items" validate constraint "romiku_website_inquiry_items_match_status_check";

alter table "public"."romiku_website_inquiry_items" add constraint "romiku_website_inquiry_items_owner_id_fkey" FOREIGN KEY (owner_id) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_website_inquiry_items" validate constraint "romiku_website_inquiry_items_owner_id_fkey";

alter table "public"."romiku_website_inquiry_items" add constraint "romiku_website_inquiry_items_quantity_check" CHECK ((quantity > (0)::numeric)) not valid;

alter table "public"."romiku_website_inquiry_items" validate constraint "romiku_website_inquiry_items_quantity_check";

alter table "public"."romiku_website_inquiry_items" add constraint "romiku_website_inquiry_items_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) not valid;

alter table "public"."romiku_website_inquiry_items" validate constraint "romiku_website_inquiry_items_updated_by_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.romiku_assign_number()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  prefix_value text;
  digits integer;
  sequence_value text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.document_number IS DISTINCT FROM OLD.document_number THEN
      RAISE EXCEPTION 'Document number is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.document_number IS NOT NULL THEN
    RAISE EXCEPTION 'Document number is server generated' USING ERRCODE = '23514';
  END IF;
  SELECT r.prefix, r.min_digits INTO prefix_value, digits
    FROM public.romiku_numbering_rules r WHERE r.document_kind = TG_ARGV[0];
  prefix_value := coalesce(prefix_value, TG_ARGV[1]);
  digits := coalesce(digits, 6);
  sequence_value := nextval('public.romiku_document_number_seq')::text;
  NEW.document_number := prefix_value || '-' || lpad(sequence_value, greatest(digits, length(sequence_value)), '0');
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.romiku_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := now();
    NEW.created_by := auth.uid();
  ELSE
    IF NEW.id IS DISTINCT FROM OLD.id THEN
      RAISE EXCEPTION 'Record identity is immutable' USING ERRCODE = '23514';
    END IF;
    NEW.created_at := OLD.created_at;
    NEW.created_by := OLD.created_by;
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$function$
;

create or replace view "public"."romiku_calendar" as  SELECT ('inquiry_follow_up:'::text || (romiku_website_inquiries.id)::text) AS id,
    'inquiry_follow_up'::text AS event_type,
    'romiku_website_inquiries'::text AS source_table,
    romiku_website_inquiries.id AS source_id,
    romiku_website_inquiries.document_number AS title,
    romiku_website_inquiries.next_follow_up_at AS due_at,
    romiku_website_inquiries.owner_id,
    romiku_website_inquiries.status
   FROM public.romiku_website_inquiries
  WHERE ((romiku_website_inquiries.next_follow_up_at IS NOT NULL) AND (romiku_website_inquiries.archived_at IS NULL) AND (romiku_website_inquiries.status <> ALL (ARRAY['processed'::text, 'invalid'::text])))
UNION ALL
 SELECT ('outbound_follow_up:'::text || (romiku_outbound_companies.id)::text) AS id,
    'outbound_follow_up'::text AS event_type,
    'romiku_outbound_companies'::text AS source_table,
    romiku_outbound_companies.id AS source_id,
    romiku_outbound_companies.name AS title,
    romiku_outbound_companies.next_follow_up_at AS due_at,
    romiku_outbound_companies.owner_id,
    romiku_outbound_companies.status
   FROM public.romiku_outbound_companies
  WHERE ((romiku_outbound_companies.next_follow_up_at IS NOT NULL) AND (romiku_outbound_companies.archived_at IS NULL) AND (romiku_outbound_companies.status <> ALL (ARRAY['paused'::text, 'invalid'::text])))
UNION ALL
 SELECT ('quote_follow_up:'::text || (romiku_quotes.id)::text) AS id,
    'quote_follow_up'::text AS event_type,
    'romiku_quotes'::text AS source_table,
    romiku_quotes.id AS source_id,
    romiku_quotes.document_number AS title,
    romiku_quotes.follow_up_at AS due_at,
    romiku_quotes.owner_id,
    romiku_quotes.status
   FROM public.romiku_quotes
  WHERE ((romiku_quotes.follow_up_at IS NOT NULL) AND (romiku_quotes.archived_at IS NULL))
UNION ALL
 SELECT ('quote_due:'::text || (romiku_quotes.id)::text) AS id,
    'quote_due'::text AS event_type,
    'romiku_quotes'::text AS source_table,
    romiku_quotes.id AS source_id,
    romiku_quotes.document_number AS title,
    romiku_quotes.due_at,
    romiku_quotes.owner_id,
    romiku_quotes.status
   FROM public.romiku_quotes
  WHERE ((romiku_quotes.due_at IS NOT NULL) AND (romiku_quotes.archived_at IS NULL))
UNION ALL
 SELECT ('pi_follow_up:'::text || (romiku_pis.id)::text) AS id,
    'pi_follow_up'::text AS event_type,
    'romiku_pis'::text AS source_table,
    romiku_pis.id AS source_id,
    romiku_pis.document_number AS title,
    romiku_pis.follow_up_at AS due_at,
    romiku_pis.owner_id,
    romiku_pis.status
   FROM public.romiku_pis
  WHERE ((romiku_pis.follow_up_at IS NOT NULL) AND (romiku_pis.archived_at IS NULL))
UNION ALL
 SELECT ('pi_due:'::text || (romiku_pis.id)::text) AS id,
    'pi_due'::text AS event_type,
    'romiku_pis'::text AS source_table,
    romiku_pis.id AS source_id,
    romiku_pis.document_number AS title,
    romiku_pis.due_at,
    romiku_pis.owner_id,
    romiku_pis.status
   FROM public.romiku_pis
  WHERE ((romiku_pis.due_at IS NOT NULL) AND (romiku_pis.archived_at IS NULL))
UNION ALL
 SELECT ('order_delivery:'::text || (romiku_orders.id)::text) AS id,
    'order_delivery'::text AS event_type,
    'romiku_orders'::text AS source_table,
    romiku_orders.id AS source_id,
    romiku_orders.document_number AS title,
    romiku_orders.expected_delivery_at AS due_at,
    romiku_orders.owner_id,
    romiku_orders.status
   FROM public.romiku_orders
  WHERE ((romiku_orders.expected_delivery_at IS NOT NULL) AND (romiku_orders.archived_at IS NULL) AND (romiku_orders.actual_delivery_at IS NULL))
UNION ALL
 SELECT ('production_due:'::text || (romiku_production_orders.id)::text) AS id,
    'production_due'::text AS event_type,
    'romiku_production_orders'::text AS source_table,
    romiku_production_orders.id AS source_id,
    romiku_production_orders.document_number AS title,
    romiku_production_orders.factory_due_at AS due_at,
    romiku_production_orders.owner_id,
    romiku_production_orders.status
   FROM public.romiku_production_orders
  WHERE ((romiku_production_orders.factory_due_at IS NOT NULL) AND (romiku_production_orders.archived_at IS NULL) AND (romiku_production_orders.status <> ALL (ARRAY['completed'::text, 'received'::text, 'cancelled'::text])))
UNION ALL
 SELECT ('packing:'::text || (romiku_packing_lists.id)::text) AS id,
    'packing'::text AS event_type,
    'romiku_packing_lists'::text AS source_table,
    romiku_packing_lists.id AS source_id,
    romiku_packing_lists.document_number AS title,
    romiku_packing_lists.packing_at AS due_at,
    romiku_packing_lists.owner_id,
    'scheduled'::text AS status
   FROM public.romiku_packing_lists
  WHERE ((romiku_packing_lists.packing_at IS NOT NULL) AND (romiku_packing_lists.archived_at IS NULL))
UNION ALL
 SELECT ('manual_task:'::text || (romiku_manual_tasks.id)::text) AS id,
    'manual_task'::text AS event_type,
    'romiku_manual_tasks'::text AS source_table,
    romiku_manual_tasks.id AS source_id,
    romiku_manual_tasks.title,
    romiku_manual_tasks.due_at,
    romiku_manual_tasks.owner_id,
        CASE
            WHEN (romiku_manual_tasks.completed_at IS NULL) THEN 'pending'::text
            ELSE 'completed'::text
        END AS status
   FROM public.romiku_manual_tasks
  WHERE ((romiku_manual_tasks.due_at IS NOT NULL) AND (romiku_manual_tasks.completed_at IS NULL));


CREATE OR REPLACE FUNCTION public.romiku_check_order_quantity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Packing requires READ COMMITTED; retry the transaction' USING ERRCODE = '40001';
  END IF;
  IF NEW.quantity < (SELECT coalesce(sum(p.quantity),0) FROM public.romiku_packing_items p WHERE p.source_order_item_id = NEW.id) THEN
    RAISE EXCEPTION 'Order quantity cannot fall below packed quantity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.romiku_check_packing_quantity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  ordered numeric;
  packed numeric;
BEGIN
  -- A fixed snapshot cannot refresh the SUM after waiting for a packing writer.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'Packing requires READ COMMITTED; retry the transaction' USING ERRCODE = '40001';
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW.source_order_item_id,NEW.order_id,NEW.packing_list_id)
    IS DISTINCT FROM (OLD.source_order_item_id,OLD.order_id,OLD.packing_list_id) THEN
    RAISE EXCEPTION 'Packing item source is immutable' USING ERRCODE = '23514';
  END IF;
  -- Serialize every allocation against the source row. The following aggregate
  -- is a new READ COMMITTED statement after the lock, so it sees committed peers.
  SELECT i.quantity INTO ordered FROM public.romiku_order_items i
    WHERE i.id = NEW.source_order_item_id AND i.order_id = NEW.order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Packing source must belong to the order' USING ERRCODE = '23503';
  END IF;
  SELECT coalesce(sum(i.quantity),0) INTO packed FROM public.romiku_packing_items i
    WHERE i.source_order_item_id = NEW.source_order_item_id AND i.id <> NEW.id;
  IF packed + NEW.quantity > ordered THEN
    RAISE EXCEPTION 'Packed quantity exceeds remaining ordered quantity' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.romiku_convert_document(source_kind text, source_id uuid, target_kind text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  source_table text;
  target_table text;
  source_items text;
  target_items text;
  source_fk text;
  target_fk text;
  lineage_column text;
  source_json jsonb;
  new_id uuid;
BEGIN
  IF source_kind = 'quote' AND target_kind IN ('pi','order') THEN
    source_table := 'romiku_quotes'; source_items := 'romiku_quote_items'; source_fk := 'quote_id';
    lineage_column := 'source_quote_item_id';
  ELSIF source_kind = 'pi' AND target_kind = 'order' THEN
    source_table := 'romiku_pis'; source_items := 'romiku_pi_items'; source_fk := 'pi_id';
    lineage_column := 'source_pi_item_id';
  ELSE
    RAISE EXCEPTION 'Unsupported document conversion' USING ERRCODE = '23514';
  END IF;
  IF target_kind = 'pi' THEN
    target_table := 'romiku_pis'; target_items := 'romiku_pi_items'; target_fk := 'pi_id';
  ELSE
    target_table := 'romiku_orders'; target_items := 'romiku_order_items'; target_fk := 'order_id';
  END IF;
  EXECUTE format('SELECT to_jsonb(s) FROM public.%I s WHERE id = $1 FOR UPDATE',source_table)
    INTO source_json USING source_id;
  IF source_json IS NULL THEN
    RAISE EXCEPTION 'Source document not found' USING ERRCODE = 'P0002';
  END IF;
  -- Item writes also lock this header, preserving a coherent copy while converting.
  source_json := source_json || jsonb_build_object('source_' || source_kind || '_id',source_id);
  EXECUTE format('INSERT INTO public.%I (counterparty_snapshot,bank_snapshot,terms_snapshot,currency,document_date,follow_up_at,due_at,freight,discount,other_expenses,deposit_percent,deposit_due_at,balance_due_at,price_term,shipment_method,notes,source_website_inquiry_id,outbound_company_id,formal_customer_id,source_quote_id%s)
    SELECT counterparty_snapshot,bank_snapshot,terms_snapshot,currency,document_date,follow_up_at,due_at,freight,discount,other_expenses,deposit_percent,deposit_due_at,balance_due_at,price_term,shipment_method,notes,source_website_inquiry_id,outbound_company_id,formal_customer_id,source_quote_id%s FROM jsonb_populate_record(NULL::public.%I,$1) RETURNING id',
    target_table,CASE WHEN target_kind = 'order' THEN ',source_pi_id' ELSE '' END,
    CASE WHEN target_kind = 'order' THEN ',source_pi_id' ELSE '' END,target_table)
    INTO new_id USING source_json;
  EXECUTE format('INSERT INTO public.%I (%I,%I,sanity_product_id,sku,product_snapshot,packing_snapshot,quantity,unit_price,requirement,customer_code,notes,position)
    SELECT $1,id,sanity_product_id,sku,product_snapshot,packing_snapshot,quantity,unit_price,requirement,customer_code,notes,position FROM public.%I WHERE %I=$2',
    target_items,target_fk,lineage_column,source_items,source_fk) USING new_id,source_id;
  RETURN new_id;
END;
$function$
;

create or replace view "public"."romiku_current_reference_cost" as  SELECT DISTINCT ON (romiku_procurement_cost_history.product_supplier_id, romiku_procurement_cost_history.currency) romiku_procurement_cost_history.id,
    romiku_procurement_cost_history.product_supplier_id,
    romiku_procurement_cost_history.cost,
    romiku_procurement_cost_history.currency,
    romiku_procurement_cost_history.effective_date,
    romiku_procurement_cost_history.source_type,
    romiku_procurement_cost_history.source_note,
    romiku_procurement_cost_history.source_file,
    romiku_procurement_cost_history.owner_id,
    romiku_procurement_cost_history.created_at,
    romiku_procurement_cost_history.updated_at,
    romiku_procurement_cost_history.created_by,
    romiku_procurement_cost_history.updated_by
   FROM public.romiku_procurement_cost_history
  WHERE (romiku_procurement_cost_history.effective_date <= CURRENT_DATE)
  ORDER BY romiku_procurement_cost_history.product_supplier_id, romiku_procurement_cost_history.currency, romiku_procurement_cost_history.effective_date DESC, romiku_procurement_cost_history.created_at DESC, romiku_procurement_cost_history.id DESC;


CREATE OR REPLACE FUNCTION public.romiku_lock_document_parent()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  parent_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW)->>TG_ARGV[1]) IS DISTINCT FROM (to_jsonb(OLD)->>TG_ARGV[1]) THEN
    RAISE EXCEPTION 'Document item parent is immutable' USING ERRCODE = '23514';
  END IF;
  parent_id := (CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END ->> TG_ARGV[1])::uuid;
  EXECUTE format('SELECT id FROM public.%I WHERE id = $1 FOR UPDATE', TG_ARGV[0]) USING parent_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$
;

create or replace view "public"."romiku_order_item_remaining" as  SELECT i.id,
    i.order_id,
    i.sku,
    i.quantity AS ordered_quantity,
    COALESCE(p.quantity, (0)::numeric) AS packed_quantity,
    (i.quantity - COALESCE(p.quantity, (0)::numeric)) AS remaining_quantity,
    COALESCE(w.quantity, (0)::numeric) AS production_quantity,
    (i.quantity - COALESCE(w.quantity, (0)::numeric)) AS unallocated_quantity
   FROM ((public.romiku_order_items i
     LEFT JOIN ( SELECT romiku_packing_items.source_order_item_id,
            sum(romiku_packing_items.quantity) AS quantity
           FROM public.romiku_packing_items
          GROUP BY romiku_packing_items.source_order_item_id) p ON ((p.source_order_item_id = i.id)))
     LEFT JOIN ( SELECT romiku_production_items.source_order_item_id,
            sum(romiku_production_items.quantity) AS quantity
           FROM public.romiku_production_items
          GROUP BY romiku_production_items.source_order_item_id) w ON ((w.source_order_item_id = i.id)));


create or replace view "public"."romiku_order_totals" as  SELECT b.id,
    b.document_number,
    b.status,
    b.counterparty_snapshot,
    b.bank_snapshot,
    b.terms_snapshot,
    b.currency,
    b.document_date,
    b.follow_up_at,
    b.due_at,
    b.freight,
    b.discount,
    b.other_expenses,
    b.deposit_percent,
    b.deposit_due_at,
    b.balance_due_at,
    b.price_term,
    b.shipment_method,
    b.notes,
    b.archived_at,
    b.source_website_inquiry_id,
    b.outbound_company_id,
    b.formal_customer_id,
    b.source_quote_id,
    b.source_pi_id,
    b.expected_delivery_at,
    b.actual_delivery_at,
    b.co_owner_id,
    b.purchase_order_number,
    b.owner_id,
    b.created_at,
    b.updated_at,
    b.created_by,
    b.updated_by,
    b.subtotal,
    b.total,
    COALESCE(p.received_amount, (0)::numeric) AS received_amount,
    (b.total - COALESCE(p.received_amount, (0)::numeric)) AS remaining_amount,
    round(((b.total * b.deposit_percent) / (100)::numeric), 2) AS expected_deposit,
    GREATEST((round(((b.total * b.deposit_percent) / (100)::numeric), 2) - COALESCE(p.deposit_received, (0)::numeric)), (0)::numeric) AS deposit_remaining
   FROM (( SELECT d.id,
            d.document_number,
            d.status,
            d.counterparty_snapshot,
            d.bank_snapshot,
            d.terms_snapshot,
            d.currency,
            d.document_date,
            d.follow_up_at,
            d.due_at,
            d.freight,
            d.discount,
            d.other_expenses,
            d.deposit_percent,
            d.deposit_due_at,
            d.balance_due_at,
            d.price_term,
            d.shipment_method,
            d.notes,
            d.archived_at,
            d.source_website_inquiry_id,
            d.outbound_company_id,
            d.formal_customer_id,
            d.source_quote_id,
            d.source_pi_id,
            d.expected_delivery_at,
            d.actual_delivery_at,
            d.co_owner_id,
            d.purchase_order_number,
            d.owner_id,
            d.created_at,
            d.updated_at,
            d.created_by,
            d.updated_by,
            COALESCE(i.subtotal, (0)::numeric) AS subtotal,
            (((COALESCE(i.subtotal, (0)::numeric) + d.freight) + d.other_expenses) - d.discount) AS total
           FROM (public.romiku_orders d
             LEFT JOIN ( SELECT romiku_order_items.order_id,
                    sum(romiku_order_items.amount) AS subtotal
                   FROM public.romiku_order_items
                  GROUP BY romiku_order_items.order_id) i ON ((i.order_id = d.id)))) b
     LEFT JOIN ( SELECT romiku_payments.order_id,
            sum(romiku_payments.amount) AS received_amount,
            sum(romiku_payments.amount) FILTER (WHERE (romiku_payments.kind = 'deposit'::text)) AS deposit_received
           FROM public.romiku_payments
          GROUP BY romiku_payments.order_id) p ON ((p.order_id = b.id)));


create or replace view "public"."romiku_outbound_summary" as  SELECT c.id,
    c.name,
    c.brand_name,
    c.country,
    c.city,
    c.address,
    c.registration_number,
    c.customer_type,
    c.website,
    c.social_urls,
    c.purchasing_categories,
    c.business_intelligence,
    c.grade,
    c.status,
    c.next_follow_up_at,
    c.notes,
    c.archived_at,
    c.owner_id,
    c.created_at,
    c.updated_at,
    c.created_by,
    c.updated_by,
    COALESCE(f.follow_up_count, (0)::bigint) AS follow_up_count,
    f.last_contact_at
   FROM (public.romiku_outbound_companies c
     LEFT JOIN ( SELECT romiku_outbound_followups.outbound_company_id,
            count(*) AS follow_up_count,
            max(romiku_outbound_followups.contacted_at) AS last_contact_at
           FROM public.romiku_outbound_followups
          GROUP BY romiku_outbound_followups.outbound_company_id) f ON ((f.outbound_company_id = c.id)));


create or replace view "public"."romiku_packing_totals" as  SELECT p.id,
    p.document_number,
    p.name,
    p.order_id,
    p.packing_at,
    p.shipping_mark,
    p.batch_label,
    p.notes,
    p.archived_at,
    p.owner_id,
    p.created_at,
    p.updated_at,
    p.created_by,
    p.updated_by,
    COALESCE(i.total_cartons, (0)::bigint) AS total_cartons,
    COALESCE(i.total_cbm, (0)::numeric) AS total_cbm,
    COALESCE(i.total_weight_kg, (0)::numeric) AS total_weight_kg
   FROM (public.romiku_packing_lists p
     LEFT JOIN ( SELECT romiku_packing_items.packing_list_id,
            sum(romiku_packing_items.cartons) AS total_cartons,
            sum(romiku_packing_items.total_cbm) AS total_cbm,
            sum(romiku_packing_items.total_weight_kg) AS total_weight_kg
           FROM public.romiku_packing_items
          GROUP BY romiku_packing_items.packing_list_id) i ON ((i.packing_list_id = p.id)));


create or replace view "public"."romiku_pi_totals" as  SELECT d.id,
    d.document_number,
    d.status,
    d.counterparty_snapshot,
    d.bank_snapshot,
    d.terms_snapshot,
    d.currency,
    d.document_date,
    d.follow_up_at,
    d.due_at,
    d.freight,
    d.discount,
    d.other_expenses,
    d.deposit_percent,
    d.deposit_due_at,
    d.balance_due_at,
    d.price_term,
    d.shipment_method,
    d.notes,
    d.archived_at,
    d.source_website_inquiry_id,
    d.outbound_company_id,
    d.formal_customer_id,
    d.source_quote_id,
    d.owner_id,
    d.created_at,
    d.updated_at,
    d.created_by,
    d.updated_by,
    COALESCE(i.subtotal, (0)::numeric) AS subtotal,
    (((COALESCE(i.subtotal, (0)::numeric) + d.freight) + d.other_expenses) - d.discount) AS total
   FROM (public.romiku_pis d
     LEFT JOIN ( SELECT romiku_pi_items.pi_id,
            sum(romiku_pi_items.amount) AS subtotal
           FROM public.romiku_pi_items
          GROUP BY romiku_pi_items.pi_id) i ON ((i.pi_id = d.id)));


CREATE OR REPLACE FUNCTION public.romiku_preserve_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  RAISE EXCEPTION 'History is append only' USING ERRCODE = '23514';
END;
$function$
;

CREATE OR REPLACE FUNCTION public.romiku_preserve_inquiry()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Archive inquiry originals instead of deleting' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'romiku_website_inquiries' THEN
    IF (NEW.customer_name,NEW.company,NEW.email,NEW.whatsapp,NEW.country,NEW.message,NEW.raw_payload,NEW.submitted_at)
       IS DISTINCT FROM
       (OLD.customer_name,OLD.company,OLD.email,OLD.whatsapp,OLD.country,OLD.message,OLD.raw_payload,OLD.submitted_at) THEN
      RAISE EXCEPTION 'Website submission is immutable' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF (NEW.inquiry_id,NEW.sku,NEW.quantity,NEW.requirement)
       IS DISTINCT FROM (OLD.inquiry_id,OLD.sku,OLD.quantity,OLD.requirement) THEN
      RAISE EXCEPTION 'Original inquiry item is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.romiku_publish_quote_version(quote_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  source_json jsonb;
  version_number integer;
  new_id uuid;
BEGIN
  SELECT to_jsonb(q) INTO STRICT source_json FROM public.romiku_quotes q WHERE q.id = quote_id FOR UPDATE;
  SELECT coalesce(max(v.version),0)+1 INTO version_number FROM public.romiku_quote_versions v WHERE v.quote_id = romiku_publish_quote_version.quote_id;
  INSERT INTO public.romiku_quote_versions(quote_id,version,document_snapshot,items_snapshot)
  SELECT romiku_publish_quote_version.quote_id,version_number,source_json,coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.position,i.id),'[]'::jsonb)
    FROM public.romiku_quote_items i WHERE i.quote_id = romiku_publish_quote_version.quote_id
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.romiku_quote_from_inquiry(inquiry_id uuid, selected_item_ids uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  source public.romiku_website_inquiries;
  new_id uuid;
  selected_count integer;
BEGIN
  SELECT * INTO STRICT source FROM public.romiku_website_inquiries WHERE id = inquiry_id FOR UPDATE;
  SELECT count(*) INTO selected_count FROM public.romiku_website_inquiry_items i
    WHERE i.inquiry_id = source.id AND i.id = ANY(selected_item_ids);
  IF selected_count = 0 OR selected_count <> cardinality(selected_item_ids) THEN
    RAISE EXCEPTION 'Select distinct items belonging to the inquiry' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.romiku_quotes(source_website_inquiry_id,outbound_company_id,formal_customer_id,counterparty_snapshot)
  VALUES (source.id,source.outbound_company_id,source.formal_customer_id,
    jsonb_build_object('name',source.customer_name,'company',source.company,'email',source.email,'whatsapp',source.whatsapp,'country',source.country))
  RETURNING id INTO new_id;
  INSERT INTO public.romiku_quote_items(quote_id,source_website_inquiry_item_id,sanity_product_id,sku,quantity,requirement,product_snapshot,position)
  SELECT new_id,i.id,i.sanity_product_id,i.sku,i.quantity,i.requirement,i.product_snapshot,array_position(selected_item_ids,i.id)
    FROM public.romiku_website_inquiry_items i WHERE i.id = ANY(selected_item_ids);
  RETURN new_id;
END;
$function$
;

create or replace view "public"."romiku_quote_totals" as  SELECT d.id,
    d.document_number,
    d.status,
    d.counterparty_snapshot,
    d.bank_snapshot,
    d.terms_snapshot,
    d.currency,
    d.document_date,
    d.follow_up_at,
    d.due_at,
    d.freight,
    d.discount,
    d.other_expenses,
    d.deposit_percent,
    d.deposit_due_at,
    d.balance_due_at,
    d.price_term,
    d.shipment_method,
    d.notes,
    d.archived_at,
    d.source_website_inquiry_id,
    d.outbound_company_id,
    d.formal_customer_id,
    d.valid_until,
    d.owner_id,
    d.created_at,
    d.updated_at,
    d.created_by,
    d.updated_by,
    COALESCE(i.subtotal, (0)::numeric) AS subtotal,
    (((COALESCE(i.subtotal, (0)::numeric) + d.freight) + d.other_expenses) - d.discount) AS total
   FROM (public.romiku_quotes d
     LEFT JOIN ( SELECT romiku_quote_items.quote_id,
            sum(romiku_quote_items.amount) AS subtotal
           FROM public.romiku_quote_items
          GROUP BY romiku_quote_items.quote_id) i ON ((i.quote_id = d.id)));


create or replace view "public"."romiku_workbench" as  SELECT e.id,
    e.event_type,
    e.source_table,
    e.source_id,
    e.title,
    e.due_at,
    e.owner_id,
    e.status,
    (e.due_at < now()) AS is_overdue
   FROM public.romiku_calendar e
UNION ALL
 SELECT ('inquiry_new:'::text || (romiku_website_inquiries.id)::text) AS id,
    'inquiry_new'::text AS event_type,
    'romiku_website_inquiries'::text AS source_table,
    romiku_website_inquiries.id AS source_id,
    romiku_website_inquiries.document_number AS title,
    romiku_website_inquiries.submitted_at AS due_at,
    romiku_website_inquiries.owner_id,
    romiku_website_inquiries.status,
    false AS is_overdue
   FROM public.romiku_website_inquiries
  WHERE ((romiku_website_inquiries.status = ANY (ARRAY['new'::text, 'pending'::text])) AND (romiku_website_inquiries.archived_at IS NULL))
UNION ALL
 SELECT ('production_anomaly:'::text || (romiku_production_orders.id)::text) AS id,
    'production_anomaly'::text AS event_type,
    'romiku_production_orders'::text AS source_table,
    romiku_production_orders.id AS source_id,
    romiku_production_orders.document_number AS title,
    romiku_production_orders.factory_due_at AS due_at,
    romiku_production_orders.owner_id,
    romiku_production_orders.status,
    COALESCE((romiku_production_orders.factory_due_at < now()), false) AS is_overdue
   FROM public.romiku_production_orders
  WHERE ((cardinality(romiku_production_orders.anomaly_flags) > 0) AND (romiku_production_orders.archived_at IS NULL))
UNION ALL
 SELECT ('order_receivable:'::text || (romiku_order_totals.id)::text) AS id,
    'order_receivable'::text AS event_type,
    'romiku_orders'::text AS source_table,
    romiku_order_totals.id AS source_id,
    romiku_order_totals.document_number AS title,
        CASE
            WHEN (romiku_order_totals.deposit_remaining > (0)::numeric) THEN romiku_order_totals.deposit_due_at
            ELSE romiku_order_totals.balance_due_at
        END AS due_at,
    romiku_order_totals.owner_id,
    romiku_order_totals.status,
    COALESCE((
        CASE
            WHEN (romiku_order_totals.deposit_remaining > (0)::numeric) THEN romiku_order_totals.deposit_due_at
            ELSE romiku_order_totals.balance_due_at
        END < now()), false) AS is_overdue
   FROM public.romiku_order_totals
  WHERE ((romiku_order_totals.remaining_amount > (0)::numeric) AND (romiku_order_totals.archived_at IS NULL));


grant delete on table "public"."romiku_customer_contacts" to "authenticated";

grant insert on table "public"."romiku_customer_contacts" to "authenticated";

grant select on table "public"."romiku_customer_contacts" to "authenticated";

grant update on table "public"."romiku_customer_contacts" to "authenticated";

grant delete on table "public"."romiku_customer_contacts" to "service_role";

grant insert on table "public"."romiku_customer_contacts" to "service_role";

grant references on table "public"."romiku_customer_contacts" to "service_role";

grant select on table "public"."romiku_customer_contacts" to "service_role";

grant trigger on table "public"."romiku_customer_contacts" to "service_role";

grant truncate on table "public"."romiku_customer_contacts" to "service_role";

grant update on table "public"."romiku_customer_contacts" to "service_role";

grant delete on table "public"."romiku_formal_customers" to "authenticated";

grant insert on table "public"."romiku_formal_customers" to "authenticated";

grant select on table "public"."romiku_formal_customers" to "authenticated";

grant update on table "public"."romiku_formal_customers" to "authenticated";

grant delete on table "public"."romiku_formal_customers" to "service_role";

grant insert on table "public"."romiku_formal_customers" to "service_role";

grant references on table "public"."romiku_formal_customers" to "service_role";

grant select on table "public"."romiku_formal_customers" to "service_role";

grant trigger on table "public"."romiku_formal_customers" to "service_role";

grant truncate on table "public"."romiku_formal_customers" to "service_role";

grant update on table "public"."romiku_formal_customers" to "service_role";

grant delete on table "public"."romiku_manual_tasks" to "authenticated";

grant insert on table "public"."romiku_manual_tasks" to "authenticated";

grant select on table "public"."romiku_manual_tasks" to "authenticated";

grant update on table "public"."romiku_manual_tasks" to "authenticated";

grant delete on table "public"."romiku_manual_tasks" to "service_role";

grant insert on table "public"."romiku_manual_tasks" to "service_role";

grant references on table "public"."romiku_manual_tasks" to "service_role";

grant select on table "public"."romiku_manual_tasks" to "service_role";

grant trigger on table "public"."romiku_manual_tasks" to "service_role";

grant truncate on table "public"."romiku_manual_tasks" to "service_role";

grant update on table "public"."romiku_manual_tasks" to "service_role";

grant delete on table "public"."romiku_numbering_rules" to "authenticated";

grant insert on table "public"."romiku_numbering_rules" to "authenticated";

grant select on table "public"."romiku_numbering_rules" to "authenticated";

grant update on table "public"."romiku_numbering_rules" to "authenticated";

grant delete on table "public"."romiku_numbering_rules" to "service_role";

grant insert on table "public"."romiku_numbering_rules" to "service_role";

grant references on table "public"."romiku_numbering_rules" to "service_role";

grant select on table "public"."romiku_numbering_rules" to "service_role";

grant trigger on table "public"."romiku_numbering_rules" to "service_role";

grant truncate on table "public"."romiku_numbering_rules" to "service_role";

grant update on table "public"."romiku_numbering_rules" to "service_role";

grant delete on table "public"."romiku_order_items" to "authenticated";

grant insert on table "public"."romiku_order_items" to "authenticated";

grant select on table "public"."romiku_order_items" to "authenticated";

grant update on table "public"."romiku_order_items" to "authenticated";

grant delete on table "public"."romiku_order_items" to "service_role";

grant insert on table "public"."romiku_order_items" to "service_role";

grant references on table "public"."romiku_order_items" to "service_role";

grant select on table "public"."romiku_order_items" to "service_role";

grant trigger on table "public"."romiku_order_items" to "service_role";

grant truncate on table "public"."romiku_order_items" to "service_role";

grant update on table "public"."romiku_order_items" to "service_role";

grant insert on table "public"."romiku_orders" to "authenticated";

grant select on table "public"."romiku_orders" to "authenticated";

grant update on table "public"."romiku_orders" to "authenticated";

grant delete on table "public"."romiku_orders" to "service_role";

grant insert on table "public"."romiku_orders" to "service_role";

grant references on table "public"."romiku_orders" to "service_role";

grant select on table "public"."romiku_orders" to "service_role";

grant trigger on table "public"."romiku_orders" to "service_role";

grant truncate on table "public"."romiku_orders" to "service_role";

grant update on table "public"."romiku_orders" to "service_role";

grant delete on table "public"."romiku_outbound_companies" to "authenticated";

grant insert on table "public"."romiku_outbound_companies" to "authenticated";

grant select on table "public"."romiku_outbound_companies" to "authenticated";

grant update on table "public"."romiku_outbound_companies" to "authenticated";

grant delete on table "public"."romiku_outbound_companies" to "service_role";

grant insert on table "public"."romiku_outbound_companies" to "service_role";

grant references on table "public"."romiku_outbound_companies" to "service_role";

grant select on table "public"."romiku_outbound_companies" to "service_role";

grant trigger on table "public"."romiku_outbound_companies" to "service_role";

grant truncate on table "public"."romiku_outbound_companies" to "service_role";

grant update on table "public"."romiku_outbound_companies" to "service_role";

grant delete on table "public"."romiku_outbound_contacts" to "authenticated";

grant insert on table "public"."romiku_outbound_contacts" to "authenticated";

grant select on table "public"."romiku_outbound_contacts" to "authenticated";

grant update on table "public"."romiku_outbound_contacts" to "authenticated";

grant delete on table "public"."romiku_outbound_contacts" to "service_role";

grant insert on table "public"."romiku_outbound_contacts" to "service_role";

grant references on table "public"."romiku_outbound_contacts" to "service_role";

grant select on table "public"."romiku_outbound_contacts" to "service_role";

grant trigger on table "public"."romiku_outbound_contacts" to "service_role";

grant truncate on table "public"."romiku_outbound_contacts" to "service_role";

grant update on table "public"."romiku_outbound_contacts" to "service_role";

grant delete on table "public"."romiku_outbound_followups" to "authenticated";

grant insert on table "public"."romiku_outbound_followups" to "authenticated";

grant select on table "public"."romiku_outbound_followups" to "authenticated";

grant update on table "public"."romiku_outbound_followups" to "authenticated";

grant delete on table "public"."romiku_outbound_followups" to "service_role";

grant insert on table "public"."romiku_outbound_followups" to "service_role";

grant references on table "public"."romiku_outbound_followups" to "service_role";

grant select on table "public"."romiku_outbound_followups" to "service_role";

grant trigger on table "public"."romiku_outbound_followups" to "service_role";

grant truncate on table "public"."romiku_outbound_followups" to "service_role";

grant update on table "public"."romiku_outbound_followups" to "service_role";

grant delete on table "public"."romiku_packing_items" to "authenticated";

grant insert on table "public"."romiku_packing_items" to "authenticated";

grant select on table "public"."romiku_packing_items" to "authenticated";

grant update on table "public"."romiku_packing_items" to "authenticated";

grant delete on table "public"."romiku_packing_items" to "service_role";

grant insert on table "public"."romiku_packing_items" to "service_role";

grant references on table "public"."romiku_packing_items" to "service_role";

grant select on table "public"."romiku_packing_items" to "service_role";

grant trigger on table "public"."romiku_packing_items" to "service_role";

grant truncate on table "public"."romiku_packing_items" to "service_role";

grant update on table "public"."romiku_packing_items" to "service_role";

grant insert on table "public"."romiku_packing_lists" to "authenticated";

grant select on table "public"."romiku_packing_lists" to "authenticated";

grant update on table "public"."romiku_packing_lists" to "authenticated";

grant delete on table "public"."romiku_packing_lists" to "service_role";

grant insert on table "public"."romiku_packing_lists" to "service_role";

grant references on table "public"."romiku_packing_lists" to "service_role";

grant select on table "public"."romiku_packing_lists" to "service_role";

grant trigger on table "public"."romiku_packing_lists" to "service_role";

grant truncate on table "public"."romiku_packing_lists" to "service_role";

grant update on table "public"."romiku_packing_lists" to "service_role";

grant delete on table "public"."romiku_payments" to "authenticated";

grant insert on table "public"."romiku_payments" to "authenticated";

grant select on table "public"."romiku_payments" to "authenticated";

grant update on table "public"."romiku_payments" to "authenticated";

grant delete on table "public"."romiku_payments" to "service_role";

grant insert on table "public"."romiku_payments" to "service_role";

grant references on table "public"."romiku_payments" to "service_role";

grant select on table "public"."romiku_payments" to "service_role";

grant trigger on table "public"."romiku_payments" to "service_role";

grant truncate on table "public"."romiku_payments" to "service_role";

grant update on table "public"."romiku_payments" to "service_role";

grant delete on table "public"."romiku_pi_items" to "authenticated";

grant insert on table "public"."romiku_pi_items" to "authenticated";

grant select on table "public"."romiku_pi_items" to "authenticated";

grant update on table "public"."romiku_pi_items" to "authenticated";

grant delete on table "public"."romiku_pi_items" to "service_role";

grant insert on table "public"."romiku_pi_items" to "service_role";

grant references on table "public"."romiku_pi_items" to "service_role";

grant select on table "public"."romiku_pi_items" to "service_role";

grant trigger on table "public"."romiku_pi_items" to "service_role";

grant truncate on table "public"."romiku_pi_items" to "service_role";

grant update on table "public"."romiku_pi_items" to "service_role";

grant insert on table "public"."romiku_pis" to "authenticated";

grant select on table "public"."romiku_pis" to "authenticated";

grant update on table "public"."romiku_pis" to "authenticated";

grant delete on table "public"."romiku_pis" to "service_role";

grant insert on table "public"."romiku_pis" to "service_role";

grant references on table "public"."romiku_pis" to "service_role";

grant select on table "public"."romiku_pis" to "service_role";

grant trigger on table "public"."romiku_pis" to "service_role";

grant truncate on table "public"."romiku_pis" to "service_role";

grant update on table "public"."romiku_pis" to "service_role";

grant insert on table "public"."romiku_procurement_cost_history" to "authenticated";

grant select on table "public"."romiku_procurement_cost_history" to "authenticated";

grant delete on table "public"."romiku_procurement_cost_history" to "service_role";

grant insert on table "public"."romiku_procurement_cost_history" to "service_role";

grant references on table "public"."romiku_procurement_cost_history" to "service_role";

grant select on table "public"."romiku_procurement_cost_history" to "service_role";

grant trigger on table "public"."romiku_procurement_cost_history" to "service_role";

grant truncate on table "public"."romiku_procurement_cost_history" to "service_role";

grant update on table "public"."romiku_procurement_cost_history" to "service_role";

grant delete on table "public"."romiku_product_extensions" to "authenticated";

grant insert on table "public"."romiku_product_extensions" to "authenticated";

grant select on table "public"."romiku_product_extensions" to "authenticated";

grant update on table "public"."romiku_product_extensions" to "authenticated";

grant delete on table "public"."romiku_product_extensions" to "service_role";

grant insert on table "public"."romiku_product_extensions" to "service_role";

grant references on table "public"."romiku_product_extensions" to "service_role";

grant select on table "public"."romiku_product_extensions" to "service_role";

grant trigger on table "public"."romiku_product_extensions" to "service_role";

grant truncate on table "public"."romiku_product_extensions" to "service_role";

grant update on table "public"."romiku_product_extensions" to "service_role";

grant delete on table "public"."romiku_product_suppliers" to "authenticated";

grant insert on table "public"."romiku_product_suppliers" to "authenticated";

grant select on table "public"."romiku_product_suppliers" to "authenticated";

grant update on table "public"."romiku_product_suppliers" to "authenticated";

grant delete on table "public"."romiku_product_suppliers" to "service_role";

grant insert on table "public"."romiku_product_suppliers" to "service_role";

grant references on table "public"."romiku_product_suppliers" to "service_role";

grant select on table "public"."romiku_product_suppliers" to "service_role";

grant trigger on table "public"."romiku_product_suppliers" to "service_role";

grant truncate on table "public"."romiku_product_suppliers" to "service_role";

grant update on table "public"."romiku_product_suppliers" to "service_role";

grant delete on table "public"."romiku_production_followups" to "authenticated";

grant insert on table "public"."romiku_production_followups" to "authenticated";

grant select on table "public"."romiku_production_followups" to "authenticated";

grant update on table "public"."romiku_production_followups" to "authenticated";

grant delete on table "public"."romiku_production_followups" to "service_role";

grant insert on table "public"."romiku_production_followups" to "service_role";

grant references on table "public"."romiku_production_followups" to "service_role";

grant select on table "public"."romiku_production_followups" to "service_role";

grant trigger on table "public"."romiku_production_followups" to "service_role";

grant truncate on table "public"."romiku_production_followups" to "service_role";

grant update on table "public"."romiku_production_followups" to "service_role";

grant delete on table "public"."romiku_production_items" to "authenticated";

grant insert on table "public"."romiku_production_items" to "authenticated";

grant select on table "public"."romiku_production_items" to "authenticated";

grant update on table "public"."romiku_production_items" to "authenticated";

grant delete on table "public"."romiku_production_items" to "service_role";

grant insert on table "public"."romiku_production_items" to "service_role";

grant references on table "public"."romiku_production_items" to "service_role";

grant select on table "public"."romiku_production_items" to "service_role";

grant trigger on table "public"."romiku_production_items" to "service_role";

grant truncate on table "public"."romiku_production_items" to "service_role";

grant update on table "public"."romiku_production_items" to "service_role";

grant insert on table "public"."romiku_production_orders" to "authenticated";

grant select on table "public"."romiku_production_orders" to "authenticated";

grant update on table "public"."romiku_production_orders" to "authenticated";

grant delete on table "public"."romiku_production_orders" to "service_role";

grant insert on table "public"."romiku_production_orders" to "service_role";

grant references on table "public"."romiku_production_orders" to "service_role";

grant select on table "public"."romiku_production_orders" to "service_role";

grant trigger on table "public"."romiku_production_orders" to "service_role";

grant truncate on table "public"."romiku_production_orders" to "service_role";

grant update on table "public"."romiku_production_orders" to "service_role";

grant delete on table "public"."romiku_quote_items" to "authenticated";

grant insert on table "public"."romiku_quote_items" to "authenticated";

grant select on table "public"."romiku_quote_items" to "authenticated";

grant update on table "public"."romiku_quote_items" to "authenticated";

grant delete on table "public"."romiku_quote_items" to "service_role";

grant insert on table "public"."romiku_quote_items" to "service_role";

grant references on table "public"."romiku_quote_items" to "service_role";

grant select on table "public"."romiku_quote_items" to "service_role";

grant trigger on table "public"."romiku_quote_items" to "service_role";

grant truncate on table "public"."romiku_quote_items" to "service_role";

grant update on table "public"."romiku_quote_items" to "service_role";

grant insert on table "public"."romiku_quote_versions" to "authenticated";

grant select on table "public"."romiku_quote_versions" to "authenticated";

grant delete on table "public"."romiku_quote_versions" to "service_role";

grant insert on table "public"."romiku_quote_versions" to "service_role";

grant references on table "public"."romiku_quote_versions" to "service_role";

grant select on table "public"."romiku_quote_versions" to "service_role";

grant trigger on table "public"."romiku_quote_versions" to "service_role";

grant truncate on table "public"."romiku_quote_versions" to "service_role";

grant update on table "public"."romiku_quote_versions" to "service_role";

grant insert on table "public"."romiku_quotes" to "authenticated";

grant select on table "public"."romiku_quotes" to "authenticated";

grant update on table "public"."romiku_quotes" to "authenticated";

grant delete on table "public"."romiku_quotes" to "service_role";

grant insert on table "public"."romiku_quotes" to "service_role";

grant references on table "public"."romiku_quotes" to "service_role";

grant select on table "public"."romiku_quotes" to "service_role";

grant trigger on table "public"."romiku_quotes" to "service_role";

grant truncate on table "public"."romiku_quotes" to "service_role";

grant update on table "public"."romiku_quotes" to "service_role";

grant delete on table "public"."romiku_source_urls" to "authenticated";

grant insert on table "public"."romiku_source_urls" to "authenticated";

grant select on table "public"."romiku_source_urls" to "authenticated";

grant update on table "public"."romiku_source_urls" to "authenticated";

grant delete on table "public"."romiku_source_urls" to "service_role";

grant insert on table "public"."romiku_source_urls" to "service_role";

grant references on table "public"."romiku_source_urls" to "service_role";

grant select on table "public"."romiku_source_urls" to "service_role";

grant trigger on table "public"."romiku_source_urls" to "service_role";

grant truncate on table "public"."romiku_source_urls" to "service_role";

grant update on table "public"."romiku_source_urls" to "service_role";

grant delete on table "public"."romiku_supplier_contacts" to "authenticated";

grant insert on table "public"."romiku_supplier_contacts" to "authenticated";

grant select on table "public"."romiku_supplier_contacts" to "authenticated";

grant update on table "public"."romiku_supplier_contacts" to "authenticated";

grant delete on table "public"."romiku_supplier_contacts" to "service_role";

grant insert on table "public"."romiku_supplier_contacts" to "service_role";

grant references on table "public"."romiku_supplier_contacts" to "service_role";

grant select on table "public"."romiku_supplier_contacts" to "service_role";

grant trigger on table "public"."romiku_supplier_contacts" to "service_role";

grant truncate on table "public"."romiku_supplier_contacts" to "service_role";

grant update on table "public"."romiku_supplier_contacts" to "service_role";

grant delete on table "public"."romiku_suppliers" to "authenticated";

grant insert on table "public"."romiku_suppliers" to "authenticated";

grant select on table "public"."romiku_suppliers" to "authenticated";

grant update on table "public"."romiku_suppliers" to "authenticated";

grant delete on table "public"."romiku_suppliers" to "service_role";

grant insert on table "public"."romiku_suppliers" to "service_role";

grant references on table "public"."romiku_suppliers" to "service_role";

grant select on table "public"."romiku_suppliers" to "service_role";

grant trigger on table "public"."romiku_suppliers" to "service_role";

grant truncate on table "public"."romiku_suppliers" to "service_role";

grant update on table "public"."romiku_suppliers" to "service_role";

grant insert on table "public"."romiku_website_inquiries" to "authenticated";

grant select on table "public"."romiku_website_inquiries" to "authenticated";

grant update on table "public"."romiku_website_inquiries" to "authenticated";

grant delete on table "public"."romiku_website_inquiries" to "service_role";

grant insert on table "public"."romiku_website_inquiries" to "service_role";

grant references on table "public"."romiku_website_inquiries" to "service_role";

grant select on table "public"."romiku_website_inquiries" to "service_role";

grant trigger on table "public"."romiku_website_inquiries" to "service_role";

grant truncate on table "public"."romiku_website_inquiries" to "service_role";

grant update on table "public"."romiku_website_inquiries" to "service_role";

grant delete on table "public"."romiku_website_inquiry_followups" to "authenticated";

grant insert on table "public"."romiku_website_inquiry_followups" to "authenticated";

grant select on table "public"."romiku_website_inquiry_followups" to "authenticated";

grant update on table "public"."romiku_website_inquiry_followups" to "authenticated";

grant delete on table "public"."romiku_website_inquiry_followups" to "service_role";

grant insert on table "public"."romiku_website_inquiry_followups" to "service_role";

grant references on table "public"."romiku_website_inquiry_followups" to "service_role";

grant select on table "public"."romiku_website_inquiry_followups" to "service_role";

grant trigger on table "public"."romiku_website_inquiry_followups" to "service_role";

grant truncate on table "public"."romiku_website_inquiry_followups" to "service_role";

grant update on table "public"."romiku_website_inquiry_followups" to "service_role";

grant insert on table "public"."romiku_website_inquiry_items" to "authenticated";

grant select on table "public"."romiku_website_inquiry_items" to "authenticated";

grant update on table "public"."romiku_website_inquiry_items" to "authenticated";

grant delete on table "public"."romiku_website_inquiry_items" to "service_role";

grant insert on table "public"."romiku_website_inquiry_items" to "service_role";

grant references on table "public"."romiku_website_inquiry_items" to "service_role";

grant select on table "public"."romiku_website_inquiry_items" to "service_role";

grant trigger on table "public"."romiku_website_inquiry_items" to "service_role";

grant truncate on table "public"."romiku_website_inquiry_items" to "service_role";

grant update on table "public"."romiku_website_inquiry_items" to "service_role";


  create policy "romiku_delete"
  on "public"."romiku_customer_contacts"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_customer_contacts"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_customer_contacts"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_customer_contacts"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_formal_customers"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_formal_customers"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_formal_customers"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_formal_customers"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_manual_tasks"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_manual_tasks"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_manual_tasks"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_manual_tasks"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_admin_write"
  on "public"."romiku_numbering_rules"
  as permissive
  for all
  to authenticated
using (public.is_admin())
with check (public.is_admin());



  create policy "romiku_read"
  on "public"."romiku_numbering_rules"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_delete"
  on "public"."romiku_order_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_order_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_order_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_order_items"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_insert"
  on "public"."romiku_orders"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_orders"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_orders"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_outbound_companies"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_outbound_companies"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_outbound_companies"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_outbound_companies"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_outbound_contacts"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_outbound_contacts"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_outbound_contacts"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_outbound_contacts"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_outbound_followups"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_outbound_followups"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_outbound_followups"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_outbound_followups"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_packing_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_packing_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_packing_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_packing_items"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_insert"
  on "public"."romiku_packing_lists"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_packing_lists"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_packing_lists"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_payments"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_payments"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_payments"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_payments"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_pi_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_pi_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_pi_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_pi_items"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_insert"
  on "public"."romiku_pis"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_pis"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_pis"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_insert"
  on "public"."romiku_procurement_cost_history"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_procurement_cost_history"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_delete"
  on "public"."romiku_product_extensions"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_product_extensions"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_product_extensions"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_product_extensions"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_product_suppliers"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_product_suppliers"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_product_suppliers"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_product_suppliers"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_production_followups"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_production_followups"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_production_followups"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_production_followups"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_production_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_production_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_production_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_production_items"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_insert"
  on "public"."romiku_production_orders"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_production_orders"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_production_orders"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_quote_items"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_quote_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_quote_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_quote_items"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_insert"
  on "public"."romiku_quote_versions"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_quote_versions"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_quotes"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_quotes"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_quotes"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_source_urls"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_source_urls"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_source_urls"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_source_urls"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_supplier_contacts"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_supplier_contacts"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_supplier_contacts"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_supplier_contacts"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_suppliers"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_suppliers"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_suppliers"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_suppliers"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_insert"
  on "public"."romiku_website_inquiries"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_website_inquiries"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_website_inquiries"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_delete"
  on "public"."romiku_website_inquiry_followups"
  as permissive
  for delete
  to authenticated
using (true);



  create policy "romiku_insert"
  on "public"."romiku_website_inquiry_followups"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_website_inquiry_followups"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_website_inquiry_followups"
  as permissive
  for update
  to authenticated
using (true)
with check (true);



  create policy "romiku_insert"
  on "public"."romiku_website_inquiry_items"
  as permissive
  for insert
  to authenticated
with check (true);



  create policy "romiku_read"
  on "public"."romiku_website_inquiry_items"
  as permissive
  for select
  to authenticated
using (true);



  create policy "romiku_update"
  on "public"."romiku_website_inquiry_items"
  as permissive
  for update
  to authenticated
using (true)
with check (true);


CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_customer_contacts FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_formal_customers FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_manual_tasks FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_numbering_rules FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_order_items FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_order_quantity BEFORE UPDATE OF quantity ON public.romiku_order_items FOR EACH ROW EXECUTE FUNCTION public.romiku_check_order_quantity();

CREATE TRIGGER romiku_parent_lock BEFORE INSERT OR DELETE OR UPDATE ON public.romiku_order_items FOR EACH ROW EXECUTE FUNCTION public.romiku_lock_document_parent('romiku_orders', 'order_id');

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_orders FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_number BEFORE INSERT OR UPDATE ON public.romiku_orders FOR EACH ROW EXECUTE FUNCTION public.romiku_assign_number('order', 'SO');

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_outbound_companies FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_outbound_contacts FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_outbound_followups FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_packing_items FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_packing_quantity BEFORE INSERT OR UPDATE ON public.romiku_packing_items FOR EACH ROW EXECUTE FUNCTION public.romiku_check_packing_quantity();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_packing_lists FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_number BEFORE INSERT OR UPDATE ON public.romiku_packing_lists FOR EACH ROW EXECUTE FUNCTION public.romiku_assign_number('packing', 'PL');

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_payments FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_pi_items FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_parent_lock BEFORE INSERT OR DELETE OR UPDATE ON public.romiku_pi_items FOR EACH ROW EXECUTE FUNCTION public.romiku_lock_document_parent('romiku_pis', 'pi_id');

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_pis FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_number BEFORE INSERT OR UPDATE ON public.romiku_pis FOR EACH ROW EXECUTE FUNCTION public.romiku_assign_number('pi', 'PI');

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_procurement_cost_history FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_history BEFORE DELETE OR UPDATE ON public.romiku_procurement_cost_history FOR EACH ROW EXECUTE FUNCTION public.romiku_preserve_history();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_product_extensions FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_product_suppliers FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_production_followups FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_production_items FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_production_orders FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_number BEFORE INSERT OR UPDATE ON public.romiku_production_orders FOR EACH ROW EXECUTE FUNCTION public.romiku_assign_number('production', 'PO');

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_quote_items FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_parent_lock BEFORE INSERT OR DELETE OR UPDATE ON public.romiku_quote_items FOR EACH ROW EXECUTE FUNCTION public.romiku_lock_document_parent('romiku_quotes', 'quote_id');

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_quote_versions FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_history BEFORE DELETE OR UPDATE ON public.romiku_quote_versions FOR EACH ROW EXECUTE FUNCTION public.romiku_preserve_history();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_quotes FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_number BEFORE INSERT OR UPDATE ON public.romiku_quotes FOR EACH ROW EXECUTE FUNCTION public.romiku_assign_number('quote', 'Q');

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_source_urls FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_supplier_contacts FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_suppliers FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_website_inquiries FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_number BEFORE INSERT OR UPDATE ON public.romiku_website_inquiries FOR EACH ROW EXECUTE FUNCTION public.romiku_assign_number('inquiry', 'WI');

CREATE TRIGGER romiku_original BEFORE DELETE OR UPDATE ON public.romiku_website_inquiries FOR EACH ROW EXECUTE FUNCTION public.romiku_preserve_inquiry();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_website_inquiry_followups FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_audit BEFORE INSERT OR UPDATE ON public.romiku_website_inquiry_items FOR EACH ROW EXECUTE FUNCTION public.romiku_audit();

CREATE TRIGGER romiku_original BEFORE DELETE OR UPDATE ON public.romiku_website_inquiry_items FOR EACH ROW EXECUTE FUNCTION public.romiku_preserve_inquiry();

CREATE TRIGGER romiku_parent_lock BEFORE INSERT OR DELETE OR UPDATE ON public.romiku_website_inquiry_items FOR EACH ROW EXECUTE FUNCTION public.romiku_lock_document_parent('romiku_website_inquiries', 'inquiry_id');

-- migra omits view reloptions and revokes inherited through default privileges.
-- Preserve 03_views.sql and 06_grants.sql exactly when replaying on Supabase.
alter view public.romiku_quote_totals set (security_invoker = true);
alter view public.romiku_pi_totals set (security_invoker = true);
alter view public.romiku_order_totals set (security_invoker = true);
alter view public.romiku_order_item_remaining set (security_invoker = true);
alter view public.romiku_packing_totals set (security_invoker = true);
alter view public.romiku_outbound_summary set (security_invoker = true);
alter view public.romiku_current_reference_cost set (security_invoker = true);
alter view public.romiku_calendar set (security_invoker = true);
alter view public.romiku_workbench set (security_invoker = true);
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
