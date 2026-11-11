# 收款、生产、询盘链路审计（Task C / D / H）

日期：2026-11-11。审计基线：68540bb2。只读审查业务代码与数据库定义，执行本地 mock 测试；没有连接远端数据库、发送 SMTP、写 Production 或修改财务计算/权限/SQL。本子任务仅增加此报告。其他代理的并行修改不属于本报告变更。

## 结论与边界

现有本地验证共通过 153 条 Vitest/Node 测试，另两个 PHP mock 脚本通过。未发现足以在本范围内修改普通前端的确定缺陷。数据库约束、事务并发和部署一致性只有代码/已有 SQL 测试证据，不能据此宣称真实数据库或线上全链路已通过。

以下三项需要明确保留为业务边界/风险，不改变现有计算：

1. **分类尾款与实际未收口径不同**：总额 10000、30% 定金、实收定金 2913 时，`paymentSummary.ts:27-36` 返回应收尾款/分类尾款待收 7000、定金待收 87、总待收 7087。`OrderPayments.tsx:59-80` 已说明分类只比较该类别有效收款，但确认定金阶段完成后仍显示“定金待收 87 / 尾款待收 7000”，可能与工作台“尾款 7087”被误认为矛盾。这是展示口径风险，不是减免或丢失 87 的代码证据。若要统一文案，应明确“原约定分类余额”和“当前阶段应收”的名称，不把 7000 直接改成 7087 而改变分类计算。
2. **退款不属于现有收款模型**：`01_tables.sql:591-595` 仅有 deposit/balance/other 且金额必须大于零；`paymentWorkflow.ts:39-48` 同样拒绝负数，UI 提供的是作废收款。作废会移除整条收款对汇总的影响，不能当作真实退款流水。未找到退款净额/退款审计独立实现，不应标记“退款支持已验收”。如业务需要退款，应单独设计数据库与审计规则，本次不实施。
3. **部分收货粒度为生产单张数**：`ProductionOrderGroups.tsx:223-232` 进度为 received_count/effective_count；`11_production_workbench.sql:49` 状态只有 pending_send/scheduled/received/cancelled。一个父订单的部分子单已收货受支持；一张生产单内按产品/数量分次收货没有该状态/数量台账证据，不应把张数进度称为数量验收。

## C：收款覆盖

| 场景 | 已有证据 | 本次验证层级 |
| --- | --- | --- |
| 2913/3000 确认，87 留到总未收 7087 | `romiku_workbench_actions.test.sql:14-27` 断言接受不改真实收款/总额；`controlledActions.test.tsx` 断言理由、fingerprint、只调受控 RPC | 前端 mock 通过；SQL 仅审阅 |
| 撤销接受、收款作废令接受失效 | 上述 SQL 的 deposit_revoke、void invalidates accepted proof；`BulkWorkflow.test.tsx` 作废排除汇总 | 前端 mock 通过；真实 trigger/RPC 未在本子任务执行 |
| 多次部分收款、超收、小数 | `documentWorkflow.test.ts:125` 两笔定金+部分尾款，0.1/0.2/0.05 超收 0.05；`paymentSummary` 用分整数相加并排除 voided | 通过 |
| 100% / 自定义 20% / 0% | `romiku_workbench_receivables.test.sql:10-22` 包含 prepayment/custom/no deposit 与完整付款消失 | SQL 存在，未执行 |
| 币种 | `paymentWrite` 白名单不接受 currency/order_id 重分配；SQL actions 测试断言已有收款后币种不可改 | 前端白名单测试通过；真实 DB 约束未执行 |
| 新建/更正表单取消、默认值和可逆 dirty | `OrderPayments.test.tsx` | 通过 |
| 退款 | 仅找到正数收款、作废与超收显示 | 功能边界，未验证退款业务 |

## D：生产覆盖

- 父级按 UUID 聚合并以 `getMany("romiku_orders", ids: groups.map(group.id))` 获取订单送货日期；不以可变业务单号关联（`ProductionOrderGroups.tsx:59-82`）。对应测试明确断言 parent UUID，实际送货日期和工厂交期分离。
- 默认进行中，按父订单分页；展开读取完整历史，100 条一页并支持后续加载；命中超过首 100 条的子单仍可定位；批量选择保留 100 条合同上限。`ProductionOrderGroups.test.tsx` 覆盖这些行为。
- 已收货在进行中分组内折叠；取消单不进入该视图可选项；收货/取消行工厂交期只读（同文件 `:328-348`、`:466-471`）。全历史视图仍展示取消历史。
- `ProductionWorkbench.test.tsx` 覆盖多行编辑取消无写入、失败保留草稿、部分分配、超额阻止、草稿 refetch 保护、交期仅经版本控制保存/清空。
- `ProductionDueControls.test.tsx` 覆盖使用原 revision 保存、后台刷新不覆写输入、STALE_REVISION 后保留输入、主动读新版本后携带新 revision、显式确认清空交期。测试通过。数据库拒绝 stale revision 的 SQL 断言位于 `romiku_workbench_actions.test.sql:99`，本子任务未执行。
- `romiku_production_order_groups.test.sql` 已覆盖取消不算有效分母、混合已收货/取消、纯取消分组、父级分页及父子 RLS 隐藏；这里只核对测试存在，不宣称 DB 运行成功。

## H：询盘覆盖

- 幂等：`02_functions.sql:928-938` 在 READ COMMITTED 下使用 submission UUID 事务锁，返回原 saved raw_payload；表 `submission_id unique` 是最终约束。同一 UUID 重放采用原日期/原快照，API mock 测试通过；不同 UUID 即使同邮箱仍是独立询盘。历史未提供 submissionId 的路径不应描述为同一幂等合同。
- 原子性：该函数先验证全部 items，再在同一函数事务写 header/items（`:1003-1012`）；没有逐项提交。失败回滚/真实并发本次仅代码审阅；`server/inquiryConcurrency.local.test.ts`、`websiteInquiries.local.test.ts` 都需要显式本地 DB 开关，本子任务没有启用。
- CRM-first：`website-runtime/lib/pipeline.php` 的 `qa_process` 在有效 CRM receipt 持久化后才进入通知循环。禁网 PHP pipeline mock 证明 CRM 失败零邮件，邮件失败保留 CRM 成功，重试只发送未成功通知并使用原快照。
- 邮件不确定结果：Production runtime 在发信前落 `attempting`，仅确认成功后标 `accepted`；不确定异常保留 attempting，后续禁止盲重发。禁网 runtime mock 通过。该情况需人工核对投递；外层呈现 pending，不能理解为任意重试必然恢复。未调用真实 SMTP。
- 前端提交重试 Node 测试证明部分邮件失败/网络不确定时保留原 submissionId 和快照，确定校验失败允许编辑。
- 询盘八个状态更新、失败回滚、只写处理字段、关联缓存失效、刷新不丢未保存草稿，`InquiryInteractions.test.tsx` 通过。`InquiryFreshness.test.tsx` 验证 30 秒刷新、隐藏页不轮询、筛选/页码保留、错误后恢复。
- 待办：`30_workbench_actions.sql:283-284` 对未归档且非 won/invalid 的询盘生成候选；pending_screening 标为待核实。`actionCenter.test.tsx` 验证询盘事件展示/筛选。状态后真实服务器待办消失尚未做数据库集成验证。

## 本次执行记录

均在本仓库执行。浏览器第一次因沙箱 `listen EPERM ::1` 未能启动，获准本地回环服务后重跑成功；这一次启动失败不计作测试失败或通过。主机没有 php 命令，改用本机已有 `php:8.3-cli` 镜像，`--pull never --network none`、仓库 `:ro` 挂载，mock 输出只写临时容器。

| 命令 / 范围 | 结果 |
| --- | --- |
| `npx vitest run --project app`：OrderPayments、documentWorkflow、ProductionOrderGroups、ProductionWorkbench、productionDueDate、InquiryInteractions、InquiryFreshness、BulkWorkflow | 8 文件，75 测试通过 |
| `npx vitest run --project app`：ProductionDueControls、controlledActions、actionCenter | 3 文件，10 测试通过 |
| `npx vitest run --project server`：websiteInquiries、websiteInquiryXlsx、websiteInquiryRuntime | 3 文件，66 测试通过 |
| `node --test website-production/tests/submission.node.mjs` | 2 测试通过 |
| `docker run --rm --pull never --network none -v <repo>:/project:ro php:8.3-cli php /project/website-qa/tests/pipeline.php` | exit 0，全部 mock 断言通过 |
| 同容器配置执行 `/project/website-production/tests/runtime.php` | exit 0，7 行 PASS |

没有运行远端验证、真实 SMTP、部署、数据库迁移/修改、生产写入或提交 git commit。没有扩大到未列出的导出/库存/履约完整链路。
