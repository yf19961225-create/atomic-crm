# ROMIKU CRM 五项统一优化设计（已批准）

## 基线与范围

2026-10-26 已实际读取 Production `/version.json` 与 HTML `crm-build`，均为
`036594bac9a8f54746339c418832bffefe98ca8c`。

独立分支：`codex/five-feature-workflow-optimization`。该分支从上述精确 SHA 创建。
五项功能统一开发、统一测试，最终在同一候选 SHA、同一 Preview deployment 验收。
本文件是实施前设计；尚未修改业务代码、安装依赖、执行 migration 或发布。

只允许 Preview Supabase `ciwaibtotispazfviims` 的明确标记测试数据。
Production 数据、环境变量、migration、部署均不在本轮授权内。
Sanity 始终只读，历史记录、采购成本历史、产品快照及 XLSX 模板不改写。

## 实施方式比较

### 推荐：共享前端组件 + 新增只读生产聚合 RPC

连续录入、搜索、日期选择通过现有共享层改造。生产列表新增一个参数受限、
只读、SECURITY INVOKER 的 RPC，按订单聚合后筛选和分页，保留现有 RLS。
原生产单创建、保存、状态、导出和工作台继续复用现有链路。

预期需要一份 Preview-only additive migration，新增只读函数及其执行权限。
没有新业务表、新状态字段、数据回填、历史数据 UPDATE 或 DELETE。

### 可行替代：聚合 view + PostgREST 查询

同样可保证母单分页，但跨订单、生产单与供应商的搜索及筛选统计需要更复杂的
查询组合。RPC 可以把视图分类、父级计数、搜索命中及有界分页作为一个清晰契约，
所以推荐 RPC。

只取当前 25 张生产子单后前端分组不满足跨页完整性，排除。
无限全量读取生产单或 Sanity 产品也不采用。

用户于 2026-10-26 批准推荐方案，并授权直接实施及 Preview 验收。

## 1. Enter 连续录入

现状：`CommercialLineItemsTable.advanceRow` 只尝试聚焦下一真实行或
`draftSkuRefs[0]`，并不保证后者存在。`advanceDraft` 依赖数组索引及 setTimeout，
产品选择移除占位草稿后容易出现不存在的焦点目标。Quote 最后 CBM 输入还没有
对应 Enter 前进处理。

方案：

- 按当前视觉顺序确定下一行，包含真实行和草稿；使用稳定行 ID 定位焦点。
- Quote 的最后主表可编辑字段是 CBM；PI/Order 是单价。
- 在这些字段按 Enter：先保留本字段价格/规格草稿，再聚焦下一行 SKU；无下一行
  才追加一个空草稿，状态提交后再聚焦。
- 空行只保存在客户端草稿状态，未选产品/未输入有效 SKU 时不进入保存 payload。
- IME composing、keyCode 229 和重复按键不产生额外行，也不提交表单。
- SKU 输入框自身的 Enter 继续负责搜索和产品选择，不触发行前进。
- 保留新增按钮、拖拽视觉顺序、复制价格、单价 entered 标记、精度与汇率逻辑。
- 测试顺序输入 5、10、20 行，已有下一真实行、已有下一空行、无下一行、连续重复
  Enter、异步选取与中文输入法，以及取消/保存后的 dirty 生命周期。

## 2. SKU 连接符无关搜索

现状：API 和 `sanityCatalogSource` 各有一份 GROQ 查询，`sku match '*输入*'`
没有统一处理真实 SKU 与输入的连接符，当前游标只包含原始 SKU 和 ID。

方案：

- 把查询构建与参数校验集中在可由 API 和测试复用的共享模块。
- 输入和 Sanity 中的真实 SKU 同时进行大小写、空格、横杠、下划线等明确连接符
  规范化；不修改 Sanity 数据或原始 SKU。
- 通过 GROQ `lower`、`string::split`、`array::join` 在上游查询端完成 SKU 归一化。
  不把全量产品下载到浏览器或每次在服务器无限取数。
- 排序为原始精确匹配、规范化精确匹配、规范化前缀、规范化部分匹配，之后为名称
  匹配；同级按原始 SKU/ID 稳定排序。
- 中英西名称及现有分类检索保留。仅显式 Enter/搜索按钮提交查询。
- 单页仍是 50 个产品，最多取 51 个判断下一页。新游标包含搜索排名与 SKU/ID，
  参数与查询绑定，避免排名排序后漏项或重复页。
- 原始 SKU 显示和图片精确同 SKU 匹配互不混用：模糊检索不允许图片借用相似 SKU。
- 用真实只读 Sanity 查询验证 XSUV-704 系列输入及 SUNSF20MAXR，并记录响应耗时、
  返回规模和翻页正确性；实际不存在的 SKU 不伪称找到。

## 3. 订单母单与生产子单

现状：`FulfillmentList` 对 `romiku_production_orders` 每页取 25 条，然后批量取
关联订单。`order_id` 已为非空 FK，现有 order_id B-tree 与业务搜索索引可复用。

新增 RPC 建议名：`romiku_list_production_order_groups`。
参数为固定视图枚举、搜索词、可选订单 UUID、受限页码与页大小；拒绝非法参数。
普通 authenticated 调用，SECURITY INVOKER、空 search_path，继续尊重现有 RLS。
不接受任意 SQL/表名，不授予业务写权限。

RPC 在所有可见子单上聚合并输出母单页、准确母单总数、有效/已收货/取消数量、
最晚非空工厂交期和搜索命中子单 ID。空结果仍返回 total=0；页大小有上限。
搜索可命中订单编号、客户快照名称、生产单编号和当前供应商名称/保存的供应商快照。
母单命中后展开显示它的完整可见历史，不只显示命中的子单。

分类严格使用已有状态：

- 进行中：存在 pending_send 或 scheduled。
- 已收货：无上述进行中子单，且至少一张 received。
- 已取消：存在子单且全部 cancelled。
- 全部：所有有生产单的可见订单。

进度分母不含 cancelled。4 received + 1 cancelled 显示 `4/4 已收货 · 1 已取消`。
遇到现有四种状态之外的值，报告数据冲突，不把它悄悄归为已结束。
工厂交期使用既有工厂日期显示函数；无日期显示破折号。

母单页大小默认 25。桌面可展开表格，手机可展开紧凑卡片。展开子单按父 ID
有界分页读取（例如每批 100 + 显式加载更多），不会在第一层截断某个订单。
默认收起；搜索匹配子单时可自动展开命中父组，保留命中标识。
分页、分类或搜索变化清除子单选择；批量动作只接收显式选中的子单 UUID。

`/production?order=<id>` 默认使用全部视图并定位该订单，以便从 Order 查看完整历史。
修改子单状态后使聚合、子单与现有工作台 query cache 失效并重新读取。
不自动改 Order 状态，不修改任何子单业务内容来配合列表分类。
现有归档可见性必须沿用既有读取/权限约定，不通过归档制造数据消失。

## 4. 日期覆盖清单与统一组件

下面是从精确基线 schema 与当前编辑界面交叉检查的存储字段清单。
未暴露为独立编辑字段或由跟进记录派生的字段，不因本轮而新增编辑入口。

| 数据表/模块 | 字段 | 数据库存储类型 | 当前语义与处理 |
|---|---|---|---|
| romiku_quotes | document_date | date | 日历日期，必填 |
| romiku_quotes | valid_until | date | 日历日期，可清空 |
| romiku_quotes | due_at | timestamptz | 计划收款时间，保留时间与时区 |
| romiku_quotes | follow_up_at, deposit_due_at, balance_due_at | timestamptz | schema 存在；当前未发现独立编辑入口，不新增入口 |
| romiku_pis | document_date | date | 日历日期，必填 |
| romiku_pis | due_at, deposit_due_at, balance_due_at | timestamptz | 计划/定金/尾款时间，可清空 |
| romiku_pis | follow_up_at | timestamptz | schema 存在；当前未发现独立编辑入口，不新增入口 |
| romiku_orders | document_date | date | 日历日期，必填 |
| romiku_orders | due_at, deposit_due_at, balance_due_at | timestamptz | 收款时间，可清空 |
| romiku_orders | expected_delivery_at, actual_delivery_at | timestamptz | 预计/实际交付时间，不截断为日期 |
| romiku_orders | follow_up_at | timestamptz | schema 存在；当前未发现独立编辑入口，不新增入口 |
| romiku_outbound_followups | contacted_at, next_follow_up_at | timestamptz | 联系与下次跟进时间 |
| romiku_website_inquiry_followups | contacted_at, next_follow_up_at | timestamptz | 网站询盘联系与下次跟进时间 |
| romiku_production_followups | contacted_at, next_follow_up_at | timestamptz | 生产联系与下次跟进时间 |
| romiku_outbound_companies | next_follow_up_at | timestamptz | 跟进记录派生摘要，不新增独立编辑入口 |
| romiku_website_inquiries | next_follow_up_at | timestamptz | 跟进记录派生摘要，不新增独立编辑入口 |
| romiku_production_orders | factory_due_at | timestamptz | 特例：日历日期；沿用 Asia/Shanghai 当日 23:59:59.999 的既有转换 |
| romiku_packing_lists | packing_at | timestamptz | 装箱时间；现有 NOT NULL 保持必填 |
| romiku_payments | received_at | timestamptz | 实际收款时间，现有必填规则保持 |
| romiku_manual_tasks | due_at | timestamptz | 工作日历/手动任务截止时间，可清空 |
| romiku_product_suppliers | reference_date | date | 采购参考日，可清空 |
| romiku_procurement_cost_history | effective_date | date | 成本生效日，现有必填规则保持；不编辑既有 append-only 历史 |

正式客户没有独立跟进日期字段；其来源跟进仍通过上列共用跟进组件覆盖。
当前 Packing 没有独立可编辑的发货日期字段，本轮不凭空新增数据库字段。
系统 created_at/updated_at、派生状态时间和自动生成 completed_at 不变成日期输入框。

建议新增受控的统一 RomikuDatePicker/RomikuDateTimePicker，复用已有 Popover/Button
等 UI 基础组件。日历支持月份/年份、今天、原日期定位、可选清空、键盘和手机操作。
实施者可选择经测试的日历实现方式；不改通用 admin DateInput 的全项目语义。

- DATE 控件只输出 YYYY-MM-DD/null，禁止经过浏览器时区 Date 的 UTC 截断处理。
- 一般 timestamptz 控件显示既有浏览器本地时间并明确时区，选择日期后仍可选择时分。
  保存为对应 UTC instant；未修改时保留原始值、秒与毫秒，不因打开/关闭控件改变。
- DST 不存在或有歧义的本地时间须明确处理：不存在时间拒绝；重复时间保留原 instant
  或要求显式选择 offset，不能静默切换。
- 工厂交期只换控件，继续调用 productionDueDateInput/Payload；不改变其上海日期语义。
- 日期变化接入现有 dirty/取消/保存生命周期，不自动默认今天；已有业务创建默认值保留。
- 适配 DocumentHeaderSummary、WorkflowFields、ManualTasks、ProductionWorkbench、
  Supplier/Cost 的 react-admin useInput 入口与 SanityProductDrawer 成本新增入口。
- 只更换现有业务日期输入，日历展示和只读时间无需改写。最终提供逐字段验收覆盖表。

## 5. Order 编号与 XLSX

审计现状：documentHeaderWrite 复用 quoteHeaderWrite，后者已包含 document_number。
Order 导出模型读取 record.document_number，渲染 J1 为编号 + 原日期，文件名也使用
model.documentNumber。当前静态代码尚不能证明问题来自哪一层。

先在专用 Preview QA 订单验证改名、保存、刷新、重新打开、下载实际 XLSX、读取
J1 与下载文件名，并比对关联 UUID、生产/装箱/收款关系。重复编号应由已有唯一约束拒绝。
若现有实现全部正常，只补必要回归测试和真实证据；不无故修改保存/导出代码。
如复现 stale record，只修对应保存后的重新读取/状态同步，不能改模板掩盖问题。
Quote/PI 相同编号流程回归。PDF 继续暂停，客户货号 ITEM.NO 规则保持。

## Preview migration 边界

预期仅生产母单查询需要一份 migration：新增只读聚合 RPC（名字/参数在实现计划固定）。
现有 order_id 与业务搜索索引优先复用；如 EXPLAIN 证明确需额外索引，先报告。
日期存储类型、产品 SKU、价格标记、编号约束、转换函数都不做 schema 改动。

执行 Preview migration 前先读取 Preview ledger、所需表/约束/索引、状态取值和 RLS，
确认不依赖 Preview 独有 migration；有冲突立即停止。不得执行旧迁移、批量修数据。
Migration 后校验数量与历史数据 digest 未变化；SQL 测试只针对独立本地/Preview fixture。

## 测试与验收顺序

1. 干净基线完整测试，保留命令、运行时和环境假设；新分支不复用旧构建产物。
2. 每个共享模块先写有意义的回归测试，再实现；生产聚合增加 SQL/RLS/分页测试。
3. 五项统一完成后运行 unit/app 全套、相关 API、SQL、typecheck、lint、build、PWA cache，
   五类 XLSX 回归；不修改模板布局或图片回退规则。
4. 固定同一候选 SHA 部署分支定向 Preview，核对前后端 Supabase 目标。
5. 同 SHA 真实验收所有五项，桌面与 390px；只用明确 QA 数据，记录 ID、前后值、
   创建/清理数量和最终保留 artifact。成本历史不创建无关 fixture，不绕过 append-only。
6. Network 固定观察窗口：Production Supabase 0，Sanity 写请求 0；清理/恢复本轮
   临时数据，仅通过正常受控路径，不删除或猜测恢复他人数据。
7. 输出单一最终候选、文件清单、唯一 migration 内容、每项证据与未通过项；
   Production 准备结论不等于发布授权。

## 已知限制与实施者的选择

- 当前附件只有文字规格，四张参考截图未随本次消息附上；按文字设计实现，不声称已对照截图。
- 日期控件的具体日历库/无新增依赖实现方式、测试 fixture 名称属于实施选择，须记录。
- 母单排序建议采用最近子单创建时间降序，再按订单 ID 稳定排序；最晚交期另列展示。
- 所有历史数据冲突、未知生产状态、日期无效值或 RLS 可见性问题先报告，不自动修正。
- 本设计确认后再写细化实施计划和业务代码。
