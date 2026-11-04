# Workbench controlled actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** 在本地证明状态、金融证据失效、权限、请求幂等及安全回退，再提交Preview迁移审批。
**Architecture:** 独立状态表、请求账本和不可改审计；受限执行角色RPC；数据库触发器保证旧写入口同步失效；工作台只读派生。
**Tech Stack:** PostgreSQL/Supabase、React/TypeScript、Vitest、pgTAP。
**Spec:** docs/superpowers/specs/workbench/2026-11-03-workbench-design.md + 2026-11-04-safety-addendum.md

## Global Constraints
- 本地独立数据库；禁止任何远端migration/部署/业务写入。
- 原review.sql不可执行。完整migration和schemas保持一致。
- Asia/Shanghai窗口[D,D+7)，逾期另外纳入。
- 不改金额/付款记录/历史日期；状态不回填；只用合成QA。
- Preview回退实际演练必须等待授权，本轮不可宣称PASS。

## Review Focus
- 一个请求多事件与重试：Task2测试同ID重放与不同payload冲突。
- 旧金融入口和确认竞争：Task3双连接测试，不允许陈旧覆盖。
- 禁用用户直接REST读取：Task2验证表策略和RPC均拒绝。
- 跨月/UTC当天边界：Task1测试上海零点和第七日排除。
- 历史unknown跨分页计数：Task4全量计数后分页测试。

### Task 1: Audit and business date contract
**Files:** docs/superpowers/specs/workbench/write-entry-audit.md; src/components/romiku/workbench/businessWindow.ts; businessWindow.test.ts
**Interfaces:** businessDate(instant:Date):string; inRecentWindow(value:string,now:Date):boolean; value DATE或ISO timestamptz。
- [ ] 盘点provider、金融RPC、转换、订单产品行和生产交期写入口及最终表。
- [ ] 写测试：上海11-04零点包含、11-10包含、11-11排除、11-03逾期由另一判定处理。
- [ ] 运行测试确认缺实现FAIL，实现最小函数，运行定向测试PASS。

### Task 2: State/request/audit/security migration
**Files:** supabase/schemas/29_workbench_state.sql; supabase/migrations/20261104100000_workbench_state_and_audit.sql; supabase/tests/romiku_workbench_security.test.sql
**Interfaces:** request_id→多个有序event；受限executor；新状态有效默认unknown。
- [ ] 新独立本地数据库装载基线schema，不读取Production数据。
- [ ] 写pgTAP测试，确认对象缺失失败。
- [ ] 实现五表、角色、RLS、权限、身份/业务授权、幂等请求原子处理。
- [ ] 验证双用户、anon/禁用/无sales、不可见对象、直接写审计拒绝、同请求多事件及重试。

### Task 3: Controlled mutations and invalidation
**Files:** supabase/schemas/30_workbench_actions.sql; supabase/migrations/20261104110000_workbench_actions_and_invalidation.sql; supabase/tests/romiku_workbench_actions.test.sql; supabase/tests/romiku_workbench_concurrency.mjs
**Interfaces:** 正式稿第8节RPC；expected_revision与fingerprint；所有金融源变更触发失效。
- [ ] 写合成2913/3000、撤销、修改、金额项变动、100%、零余额、日期版本拒绝测试，先FAIL。
- [ ] 实现完整RPC、源触发器和受控撤销，保留原金融函数。
- [ ] 双连接竞争：付款与确认/日期与日期/重复request，全部无错误状态提交。
- [ ] 失败注入：审计失败导致源写入回滚。

### Task 4: Read projection and local UI/rollback
**Files:** src/components/romiku/workbench/workbenchState.ts; workbenchState.test.ts; WorkbenchMaintenance.tsx; production/productionWorkspace.ts; scripts/build-workbench-rollback.mjs
**Interfaces:**只读RPC输出待核实统计、当前收款阶段、生产分组；回退构建不显示旧任务、不允许改交期。
- [ ] 先测unknown历史跨分页、币种、RLS，回退禁入口但其他模块保留。
- [ ] 完成读取和最小前端接口，生成回退包；本地新数据库实际拒绝旧日期PATCH。
- [ ] 记录Preview新前端→回退包演练步骤，不远程执行。

### Task 5: Review and gate
- [ ] 完整SQL回归、frontend、typecheck、lint、build、PWA；保存命令、结果和局限。
- [ ] 独立分支最终审查；完整Migration哈希及对象diff。
- [ ] 报告实际完成范围；停在Preview migration授权之前。
