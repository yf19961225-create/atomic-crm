# I — 权限安全本地证据（2026-11-11）

基线：68540bb2。无远端访问。数据库：既有本地 Docker 容器中的独立 `romiku_health_permissions_20261111`，由 `order_status_20261109` 克隆。源库未修改。源库不含现有产品辅助修复，因此仅在专用克隆加载 `supabase/schemas/32_product_auxiliary_active_user_writes.sql` 后取最终基线结果。只输出合成测试身份和断言，不读取或输出业务行。

## P1：disabled / 无 sales 的 authenticated 身份仍可改写主要业务

`supabase/schemas/05_policies.sql:105` 起的共享团队策略检查 authenticated 数据库角色，却不检查 sales.disabled 或 CRM 成员关系。订单 INSERT（141）、报价/PI INSERT/UPDATE（120、132）、供应商（156）、生产（179）、装箱（193）均为 true。`06_grants.sql:203` 起给 authenticated 对应写权限。这不是匿名访问；风险主体是仍带有效 authenticated JWT 的停用人员或没有 sales 记录的 Auth 用户。

实际执行 `supabase/tests/romiku_health_permissions.test.sql`：39 个断言，32 失败（漏洞回归应为红色），7 通过；完整执行到 ROLLBACK。disabled 和 outsider 各自：

| 实际路径 | 基线结果 |
|---|---|
| INSERT 订单、报价、PI、收款、生产单、装箱单、供应商、询盘 | 全部成功，预期拒绝 |
| UPDATE 报价、PI、供应商、生产单、装箱单、询盘 | 全部成功，预期拒绝 |
| UPDATE 订单 | 被工作台 financial-change trigger 42501 拒绝 |
| INSERT 产品辅助 | 被现有 active policy 拒绝 |
| 工作台 action（disabled） | 42501 拒绝 |
| 批量报价状态 RPC（两身份） | 实际成功，未返回 UNAUTHENTICATED |
| 删除供应商 / PI RPC（disabled） | 实际成功，未返回 UNAUTHENTICATED |

工作台 `30_workbench_actions.sql:136` 的 trigger guard 不覆盖订单 INSERT 或收款 INSERT（trigger 在156-158只有 payment update/delete，order update，order_item 全写入），因此这些入口仍开放。

## P1：只收紧表 RLS 无法修复 SECURITY DEFINER 删除/批量入口

`21_supplier_controlled_delete.sql:10` 的入口只核对 uid 和 role，函数 SECURITY DEFINER，直接删除 supplier；现有 DELETE grant 撤销无法阻止此RPC。`02_functions.sql:1034` 的 delete_record、`17_bulk_workflow.sql:68` batch_delete / `:84` batch_status 同类。测试证明停用身份删除无依赖供应商和 PI、改变报价状态成功。修复必须在这些入口新增 active CRM 检查，或在实际表写入前统一拒绝。

Auth 管理函数 `supabase/functions/users/index.ts:209` 设置 ban_duration，并在243同步 sales.disabled。停用登录/刷新与已有JWT的数据库授权是不同层；本次直接模拟JWT claims验证数据库层，未对真实 Auth 服务断言令牌撤销延迟。

## 修复注意：工作台对策略形状有白名单

`29_workbench_state.sql:75-88` 的 romiku_wb_manage 要求 UPDATE permissive policy 为 true，并拒绝任何 restrictive UPDATE/ALL policy。简单把 true 改 active 或新增 restrictive policy 会令有效用户工作台也被拒绝。必须一起修订这段形状检查并保留对其他新增限制策略的 fail-closed 行为；或者采用写入前 guard trigger，使现有工作台策略检查不变。

建议最小安全补丁：业务表写入 guard 统一拦截 authenticated 且非 active 的请求（包括 SECURITY DEFINER 的实际写入），并给公开写RPC补齐入口 active 检查。保持服务端可信角色路径；保留当前函数 owner/ACL，不重授予 PUBLIC。仅用 current_user 判断调用者会在 SECURITY DEFINER 中失效，应使用 current_setting('role') 与 auth claims组合。不要以回退删除 guard 的方式重新开放漏洞；修复失败应冻结受影响写入并向前修正。

## 可重跑命令

```sh
docker exec -i romiku-prod-backup-restore-20261106b psql -X -h /tmp -U supabase_admin -d romiku_health_permissions_20261111 -v ON_ERROR_STOP=1 -f - < supabase/tests/romiku_health_permissions.test.sql
```

注意 psql 退出码0不代表 pgTAP通过；应读取 finish 的失败计数。文件是事务内合成数据回归，最终ROLLBACK，不要求清除业务数据。

## 覆盖边界

已实跑主要表 CREATE/UPDATE、两个删除 RPC、批量状态 RPC、工作台拒绝与产品辅助拒绝。未穷举所有明细表DELETE、所有RPC参数组合、并发、真实PostgREST HTTP请求或远端部署状态；SQL使用与PostgREST相同的authenticated角色和request.jwt.claim，验证真实grant/RLS/trigger/function路径。新增补丁需两位active用户正向用例、anon、disabled、outsider、service_role以及工作台既有安全回归后再集成。

## 已完成的本地最小候选（等待集中授权，未部署）

新增 `supabase/schemas/33_active_business_writes.sql` 与内容一致的增量 `supabase/migrations/20261111090000_active_business_writes.sql`。SHA-256：`23f3158ff907c3d2edabb9114aac40810e6c76a1264fb085ae08e6a827c03b3d`。

对象：1 个新 SECURITY INVOKER trigger function，20 个新 BEFORE INSERT OR UPDATE OR DELETE row triggers。20表为 quotes、quote_items、quote_versions、pis、pi_items、orders、order_items、payments、suppliers、supplier_contacts、production_orders、production_items、production_followups、production_barcodes、packing_lists、packing_items、website_inquiries、website_inquiry_items、website_inquiry_followups、manual_tasks（全部带romiku_前缀）。不重复修改已修复的产品辅助三表，不修改工作台专用表。

caller 使用 `coalesce(nullif(current_setting('role', true), 'none'), session_user)`，在 SECURITY DEFINER RPC 内仍保留客户端 SET ROLE 来源，不能使用已切换为函数owner的 current_user。anon 写入拒绝；authenticated 必须通过已有 sales-backed `romiku_wb_active()`；service_role/内部角色保留原本grant/RLS规则。新增函数从PUBLIC/anon/authenticated撤销EXECUTE，客户端无法作为普通RPC调用；触发器调用不依赖客户端EXECUTE。没有改变既有对象的owner、ACL或RLS形状。

实际本地验证：扩展后的权限文件 **109/109** 通过（含 disabled、outsider、anon、两位active、service_role；quote_items直接CREATE/UPDATE/DELETE及两种身份受控DELETE补充覆盖）。已有 `romiku_workbench_security.test.sql` **23/23**；`romiku_product_auxiliary_security.test.sql` **55/55**。三套最终均ROLLBACK。基线39断言的32失败记录是在补丁前完成；最终109测试扩展了正向和明细删除，数字不可直接当作同一套前后总量。

补丁拦截的是实际写入：旧RPC捕获42501时可能返回DELETE_FAILED或批量 failed 数组，不保证统一UNAUTHENTICATED错误码；未对RPC做行为兼容性更大的入口重写。实际防写由表trigger完成。

## 正式环境静态证据与限制

主审计提供的本地只读产物 `system-health-20261111/evidence/production-audit.json`：本候选20目标表均出现在正式Catalog，其中47条INSERT/UPDATE/DELETE策略仍为宽true表达式，authenticated grants亦存在。因此正式结构与本地发现的权限缺口一致。本子任务没有连接正式环境或在那里写入测试数据。此Catalog没有捕获delete_supplier/delete_record/batch_status的函数定义，不能把这三个RPC的正式函数实现宣称为已核验；它们的真实写入验证仅在本地克隆。

PENDING：其余明细/条码/手动任务每个动作的完整行为矩阵、所有业务RPC及服务端批处理/导入路径、真实PostgREST/Auth会话、全部已有历史pgTAP套件。正向矩阵覆盖两个有效用户的主业务CREATE/UPDATE、报价明细CRUD，工作台manage，受控PI/供应商删除；没有宣称全系统每接口均验收。

不覆盖：仅SELECT数据可见性、未列入20表的客户/外联/配置等模块。guard没有修复停用用户读取历史业务数据；新业务表未来必须显式接入。不要将本候选描述为全站权限问题已全部修复。

回退原则：未授权部署前保持候选独立；一旦部署出现兼容问题，应暂停受影响写入并前向修订guard/调用路径，不建议DROP trigger恢复原有缺口。数据库事务应用失败可以整体ROLLBACK，不改业务行。


## 全套SQL集成复验与真实兼容性修正

最初guard把caller判断和wb_active()放在同一个布尔表达式，服务端网站入站RPC以受限definer owner运行时，SQL表达式权限检查仍要求该owner有wb_active EXECUTE，导致service_role入站失败。最终候选改为PL/pgSQL独立 IF caller=anon / ELSIF caller=authenticated 分支，只有authenticated分支才求值wb_active；不新增任何现有函数授权，不改变拒绝逻辑。最初候选hash已废弃，本文SHA256为最终分支修正版。

23个历史测试文件补齐合法authenticated会话的 request.jwt.claim.role=authenticated，与PostgREST实际JWT一致，保留负向uid测试。工作台refresh的disabled错误文本精确更新为新guard文本（42501断言保留）。calendar旧fixture把订单默认draft作为交付待办，显式设confirmed适配现有终态/草稿过滤规则，原有10事件/8来源断言保留。

本地system_health_20261111没有supabase_realtime publication，因此按既有31_workbench_refresh.sql要求在本地建立仅包含refresh表的publication。服务器wal_level不足logical的警告意味着本次仅验证publication目录配置，未验证实际realtime订阅投递。未修改远端环境。

最终全量本地复验：**38个SQL测试文件，1556个通过断言，0失败文件，0 SQL执行错误**。结果与逐文件日志位于 `/private/tmp/system-health-sql-recheck/summary.json` 及同目录。包括网站入站、询盘快照、工作台refresh、权限109项与新工作台回归；所有测试以ROLLBACK结束。命令为本地Docker psql执行每个 `supabase/tests/*.test.sql`，开启ON_ERROR_STOP并同时扫描pgTAP `not ok`，未仅依赖psql退出码。
