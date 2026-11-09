# 订单状态兼容检查与本地验收

## 基线及范围

基线：228ce4a5a134294e6ce75662c6c3dddb94fb4ce3。
分支：codex/order-status-flow-20261109。
订单主流程：待确认 → 已确认 → 已排产 → 待发货 → 已送货 → 待收款 → 已完成。
既有内部值保持不变，新增 awaiting_payment，取消、作废及历史记录保留。
不自动推进状态；不修改历史订单、客户确认、定金确认、收付款事实或日期。
“已送货”是用户要求的状态显示名称，不根据该状态补写 actual_delivery_at。

## 依赖审计

|模块|结果|
|---|---|
|订单列表、详情、创建、筛选|统一 workflowStatus；保存白名单来自同一配置，新增 awaiting_payment；PI 不允许该状态|
|客户业务历史|原通用标签造成旧名称/英文显示，改用订单专属标签|
|客户订单统计|唯一遗漏为 RPC summary.in_progress 固定状态清单；增量增加 awaiting_payment|
|工作台显示/筛选|复用订单状态标签，保留通用 draft 以免改变 PI/装箱草稿显示|
|工作台应收|依实际余额与独立客户确认，无需变更；待收款不自动完成定金，已完成仍欠款不隐藏|
|全局搜索、客户单据列表|按 resource_type 读取统一标签；SQL 状态筛选使用等值匹配，无白名单遗漏|
|生产、交付及日历|生产子单状态独立；交付提醒仍依实际日期；不改生产状态、日期或财务逻辑|
|订单状态历史|原值保持，取消/作废保留；状态审计回归通过|
|网站询盘/API|未发现需变更的订单状态白名单；不改 API|

## 必要增量迁移（仅本地执行，远端待授权）

文件：supabase/migrations/20261109140000_order_awaiting_payment_summary.sql
SHA-256：134fa82eac545d26c937f3e79f1139eec1bd637a299cc0226a96e6c0281c109a
仅 CREATE OR REPLACE 现有 romiku_customer_business_history(uuid,integer,integer,text)，修改一个统计谓词。
不新增表或字段、不改 RPC 签名、owner、ACL、SECURITY INVOKER、search_path、RLS 或业务记录。
声明式 schema 同步更新；已执行历史迁移不修改。

Preview 执行前需核对真实 Ledger、函数定义与权限；以单独事务执行 SQL 和 Ledger 写入，失败回滚停止。
不能把更新数据库函数称为“不需要 Migration”。目前已申请一次明确 Preview 授权，未执行远端修改。
回退优先保留兼容统计函数并回退前端；不删除新状态记录、不恢复漏算统计。
Production 不在本次授权范围。

## 验证证据

- 新增 SQL 在修改前确实失败（待收款 in_progress 得0，预期1），修改后15/15 PASS。
- 本地原始备份克隆隔离库 order_status_20261109；原恢复库保持不变；QA 测试事务全部回滚。
- RPC owner/ACL/security mode/search_path 应用前后逐项相同。
- 客户历史39、状态审计63、工作流79项SQL回归全部 PASS；合计196项。
- 旧 SQL 测试最初缺 request.jwt.claim.role 导致 FORBIDDEN；补齐 authenticated 测试会话声明后通过，未改变断言或安全策略。
- 前端新增历史标签3案例、手工状态保存、PI拒绝、金额不变及订单列表筛选回归通过。
- 完整自动测试：1452 PASS、8 FAIL、3原有SKIP；没有新增skip。
- 8项失败在精确基线独立临时副本复现：pending-deploys 7项因 URL.pathname 中 %20 未解码；check-config-sync 1项 matcher/config 断言失败。均未修改这些辅助工具。
- Typecheck、Lint、Build、PWA PASS。构建保留既有 chunk/circular-export/Browserslist 警告，Lint 保留 .eslintignore 弃用警告。
- Preview真实页面验收 PENDING：待统计函数迁移授权后开展；不将本地 Chromium 测试称为 Preview 验收。

## 结论

本地候选已准备；Production No-Go，必须先完成 Preview 迁移与真实页面联动验收。
Production 数据库、业务数据、权限、环境变量及正式网站均未修改。
