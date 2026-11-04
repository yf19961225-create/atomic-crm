-- ROMIKU 工作台结构设计审核附件，2026-11-03。
-- 不是发布 migration；未执行、未经过数据库测试。
-- 明确阻止误执行。批准实施后另行生成完整 migration，不删除此保护运行本文件。
DO $$ BEGIN
  RAISE EXCEPTION 'DESIGN_ONLY_NOT_AUTHORIZED_FOR_EXECUTION';
END $$;

-- M1: 以下为字段/约束/索引设计；策略和函数体由后续实施补齐并审核。
CREATE TABLE public.romiku_workbench_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('order','production')),
  entity_id uuid NOT NULL,
  action text NOT NULL,
  actor_id uuid,
  actor_source text NOT NULL CHECK (actor_source IN ('user','system')),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  request_id uuid NOT NULL UNIQUE,
  request_hash text NOT NULL CHECK (length(request_hash)=64),
  before_state jsonb NOT NULL CHECK (jsonb_typeof(before_state)='object'),
  after_state jsonb NOT NULL CHECK (jsonb_typeof(after_state)='object'),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence)='object'),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 2000),
  reverses_event_id uuid REFERENCES public.romiku_workbench_events(id) ON DELETE RESTRICT,
  result jsonb NOT NULL CHECK (jsonb_typeof(result)='object'),
  CHECK (actor_source <> 'user' OR actor_id IS NOT NULL)
);
CREATE INDEX romiku_wb_events_entity_time ON public.romiku_workbench_events(entity_type,entity_id,occurred_at DESC,id);

CREATE TABLE public.romiku_order_collection_state (
  order_id uuid PRIMARY KEY REFERENCES public.romiku_orders(id) ON DELETE CASCADE,
  customer_confirmation text NOT NULL DEFAULT 'unknown'
    CHECK (customer_confirmation IN ('unknown','unconfirmed','confirmed')),
  deposit_override text NOT NULL DEFAULT 'none'
    CHECK (deposit_override IN ('none','accepted','invalidated','revoked')),
  deposit_event_id uuid REFERENCES public.romiku_workbench_events(id) ON DELETE RESTRICT,
  needs_follow_up boolean NOT NULL DEFAULT false,
  next_follow_up_on date,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid,
  CHECK (deposit_override = 'none' OR deposit_event_id IS NOT NULL),
  CHECK (deposit_override <> 'accepted' OR customer_confirmation = 'confirmed')
);
CREATE INDEX romiku_wb_collection_follow_up ON public.romiku_order_collection_state(next_follow_up_on,order_id);

CREATE TABLE public.romiku_production_due_state (
  production_order_id uuid PRIMARY KEY REFERENCES public.romiku_production_orders(id) ON DELETE CASCADE,
  due_classification text NOT NULL
    CHECK (due_classification IN ('unclassified','needs_confirmation','confirmed','not_required')),
  needs_follow_up boolean NOT NULL DEFAULT false,
  next_follow_up_on date,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_by uuid
);
CREATE INDEX romiku_wb_due_classification ON public.romiku_production_due_state(due_classification,production_order_id);

CREATE TABLE public.romiku_deposit_evidence (
  event_id uuid NOT NULL REFERENCES public.romiku_workbench_events(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  PRIMARY KEY(event_id,payment_id)
);
CREATE INDEX romiku_wb_evidence_payment ON public.romiku_deposit_evidence(payment_id,event_id);

ALTER TABLE public.romiku_order_collection_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.romiku_order_collection_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.romiku_production_due_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.romiku_production_due_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.romiku_workbench_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.romiku_workbench_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.romiku_deposit_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.romiku_deposit_evidence FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.romiku_order_collection_state, public.romiku_production_due_state,
  public.romiku_workbench_events, public.romiku_deposit_evidence FROM PUBLIC, anon, authenticated;
-- 没有策略/授权时保持拒绝访问；不能把本附件当成已经完成权限实现。
-- 后续完整M1需：执行角色、当前业务许可谓词、SELECT策略、固定内部审计函数。
-- 后续M2需：正式设计第8节各RPC、版本/幂等/证据校验、失效触发器、删除审计衔接。
-- RPC必须拥有对应权限与安全测试后才GRANT EXECUTE给authenticated。
-- 禁止历史UPDATE/INSERT SELECT回填；禁止替换编号/转换/收付款金额函数。
