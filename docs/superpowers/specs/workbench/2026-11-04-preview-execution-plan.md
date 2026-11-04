# 工作台 Preview 实施计划（待单独授权）

## 当前状态
本轮仅本地实施。Preview ledger/schema **未取得本轮实际读数**：Chrome 浏览器绑定 Preview SQL Editor 两次返回 `Cannot read properties of undefined (reading timeoutMs)`；无可用 Supabase 管理连接器。没有执行 Preview migration，不能把历史 ledger 或本地 ledger=0 当成当前远端证据。

授权申请与执行 Gate 分开：可以审阅本地候选并授权后续流程，但真正执行前必须取得本节的只读证据。若不能读取，停止，不猜测。

## 前置条件及备份
1. 核实项目 ref 严格为 `ciwaibtotispazfviims`；禁止使用 Production 连接。
2. 执行同目录 `preview-preflight.readonly.sql`。保存完整版本清单、对象定义、约束/RLS/触发器、核心表数量/内容指纹。确认两目标版本未执行、无重名对象/角色冲突。逐项核对 `romiku_save_production_workspace` 精确补丁、已有金融保护及 sales 活跃用户机制；未知差异停止。
3. 复核 caller UPDATE policy 与 M1 `romiku_wb_manage` 支持的策略完全兼容；不能仅以 authenticated 有 SELECT 判定可写。确认两个有效 QA 用户及禁用用户用例。
4. 使用已验证的只读一致性导出流程备份 Preview schema、data、roles、ledger，存入受保护加密位置，记录时间和 SHA-256；恢复演练不得覆盖现有 Preview。不能使用不同时间点碎片拼接为一致性备份。
5. 短暂避免验收期间其他人修改 Preview；迁移前后指纹不同先定位真实并发业务写入，不擅自改回数据。

## 精确执行顺序（当前未授权）
- M1 `supabase/migrations/20261104100000_workbench_state_and_audit.sql`
- M2 `supabase/migrations/20261104110000_workbench_actions_and_invalidation.sql`

最终哈希见同目录 `2026-11-04-ui-local-verification.md`。只能逐份单事务执行，ledger 记录与该份事务绑定。禁止全量 push，禁止重复执行旧 migration。

M1：核验五新表、NOLOGIN/NOBYPASSRLS 执行角色、非客户端成员、FORCE RLS、只读审计权限及旧业务指纹不变。失败即停止。
M2：核验动作/快照/feed RPC、同事务失效、普通交期 UPDATE 拒绝、生产新建 INSERT 兼容补丁、仅新增状态表加入已有 Realtime publication；核对旧函数其他部分未变化、旧记录指纹不变。失败停止，不发布依赖前端，不猜测修复或删审计。
预期 ledger 为“实际核对的 N → N+1 → N+2”，当前不假定 N。

## 同 SHA 的双用户真实验收
- 各创建明确 QA 标记的订单/产品/收款/生产记录，建立 ID 清单；不操作真实已有单据。
- 两用户权限及停用拒绝；2913/3000 → 尾款7087；付款修改/撤销、订单金额变化同事务失效；受控撤销历史保留。
- 两入口同步：同浏览器 BroadcastChannel、跨用户真实 Realtime，以及断开 Realtime 后窗口聚焦/60秒轮询；本地未启动真实 Realtime 服务，此项须在 Preview 实测。
- 两人读取同revision后提交不同交期：一人成功，另一人409并保留输入；相同 request_id 重试不增加事件。
- 历史待核实、按币种潜在应收、草稿/未确认不催收；全部查询分页/count一致；生产先按 UUID 全量分组再分页；上海今天至+6/收款跟进<=今天边界。
- 四类交期、重复点击、失败提示、刷新/重新登录、390px 布局、主要模块及普通生产保存回归。

## 安全回退演练
先构建同源码、同 API、同 Preview 数据源的 `VITE_WORKBENCH_SAFE_ROLLBACK=1` 完整 deployment；本机 tar.gz 只是本地静态验收包，不能直接作为 Vercel 完整部署。
在同一已迁移 Preview 数据库切到回退前端：旧工作台维护状态，已有交期只读，旧裸 PATCH 被服务器拒绝；订单/收款正常读取，普通非日期修改与新建原初日期正常。核对状态/审计指纹不丢失，再切回新前端。不得 DROP 新表、关闭保护或撤回 migration。

## 清理及隔离
记录 QA 数量、ID 和关联；仅通过既有受控删除/撤销清理可清理 QA。金融/审计历史受保护则保留为 acceptance artifact，报告 ID，不强删、不清空审计。保留 request/event 链及测试证据。
验收浏览器与服务端目标均只为 Preview，Production 请求0，Sanity写入0；不触碰 Namecheap/API邮件配置。任何真实数据变更、权限异常、函数漂移均立即停止。
