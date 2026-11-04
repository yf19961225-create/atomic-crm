# ROMIKU CRM 工作台与优先待办正式设计稿

日期：2026-11-03 ｜ 状态：待用户审核，尚未授权实施

审计代码基线：`cc1b16b26d11be71e8e6296b70846a0382045f91`。
本文件及配套 SQL 仅供设计审核；没有执行任何 SQL、修改业务代码、部署或改写业务记录。本轮没有重新读取线上数据库完整定义，因此仓库审计不等于线上无漂移证明。

## 1. 决策与边界

采用已原则批准的「最小状态模型 + 独立客户确认状态 + 受控 RPC 审计」。

| 方案 | 取舍 | 结论 |
|---|---|---|
| 仅前端过滤/本机记住隐藏项 | 无双用户同步、证据失效与审计保障 | 不采用 |
| 独立业务状态、服务端动作、派生待办 | 保留现有财务与生产事实，增加最少必要状态 | 采用 |
| 新建完整分期账本、重构订单/生产状态机 | 超出本轮需求，容易改变历史财务语义 | 不采用 |

不修改金额、付款分类、实际到账、折扣、原订单状态、生产进度、收货记录、客户品牌或单据编号。不增加虚假收款、免款或差额调整。不会自动推断历史客户已确认，不批量修改历史交期。不改网站询盘同步、产品录入、导出或装箱规则。

**本稿由实施方选择的细节**：状态放入独立附属表；历史无附属记录按默认状态读取；日期分类与客户确认不写入原业务 `status`；所有新状态动作采用悲观提交；冲突时刷新后由用户重试；审计只追加。以下为这些选择的精确定义，供本次审批。

## 2. 已有系统及根因

- `workbench/actions.ts` 当前对未取消、未作废且有余额的订单生成收款项，未排除草稿。当前已实现同订单只取定金或尾款；不是数据库重复保存两条待办。
- `romiku_order_totals` 和 `paymentWorkflow.ts` 保留实际金额计算；没有人工完成定金阶段状态。`confirmed` 是订单业务状态，不能证明客户确认。
- 有效收款分为 deposit、balance、other；总未收由全部有效收款计算。未发现可执行的结构化多期付款计划，不把自由文本自动解析成分期安排。
- 生产提醒按子单生成，无交期分类；工作台默认显示全部最多 50 项，每 60 秒刷新。
- `romiku_status_history` 只记录原业务 status，不能承载人工定金完成或交期分类。
- `sales.user_id` 唯一、`sales.disabled` 可判断有效 CRM 用户。仓库中的订单 RLS 对 authenticated 开放读写；实施前必须核对线上，不擅自收窄为 owner-only，也不得扩大线上实际权限。

## 3. 客户确认与历史核实

独立字段 `customer_confirmation`：`unknown` 待核实、`unconfirmed` 客户未确认、`confirmed` 客户已确认。

- 新订单、历史无状态行均有效读取为 unknown；不根据原 `orders.status='confirmed'` 推断。
- 只有明确 confirmed、非 draft、非 cancelled/voided/archived、实际未收 > 0 才进入常规收款。
- shipped/completed 不代表已结清，仍按实际未收计算。客户确认不自动推进生产/订单状态。
- unknown 且有余额的非取消/作废/归档订单（包括 draft）进入「待核实客户确认」列表，显示订单链接、原状态、实际未收、当前有效收款，支持搜索、分页、逐条核实。
- 待核实数量和按币种的潜在应收总额常驻工作台提示，入口位于待安排和全部待办。即使近期重点为空也不消失；不同币种不相加。
- 明确 unconfirmed 或 draft 不进常规收款；全部待办保留“客户未确认/草稿有余额”可查入口。归档/作废历史在历史筛选可查，不当成当前催收任务。
- 操作需备注原因（例如客户邮件确认），记录 actor/time/revision；本轮不上传新的凭证文件，不读取客户私人邮箱。
- confirmed 改为 unknown/unconfirmed 会撤销人工定金完成覆盖，并留下事件；不改任何到账事实。再次 confirmed 不自动恢复旧覆盖。

## 4. 收款阶段与 87 元差额

### 4.1 计算口径

沿用现有精度（币种金额两位小数）及订单 totals，不重复扣 discount：

- T = 现有订单总额。
- R = 全部有效收款之和（deposit/balance/other）。
- O = max(T − R, 0)，真实总未收；超收沿用现有显示。
- D = 现有约定定金金额；Dp = 有效 deposit 到账。
- 自然剩余定金 = min(max(D − Dp, 0), O)。

符合常规收款条件且 O>0 时：

| 条件 | 唯一当前收款项 |
|---|---|
| 100% 预付款 | 一次性应收 O，不允许借人工定金完成免除余额 |
| D=0 | 待收款/尾款 O |
| 自然剩余定金>0 且无有效人工完成覆盖 | 待收定金，金额为自然剩余定金 |
| 定金自然收齐或有效人工完成覆盖 | 待收尾款，金额为 O |
| O=0 | 无收款待办 |

**例：T=10000，D=3000，Dp=2913。** 原待收定金87；人工确认后待收尾款7087。87已包含在7087，不另加一次。T、R、O 均不变化。再收2000后尾款5087。旧的“按付款类别统计尾款”字段保持原含义；当前待办使用真实总未收，不能冒充同一个统计字段。

### 4.2 人工确认条件

两个入口（工作台、订单详情）调用同一个 RPC。弹窗展示计划定金、实际定金、差额、总未收、将进入的阶段，并明确“不是减免”。

服务端要求：订单可写且可见、用户有效、客户明确确认、订单非草稿/取消/作废/归档、0<定金比例<100、尚有剩余定金、有至少一笔本订单有效且金额>0 的 deposit 收款。**仅手写备注不能当收款依据。** 证据为本次所有有效 deposit 付款 ID 的服务端快照；含金额、类别、到账日期、状态、updated_at、付款账户与凭据的摘要。前端不得自行指定遗漏部分证据的集合。

必须填写原因、提交预览指纹和状态 revision。金额、订单货币、条款或证据变化后不沿用旧弹窗批准。

### 4.3 失效与撤销

- 证据付款的金额/类别/到账日/状态/订单归属/账户/凭据发生改变，或付款被撤销：同一事务将覆盖设为 invalidated、追加原因审计。不存在“先成功撤销付款、稍后才撤销覆盖”的窗口。
- 订单金额、币种、定金比例、产品行金额组成变化：保守失效。新增后续尾款不使覆盖失效；新增 deposit 收款也不抹掉原批准，但新收款按实际总额参与计算。
- 原订单变为 draft/cancelled/voided/archived 时失效；恢复状态不复活覆盖。
- 只要覆盖失效，下一次读取使用真实收款重新决定阶段；自然已收齐定金则仍是尾款，不机械回到定金。
- 手动撤销是新事件，不能删除原批准；必须填写原因。没有数据回滚，没有自动退款。
- 100%预付款允许标记跟进、改跟进日期，不提供“定金阶段完成”按钮。
- 自定义比例使用已有 deposit_percent；现有文本形式的多期条款展示“人工核实分期条款”，不虚构下一期金额。若预检发现真正结构化分期模型，暂停相关规则实现并补充设计，不退化成固定30/70。

## 5. 生产交期分类

`due_classification`：unclassified 待分类、needs_confirmation 需要确认交期、confirmed 已确认交期、not_required 无需设置交期。

无附属状态：无 factory_due_at → unclassified；有有效日期 → confirmed 的**读取默认值**（表示已有日期，不声称客户/工厂已重新确认），不更新历史行。

| 状态 | 日期与提醒规则 |
|---|---|
| 待分类 | 无日期不算逾期，进入历史分类列表 |
| 需要确认交期 | 进入待安排；可保留原日期供参考，但该日期不参与“有效已确认交期”逾期统计 |
| 已确认交期 | 必须有有效 factory_due_at；按原交期规则计算近期/逾期 |
| 无需设置交期 | 不生成常规交期催办；保留已有日期；已有日期时二次确认并说明原因 |

分类本身不改 factory_due_at。用户明确修改日期时，RPC 在同一事务更新原日期和分类并审计。沿用 `productionDueDate.ts` 的 Asia/Shanghai 工厂日期语义，不转换成浏览器本地零点。

所有已有生产单的 factory_due_at 变更统一走带 expected_revision 的受控RPC，不允许普通PATCH绕过并发校验。新前端生产详情中的交期改为独立“保存交期”动作，明确立即保存，与其他字段表单分开；其他字段保存不再携带日期。新建生产单首次INSERT仍沿用原日期创建规则，无历史版本可覆盖。

数据库UPDATE钩子只允许固定受限执行角色的受控函数改变日期；其他调用者改变日期返回“请刷新并使用交期操作”，不能仅凭客户端可设置的GUC放行。值未变化的普通保存仍允许。受控RPC先比revision再改日期/分类，每次实际日期变化推进同一revision、写审计；两个用户同时操作只允许一个提交。填入/修改日期时，未显式分类或原confirmed保持confirmed；原needs_confirmation/not_required保留显式分类并提示。清空已确认日期转needs_confirmation。日期撤销也必须版本匹配，绝不盲目覆盖后来编辑。

旧前端回退后不能再直接改交期；回退包必须把交期设为只读并显示维护提示，不能回滚数据库保护来恢复旧入口。该兼容代价属于本设计审批范围。

按真实 order_id 汇总全部可见、非归档且未 received/cancelled 的子单：未完成数、有效最近日期、逾期数、需确认数、待分类数。过滤、总数、分页均先按全量可见数据分组再分页，不能对当前页子单分组。不同子单保留自己的状态和日期。

received/cancelled 不纳入未完成交期提醒；已有异常事项仍作为独立异常类型保留，不伪装成未完成生产。订单层面摘要不修改子单收货、数量、进度。批量分类需逐项显示目标和预期 revision，整批冲突零写入；不按订单 UUID 一键无差别覆盖所有子单。

## 6. 工作台信息结构

| 区域 | 内容与操作 |
|---|---|
| 近期重点 | 默认最多8条；逾期、今天、未来7个业务日历日期窗口内的有效交付/生产日期及明确需立即跟进事项；“查看全部近期重点” |
| 待收款 | 每订单当前唯一阶段；按币种金额；确认定金完成、跟进标记/日期、打开订单 |
| 待安排 | 需要确认交期、其他待安排；独立显著入口处理历史待分类与客户待核实 |
| 全部待办 | 搜索、类别/来源/状态筛选、准确分页；保留网站询盘、手动任务及其他现有事项 |

近期窗口定义：业务时区 Asia/Shanghai，今天00:00起到第7天结束；过期单独统计。先按严重程度（逾期/显式高优先/今日/未来）、有效日期、来源类型、稳定UUID排序。没有日期的应收不因余额存在就进入近期重点；收款跟进日期<=今天或显式 needs_follow_up 才进入。原付款到期日保留展示和筛选，明确逾期的合同付款到期可进入近期，不能把空到期日认定逾期。

收款跟进使用独立 DATE，不改变原合同 deposit_due_at/balance_due_at 或泛用 follow_up_at。跟进“处理完成”只是清除明确跟进标记/调整下次日期，不消除尚未收到的应收。

手动任务完成复用原 completed_at/复发规则，不改成删除。新操作使用 pessimistic：等待服务端成功再显示完成；失败保留输入。相同页面立即失效并刷新工作台、订单付款、生产组和相关计数；跨用户 Realtime 通知 + 断线60秒轮询/重新聚焦拉取兜底，通知只作刷新信号，不充当业务真相。

计数使用同一服务端查询快照返回：原始可处理事项数、汇总展示项数、近期总数及当前展示数。生产一组可含多个子项，显示“1组/3单”；不把这些单位混为一个“待办总数”。8是显示上限，不截断总计或后续分页。

## 7. 精确数据模型（新增四张空表）

配套 `workbench-schema.review.sql` 列出精确DDL；它是**结构审核草案，不是完整可执行发布 migration**。完整RPC/触发器函数体、权限策略及SQL测试须在设计批准后的实施阶段生成、验证并再提交迁移执行审批，不能把本草案直接投入数据库。

### 7.1 romiku_order_collection_state

每 order_id 一行；不存在时读默认，第一次受控动作才创建。
- customer_confirmation text default unknown。
- deposit_override text default none：none/accepted/invalidated/revoked。
- deposit_event_id uuid nullable：指向最新批准事件；快照存事件，不把金额复制为新账本。
- needs_follow_up boolean default false；next_follow_up_on date nullable。
- revision bigint default0；updated_at timestamptz；updated_by uuid。

### 7.2 romiku_production_due_state

每 production_order_id 一行。
- due_classification 四状态；needs_follow_up boolean；next_follow_up_on date。
- revision、updated_at、updated_by。

### 7.3 romiku_workbench_events

追加审计：id UUID、entity_type、entity_id UUID、action、actor_id、occurred_at、request_id、request_hash、before_state/after_state JSONB、evidence JSONB、reason、reverses_event_id、result JSONB。
- 请求ID全局唯一；同请求同用户同规范化内容返回首次结果，其他情况冲突，不泄露其他用户结果。
- evidence 保存必要付款快照与金额指纹，不保存Secret、完整客户联系方式或无关凭据内容。
- 原始事件不更新/删除。撤销创建新事件指向原事件。
- entity_id无级联FK，业务对象正常受控删除后仍保留审计。删除对象的审计只对管理员可读，避免通过残留日志泄漏权限范围。

### 7.4 romiku_deposit_evidence

复合PK(event_id,payment_id)，关联当前批准使用的收款。event_id FK RESTRICT；payment_id保存UUID、不级联删除（既有付款禁止删除）。仅内部写入，客户端无写权限。单笔付款支持关联历次批准，便于检查受影响的有效覆盖，不扫描所有事件JSON。

不增加订单总额、收款金额、生产数量字段，不替换既有 totals/views/status_history。附属状态允许随合法业务源删除而清除（ON DELETE CASCADE），不会主动删除源记录；审计与证据保留。合法删除源的服务端事务必须先写 source_deleted 事件，缺少该事件则拒绝；实施时审计现有受控删除入口，不能为了这项设计放开原有历史保护。

## 8. 权限、RPC 与并发契约

### 8.1 最小权限

建议新建专用 NOLOGIN、NOBYPASSRLS 执行角色 `romiku_workbench_executor`，不拥有原业务表；继承 authenticated 以使用现有相同RLS，不能授予客户端该角色。函数 SECURITY DEFINER 的 owner 为该角色，`search_path=''`、静态SQL、全限定对象名；禁止任意SQL/表名/操作类型拼接。它不是postgres或service_role。

仅该角色具备新状态/证据写权限；事件仅INSERT。authenticated仅可SELECT新表和EXECUTE公开RPC；anon/PUBLIC无权限。新表由迁移管理者持有并启用/强制RLS，给执行角色明确策略，客户端读策略通过可见父对象；事件无父对象时仅管理员。

每个动作先验证 auth.uid、JWT role=authenticated、sales有效且未disabled；双用户各自基于现有父对象SELECT/UPDATE策略。**不能把SELECT可见等同可写**：锁父对象需UPDATE权限且须按UPDATE策略验证；实现使用受RLS约束的许可检查辅助查询，必须以测试证明只读用户无法变更状态。如无法在不修改父业务行的情况下复用UPDATE资格，停止权限实现并审核专用共享授权谓词，不能通过无意义UPDATE改写updated_at来探测。

实施前验证角色创建/函数所有权能力、实际RLS与线上Auth用户映射。若Supabase不允许该角色结构，报告替代方案；不能悄悄改成绕过RLS的postgres函数。触发器写审计也使用固定受限角色，调用方不能直接EXECUTE内部函数。源更新调用者若是正常系统任务，事件actor可为空但必须有明确system来源，不冒充人工操作。

### 8.2 公开RPC接口（参数均服务器校验）

| RPC | 作用 |
|---|---|
| romiku_workbench_read(filter jsonb, cursor jsonb, page_size integer) | 只读聚合、核实列表、各计数；page_size<=100、白名单筛选、稳定排序 |
| romiku_set_customer_confirmation(order_id uuid,state text,reason text,expected_revision bigint,request_id uuid) | 独立客户确认；必要时失效定金覆盖 |
| romiku_preview_deposit_completion(order_id uuid) | 只读返回金额、证据、规范化fingerprint、revision和是否允许 |
| romiku_confirm_deposit_completion(order_id uuid,expected_revision bigint,expected_fingerprint text,reason text,request_id uuid) | 原子确认，不更新付款/金额 |
| romiku_revoke_deposit_completion(order_id uuid,expected_revision bigint,reason text,request_id uuid) | 撤销当前覆盖，留存历史 |
| romiku_set_collection_follow_up(order_id uuid,needs_follow_up boolean,next_follow_up_on date,expected_revision bigint,reason text,request_id uuid) | 尾款/定金跟进，不改变合同日期 |
| romiku_set_production_due(production_id uuid,classification text,date_change jsonb,needs_follow_up boolean,next_follow_up_on date,expected_revision bigint,reason text,request_id uuid) | 日期change明确keep/set/clear，不能用null同时表达不修改和清空 |
| romiku_revert_workbench_event(event_id uuid,expected_revision bigint,reason text,request_id uuid) | 补偿动作；重新验证当前权限、证据、约束，不盲目恢复旧JSON |

Read RPC SECURITY INVOKER，无写入。读取与写入返回计算时点、当前revision、金额与状态，前端不自算批准条件。JSON是类型化白名单，不是自由patch。

### 8.3 原子步骤

1. 验证身份、权限、参数；相同request_id串行锁，检查已有事件的actor和hash。
2. 按订单UUID顺序锁父订单（生产动作再锁子单），创建或锁附属状态行；不存在按revision0。
3. 比较expected_revision；锁后重新查询金额/证据并比fingerprint。不同则CONFLICT，整事务零写入。
4. 执行业务规则，更新新状态、revision+1；添加审计、证据、结果；同一事务提交。
5. 返回结果，触发页面重新读取。丢失响应可用原request_id查询首次结果，不重复动作。

收款、订单金额字段和产品行更新必须安装数据库失效钩子，覆盖旧前端/普通API更新，不依赖某一按钮。父锁与证据检查必须覆盖付款撤销和并发订单产品行编辑。已有 void_payment 锁付款后更新，可能与父锁顺序相反：实施不得悄悄重写该金融RPC；优先让触发器序列化到父锁，死锁由PG回滚其中事务并返回可重试冲突，客户端不自动重放金融写入。必须用双连接测试证明无陈旧批准能提交；若无法证明，暂停而非上线。

业务写入与新失效/审计事务同成败；不得吞掉审计失败继续保存。避免扩大锁范围到全部订单，批量动作按UUID稳定顺序。

## 9. Migration 设计及执行顺序

拟两份migration，确切版本号在批准实施时按ledger分配，避免现在占用历史版本：

**M1 workbench_state_and_audit**：只读前置断言 → 四空表与索引 → RLS/最小授权/执行角色 → 内部审计和许可函数 → 只读权限检查。不得有INSERT SELECT历史回填，不修改原两类status。

**M2 workbench_actions_and_invalidation**：依赖M1 → 公开RPC完整函数 → 付款/订单/产品行/交期失效审计触发器 → 受控删除审计衔接 → 只读工作台RPC → EXECUTE白名单 → 结构断言。一份事务失败全部回滚，不部署依赖该对象的前端。

不得先发布允许确认但没有证据失效钩子的中间版本。M1成功M2失败时仅保留空表与封闭权限，旧前端继续运行，不启用新工作台。M2不得替换自动编号、转换、收付款RPC或既有总额计算。若预检发现必须替换这些函数，停止并报告变更理由。

配套SQL明确展示精确新字段/约束/索引；RPC/触发器为上述接口和事务契约，完整函数实现属于下一阶段，不冒充已测试的迁移。最终可执行SQL必须从批准实现产出，附对象diff和SHA-256，执行前另行授权。

## 10. Preview 验证方案（未授权执行）

1. 独立分支固定最新Production基线；只读核对Preview ledger/schema、角色能力、RLS、付款void、删除、日期与金融函数哈希；发现未知差异停止。
2. 本地干净数据库应用完整migration及双用户测试，核对旧表数量/内容无变化，再提交Preview执行审批。
3. Preview执行前记录核心表数量和内容指纹、原函数/触发器定义；执行M1/M2后排除新增状态对象比较旧数据。不得修改真实记录进行验收。
4. Preview合成QA：unknown/unconfirmed/confirmed × draft/正常/已完成/作废；无定金/30%/自定义/100%；部分定金/87差额/尾款部分/全收/超收；撤销证据/修改金额/更改条款；双用户并发与重复request；日期四分类/空/跨月/时区；旧页面过期日期保存与新RPC竞争必须拒绝旧写入，日期修改推进revision；分组跨分页/完成取消/异常。
5. 浏览器验证两个入口同步、刷新/重新登录、失败不假成功、近期8条与总计、待核实应收可见、其他模块不丢项。用两个账号验证即时刷新及断线轮询。
6. 权限测试：anon、禁用用户、只读用户、他人不可见对象、伪造actor、直接REST写新表/改审计均拒绝；系统合法付款变更正常。
7. 完整SQL/前端、typecheck、lint、build、PWA；不重复以CSS测试代替浏览器。
8. 记录每个QA UUID、创建/清理数量；正常受控流程清理，append-only历史不绕过删除，残留QA审计标识保留。Production请求0、Sanity写入0。

## 11. Production 备份、中断与回退（仅预案）

未来单独授权发布前：确认正式SHA、ledger、两份migration哈希与已验收一致；加密一致性备份必须含新旧业务表、Auth恢复依赖、ledger、函数/RLS及审计。记录恢复点与业务指纹，备份后新增数据形成明确RPO窗口，不能声称无数据丢失。保留Mac/独立网盘验证副本及恢复演练证据；云托管恢复未验证时如实PENDING，旧例外不能自动视为本轮授权。

- M1/M2任何失败立即停止，不自动修历史记录，不继续部署。
- 数据库完成但新前端失败：旧前端可读写未受新保护影响的原字段；交期变更必须使用新RPC，旧入口缺少版本令牌时拒绝，新表和审计继续保留，失效钩子继续保护证据。旧工作台不理解客户确认和人工完成，可能再次显示错误提醒，因此**不能称为完整业务兼容回退**；紧急回退时应使用预先验收的回退前端关闭旧优先待办入口、将工厂交期改为只读并显示维护提示，订单等原模块继续可用。该回退包在Preview验证，另行纳入发布审批。
- 不DROP新表、不删除审计、不撤销保护以迎合旧前端；恢复全库是灾难恢复，须单独授权并处理恢复点之后的数据，不能自动覆盖现网。
- 如果旧付款编辑被新钩子阻断，停止评估，不关闭审计强行保存。Production无测试收款/假订单。

## 12. 影响范围与审批结论

新增状态和审计、受控动作、工作台读取聚合及两处操作入口；原客户状态、生产status、金额、实际付款、合同日期、快照及导出数据保持原值。修改日期只发生在用户明确提交日期动作时。

当前可批准的是**设计方向和业务规则**，不是可部署migration。结构SQL尚未执行，RPC/触发器尚未实现，完整测试/Preview均未开始。本稿批准后才编写细化实施计划和完整SQL，任何Preview/Production迁移仍需单独授权。

## 13. 独立设计审查记录

2026-11-03 独立审查发现旧日期保存入口缺少统一版本校验，已按第5节改为受控RPC和严格版本检查，补充旧前端交期只读回退与双连接测试。审查不是代码测试或数据库安全认证；后续仍需完整实现与验证。
