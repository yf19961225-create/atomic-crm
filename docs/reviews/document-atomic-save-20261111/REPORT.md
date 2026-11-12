# 四类单据事务保存：本地最终报告

## 结论

本地实施、权限/事务/并发验证及 Preview 迁移准备已完成。**可申请指定 Preview 增量 Migration；Production 仍为 No-Go，须先完成获授权后的真实 Preview 验收。** 本轮没有远端 Migration、部署、业务写入或 Production 请求。

基线：`04dbc592b3b469e9b1bf3948f392bd55c4d17c3c`。最终候选提交由本报告所在 Git 提交标识；精确 SHA 在交付回复中列出。

## 原风险与修复

| 单据 | 原保存风险 | 本地实现 |
|---|---|---|
| Quote | 表头先提交，产品逐条删改增；响应丢失可重建；旧草稿覆盖；询盘来源创建无持久请求回执 | 表头/产品完整差异在一个RPC事务；持久请求、版本CAS、询盘来源包装 |
| PI | 表头与产品分请求；来源复制无请求幂等；无服务端编辑版本 | 同一事务协议，保留PI实际字段、来源及金额规则；来源版本锁定 |
| Order | 表头金额条件与产品逐步提交；失败可能留下部分金额/审计/定金失效；旧编辑覆盖 | 保留付款/币种/作废/生产分配触发器，在同事务更新并返回规范快照；不创建虚假收款、不改财务规则 |
| Packing | 创建表头后逐行导入；产品逐条保存；不明结果重试重复；跨装箱单争用剩余量 | 创建表头和来源行一次提交；产品完整差异一次提交；Order先锁、Packing后锁及来源行排序锁；箱规计算和容量约束保留 |

装箱表头与产品区保留现有独立“保存”操作，每次保存自身完整变更是单事务；两个区域同时编辑后，另一区的旧revision会安全冲突，不静默合并。其他已完成模块没有重做。

## 幂等、并发与恢复

- 持久回执表唯一键 `(actor_id, request_id)`，数据库JSONB规范内容SHA-256；相同已提交请求返回原结果，异内容复用已提交ID拒绝。
- 四表新增单调revision，更新/产品写入及既有可信业务动作都会推进版本。过期版本PT409拒绝。
- 服务端统一顺序锁与实际两连接验证，不能用客户端内存标记替代。
- 客户端发送前保存精确请求，网络不明先查询原结果；用户明确重试才复用同ID及原payload。刷新后可查询或按原内容重试，不重新生成时间、行ID和编号。
- 修复查询旧结果覆盖新草稿、装箱二次拒绝后旧结果覆盖新输入、保存后旧props回填的问题；新增真实Chromium回归。
- 只读快照锁住表头，避免混合新表头/旧产品；列表日期/状态及订单生产要求编辑兼容新RPC。
- 旧无版本直接REST及旧转换入口被拒绝；不能把旧可写前端当作兼容回退。

## Migration 与权限影响

唯一新文件：`supabase/migrations/20261111120000_document_atomic_save.sql`。

SHA-256：`187854b764ba5e24e29079c338d4f5a5ca30dfadd9a86c67300ce02ab98010a6`。

声明式同步文件：`supabase/schemas/34_document_atomic_save.sql`，同哈希。未修改历史Migration。

- 1个持久回执表、1个NOLOGIN/NOINHERIT/NOBYPASSRLS执行角色、4个revision列、9个函数、12个触发器、13条新策略。
- 原6函数必要兼容调整：两个纯触发器执行上下文、批量状态/归档/客户归档的安全门、工作台适用策略检查。11个既有辅助/转换函数新增专用执行角色EXECUTE。
- 客户端现有权限未扩大；执行角色不继承authenticated、没有auth schema USAGE。
- `postgres`不能授予auth schema USAGE，采用两个固定只读身份辅助函数；原审计/有效用户触发器函数体不变，仅改为definer上下文。实际非超级用户迁移通过。
- 额外restrictive或改变的适用RLS策略触发失败关闭，不借executor绕过原权限。

精确对象Diff见 `post-migration-existing-object-diff.json`、`final-rehearsal/new-object-catalog.json`；完整契约和回退限制见 `server-contract.md`。

## 测试结果

| 项目 | 结果 |
|---|---|
| 新事务/权限/失败注入SQL | 129 PASS |
| 原有SQL业务回归（含全部Workbench） | 1575 PASS |
| 最终统一SQL复跑 | **42套 / 1704 PASS / 0 FAIL** |
| 真实双连接并发 | **14 PASS** |
| 非超级用户postgres迁移 | PASS |
| 4处函数owner转移失败注入 | 全事务回滚，临时权限无残留 |
| 新角色临时SET/Schema CREATE清理 | PASS，既有ADMIN关系不误删 |
| 本地49张原public表数量/内容指纹 | 不变；新回执表为空 |
| 完整前端/服务端测试命令 | **1508 PASS / 8既有FAIL / 3原有skip** |
| Typecheck / Lint / Build / PWA | PASS |
| 真实Preview新功能验收 | 未执行：等待Migration授权 |

失败注入覆盖四类表头写入后、产品删除后及新增行后；断网、提交后响应丢失、精确重试、异内容ID拒绝、重载恢复、双编辑器冲突、编号唯一、来源不可改、外键行ID保留、币种冻结、定金失效、装箱容量及金额/重量/CBM均有对应证据。

完整测试的8失败仍是原7项 `pending-deploys` 空格路径问题及1项 `check-config-sync`，名称与保存的基线日志集合完全一致。没有新增skip、删除安全断言或虚报全绿。SQL旧业务断言改为调用真实事务RPC；仅测试fixture使用隔离授权准备，测试都ROLLBACK。保留最初失败日志与最终日志，明确区分。

浏览器测试使用真实本地Chromium与显式FakeRest事务模型，验证页面操作/草稿/请求行为；数据库事务和权限结论来自实际PostgreSQL，而非FakeRest。尚未将新RPC安装到Preview，不能宣称云端完整联调通过。

## Preview真实状态及备份

本轮只读捕获：项目 `ciwaibtotispazfviims`，Ledger **77**，新role/回执表不存在。相关91函数、230列、821grants、125policies、314constraints、109triggers已对照本地克隆；修正克隆自身的3处历史差异后，迁移前目录差异为0。没有为了对齐本地而修改Preview。

原加密归档可读，1,165,680字节，SHA-256 `a1640737a7b10b0ebaae9b6356dbe48f3c56a977cee3fbf9625215dc7ffd1e89` 匹配。不重新备份。恢复点为2026-11-04，不包含后续新增数据；完整Supabase恢复仍PARTIAL。本次迁移必须同事务含Ledger，提交后保留新状态/回执并优先前向修复，不整库恢复覆盖新业务。

## Storage边界

四类核心保存RPC不调用Storage/外部服务。订单唛头图片仍是先上传后引用的独立操作，数据库失败后草稿保留同一不可变文件路径，可复用重试。放弃草稿可能留下未引用文件；不自动删图，不将Storage声称为数据库事务的一部分。任何清理需检查历史引用并另行受控执行。

## 下一步唯一需要的授权

批准上述**唯一精确哈希Migration在Preview执行**，并允许随后部署候选到既有隔离Preview、运行真实双用户/REST/RPC/页面QA。执行前重新核对Ledger及对象；若仍77则预计77→78。不得执行其他Migration或Production发布。

完整执行、权限Diff、回退边界及QA矩阵见 `PREVIEW-PLAN.md`。目前没有剩余已复现但未修复的本地P0/P1；真实远端联调、旧客户端升级窗口与迁移审批仍是正式发布阻断，不能提前判Production GO。

## 文件范围

19个应用/适配代码文件，21个前端测试文件，39个SQL测试/辅助文件，1份新增Migration及1份声明式Schema，3个本地验证工具；其余181个为计划、报告、目录Diff和保留的红绿测试证据。完整清单见 `changed-files.txt`。没有环境变量、Production配置、网站API或历史Migration改动。
