# 工作台本地 UI 与验收报告（2026-11-04，第二阶段）

## 结论与范围
新版四分类、两个操作入口及本地安全回退已实现。**本地验收通过，可申请下一阶段 Preview 流程授权；不等同于 Preview migration 已具备无条件执行资格。** 当前 Preview schema/ledger 尚未取得新读数，须先完成只读 Gate；跨用户托管 Realtime、同迁移后数据库的完整 Preview 回退 deployment 仍需真实验收。
没有访问/修改 Production，没有执行 Preview/Production migration，没有部署，没有修改正式环境变量、Namecheap 或 Sanity。

分支 `codex/workbench-controlled-actions`，开发基线 `cc1b16b26d11be71e8e6296b70846a0382045f91`。候选以包含本报告的 Git 提交为准，提交后另行报告完整 SHA。上一阶段报告保留为历史记录，其“UI未完成/测试挂起”结论由本报告更新。

## UI 与业务规则
- 近期重点每页最多8条，服务器先统计后分页；上海业务今天至+6，保留逾期。收款跟进仅到今天或显式标记才进入；合同付款明确逾期亦进入，100%预付款使用定金到期日。
- 待收款仅已确认且非草稿、有效有余额订单，每订单当前阶段一项；人工定金差额保留在尾款。未确认及草稿不生成常规催款。
- 待安排包含客户确认待核实、生产待分类/需确认等。待核实入口常驻，潜在应收按币种完整统计；未确认/草稿余额另有完整查找入口。
- 全部待办支持搜索、来源/状态筛选、20条分页，生产以真实订单 UUID 在分页前聚合全部可见子单；显示汇总数和原始事项数。
- 订单收款管理附近与工作台共用 CollectionControls，调用相同 action/snapshot RPC；交期共用 ProductionDueControls。任何操作要求原因、真实依据/版本，错误保留输入，重复点击锁定，响应失败重试复用 request_id。
- 每次打开表单先获取新快照；开始编辑后固定 revision/fingerprint，不因后台刷新覆盖当前草稿。普通生产表单不再写已有交期，受控入口独立保存；新建生产初始日期保留。

## 挂起与现场发现
1. 浏览器 Vitest 在跨工作树 `node_modules` 软链接环境下连纯日期测试也停在 RUN。改用独立物理依赖副本后相同测试1.87秒完成。无删断言、无增加超时、无新增 skip。
2. 完整前端首轮7失败：新feed/权限mock与既有送货日期测试夹具不匹配，逐项修正；未屏蔽真实业务断言。
3. 真实浏览器发现缓存快照被表单固定，重新打开仍携带旧revision，服务器正确拒绝。新增测试实际出现 expected9/received2 后修复重新打开读取流程。
4. 独立审查两项 Important：100%预付款到期字段错误、未来收款跟进过早进入重点。均新增失败 SQL → 修复 → 最终新库迁移及回归通过。
5. 本机网关原未转发 Accept 导致 `.single()` 返回数组，已修复隔离测试网关；非 CRM 产品代码缺陷。

## 实际测试结果
| 范围 | 结果 |
|---|---:|
| 新 SQL 权限/动作/应收/feed | 23+49+29+18 = **119 PASS** |
| 原生产工作区/生产分配/受控删除/状态历史 SQL | 38+31+56+63 = **188 PASS** |
| 双连接并发 | **4 PASS** |
| 完整前端/服务端 Vitest | **1415 PASS / 0 FAIL / 3 skipped**，189文件通过、2跳过 |
| Typecheck | PASS |
| 全仓 Lint | PASS；既有 eslintignore 弃用警告 |
| 正常及安全回退 Build | PASS；既有 chunk size 警告 |
| 两种产物 PWA | PASS |
| 本地真实浏览器主要流程 | 10项 PASS + 跟进跨入口1项 PASS |
| 安全回退真实浏览器 | PASS，旧式日期 PATCH 403、数据不变 |

3项既有skip：联系人 skeleton、两项需独立网站询盘本地DB环境的 server integration。未因本轮加skip；网站询盘未修改，按用户要求不重跑已通过且无关的独立环境演练。SQL回归范围明确为相关188项，没有宣称全仓所有SQL均运行。
最终库 `romiku_workbench_release_20261104` 从原有**合成 schema 测试库**复制，分别事务执行最终M1/M2。测试模拟 authenticated JWT role；旧回归文件只设置sub，runner补齐role，不放宽数据库权限。该库 ledger=0不代表线上ledger。

## 浏览器证据
见 `evidence/` 的脱敏 JSON 与桌面/390px/回退截图：
- 近期10项只显示8项；客户未确认不催款；未知2张潜在应收20000完整可见。
- 订单详情确认2913/3000，工作台余额7087；改实际收款2912后确认失效、剩余定金88；重新确认余额7088；受控撤销恢复88。
- 一订单4个生产子单聚合；4类交期各自保存；两有效用户同revision竞争，一方成功另一方冲突并保留草稿。
- 重新登录/刷新状态保持；工作台跟进标记和日期在订单详情可见；390px加载完成后无页面横向溢出。
- 正常浏览器3182个本地资源/API请求，外部0；跟进追加1251个本地请求，外部0。不是3182次数据库写入。
- 回退包维护页面、订单读取正常，旧PATCH返回42501/403且日期未变；1条既有 `atomic-crm-telemetry.marmelab.com` 请求在发送前被拦截。所有运行的 Production/Preview Supabase 请求0，真实邮件0，Sanity写入0，pageerror0。

本地拓扑：内部Docker网络、Auth2.197.0、PostgREST16.4、仅监听loopback的网关与前端。Auth在独立新数据库由官方服务初始化受管schema，两个合成用户UUID映射到业务测试库；不是托管项目完整兼容性的替代证明。未启动本地 Realtime 服务：同浏览器多标签同步实测通过，订阅/计时器/广播/焦点监听释放有单元测试；跨用户实时推送仍列Preview必验，不能把本地冲突测试说成WebSocket推送PASS。

QA仅本地：2用户、3订单、1收款、4生产单、10手动任务，无真实客户、无旧备份改写。保留独立本地库及审计证据，停止临时服务，不删除金融/审计历史。下一阶段Preview QA按受控清理流程，受保护历史保留并列ID。

## 安全回退范围
同源码安全开关关闭旧工作台，已有交期前端只读/保存剔除；数据库仍强制旧写拒绝。回退静态包仅本地QA用途（本地合成客户端配置），不是可直接用于Vercel的完整部署。后续从相同源码+API+正确Preview配置构建完整回退deployment并验收，不DROP新状态、不清空审计、不解除服务器保护。

## 最终 Migration
1. `supabase/migrations/20261104100000_workbench_state_and_audit.sql`
   SHA-256 `7eaf071409b6951c70df963c6745ba5ba79f4283e6bae9dd4965aed8d152c0d3`
2. `supabase/migrations/20261104110000_workbench_actions_and_invalidation.sql`
   SHA-256 `9df5aa1f93b2b900cced4906fc40167faab65305ce73210092110574b0d0193c`

M1安全基础保留。M2新增只读feed/due snapshot及新状态表Realtime publication登记（仅已有publication时），两个筛选修复已包含。原设计review SQL仍RAISE阻止执行。
精确预检、备份、逐份事务/ledger、双用户及回退/清理流程见 `2026-11-04-preview-execution-plan.md` 和 `preview-preflight.readonly.sql`。

## 执行裁定与限制
- 隔离worktree基线取自已核实本地候选；未重置旧工作区。若误认基线会混入旧代码，因此提交前核对祖先及diff。
- 统一受控action白名单RPC替代多独立动作名，两个入口使用同一契约；权限、审计和revision测试保持。不得当作动态SQL通用写接口。
- 本地Auth采用独立官方初始化库，保留真实鉴权及RLS；因此云端初始化/Realtime兼容仍须Preview验证。
- 按用户要求保留本轮审计/截图证据，不按通用执行skill删除工作目录；不清理其他任务文件。
- 独立审查无未处理Critical/Important；没有以“准备方案”冒充远端实际执行。当前无Production发布授权。
