# 2026-11-04 安全补充（优先于原稿同名规则）

本轮仅本地实施与验证。Preview/Production migration和Production发布均未授权。原review.sql保留首行异常保护，不可执行。

## 1. 七天边界
统一Asia/Shanghai业务日期D：近期日期窗口为[D 00:00,D+7日00:00)，即今天及随后6天，共7个自然日。例2026-11-04覆盖11-04至11-10，11-11不在窗口。逾期为<D00:00；逾期项另外纳入重点，不能被窗口下界隐藏。DATE直接按业务日期比较，timestamptz先投影上海日期。跟进日期<=D为已到跟进日。

## 2. 一个请求多个事件
新增romiku_workbench_requests请求账本：request_id UUID主键、actor_id、action、entity_type/id、payload_hash、result、created_at；一个请求可有多个events，events独立UUID主键及(request_id,event_index)唯一，event_index从1递增。取消原events.request_id全局唯一。
请求hash按服务端jsonb规范化参数计算，包括预期版本、原因、证据指纹，不含客户端actor。首次请求在事务内取得request_id advisory lock，权限检查后比对已存在请求的actor/action/对象/hash；同用户同内容返回缓存结果，其他情况报冲突且不泄漏结果。未提交请求不留下成功记录；响应丢失可原ID重试。已经成功后的新操作使用新request_id。
同RPC触发的客户确认变化、定金失效、跟进变化分别记event_index，全部同事务。审计事件、请求和证据不能由客户端UPDATE/DELETE。普通金融写入口触发失效时由服务端生成request_id，单个源行变更及其所有衍生事件共用该ID；批量源行更新可生成多个请求，记录同一txid关联，不能声称等同客户端业务幂等。原金融RPC幂等契约不被本轮重写。

## 3. 覆盖所有写入口
以数据库表触发器覆盖所有入口，不以UI按钮名单代替安全保证。盘点payments INSERT/UPDATE/void RPC/禁止DELETE；orders 金额/币种/定金比例/status/archive；order_items INSERT/UPDATE/DELETE/移动父单；转换/批量/通用provider及生产工作区保存。证据任意实质变化、删除尝试、金额来源变化均纳入测试。父单锁，状态锁和重新读取证据防止陈旧提交；金融旧函数锁序造成死锁时整事务失败，不自动重放付款。
失效与原写入同事务；审计失败必须连同源写入回滚。付款删除既有禁令保持，不能为测试放宽。

## 4. 权限
专用NOLOGIN NOBYPASSRLS角色，不拥有原业务表；只能通过固定函数使用权限。全部读/写RPC、直接新表SELECT及审计SELECT均验证有效未disabled的sales。anonymous、禁用、无CRM身份拒绝；不存在“仅按钮隐藏”。依父表RLS决定可见，对写操作另校验UPDATE资格。RLS变化属于阻断检查。公开函数清空search_path、限定对象名、白名单动作，私有函数不授予客户端执行。

## 5. 回退包
在新前端发布前产出独立rollback构建：关闭旧优先待办和旧交期修改入口，保留其他模块；服务端仍拒绝无版本令牌的日期UPDATE。新建生产单首次INSERT与日期未变化的普通保存保持允许。不得靠前端只读代替数据库拒绝。Preview真实演练需后续授权：同一迁移后数据库先新前端，再回退包；验证旧日期PATCH拒绝、新状态审计不丢、其他模块可读写。本轮仅本地验证及准备演练步骤，不能宣称Preview回退PASS。

## 6. 历史可见性
无附属状态行有效unknown，不回填。历史unknown且有未收（包括draft）显示独立核实列表、数量、按币种潜在应收总额。统计在全量可见数据上计算后分页，不能只统计第一页。cancelled/voided/archived入历史视图；confirmed+draft仍不生成常规催收，保留可查草稿。测试分页、币种、过滤、两个用户RLS、禁用用户、刷新和金额变化。

## 7. 本地实现后的收紧
- 受控动作仅接受 READ COMMITTED；REPEATABLE READ / SERIALIZABLE 拒绝并要求重新打开事务。双连接实测旧快照 + 并发付款修改不能提交陈旧确认。
- 受控接口统一为 `romiku_workbench_action(action,id,revision,request_id,payload,reason)`，不是动态 SQL；action 严格白名单。读取拆分为 snapshot、verification_list、receivables。两处 UI 必须调用同一接口并失效相同查询缓存。
- 撤销定金确认保留原事件，以新事件 `reverses_event_id` 指向原接受事件；重新接受必须重新校验当前证据。
- 既有父关联不可变触发器拒绝付款/产品行移动父单，因此普通单行失效最多涉及一个订单。批量多行以 transaction_id 关联，不能把它声明为一个客户端幂等请求。
- 既有有收款订单的 currency 修改仍被拒绝，不能为测试失效机制而放宽它。
- 旧生产工作区创建是 INSERT 后 UPDATE 日期；本轮仅将首次日期放进 INSERT，精确匹配原函数片段后修补，未知定义必须报错。已有生产单日期变化仍须新版 RPC。
