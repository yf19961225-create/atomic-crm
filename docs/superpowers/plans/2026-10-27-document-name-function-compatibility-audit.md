# 单据名称 migration：函数差异与兼容审计

日期：2026-10-27（Asia/Shanghai）  
分支：`codex/five-feature-workflow-optimization`  
开发基线：`6e509f09c9b5bdb31c478cfae0921ceadc2b99dd`  
旧候选保留：`e4ed6e85f2e998746346cb9c5dd43679c6513f44`

本次只修复旧候选 migration 的兼容性，不改前端业务规则。不执行远端 migration，不推送会触发部署的分支，不部署依赖新字段的 Preview。

## 1. 只读取证

通过 Preview SQL Editor（project `ciwaibtotispazfviims`），以 `BEGIN TRANSACTION READ ONLY` 查询并 `ROLLBACK`，导出三个函数完整 `pg_get_functiondef`、identity arguments、ACL、owner、search_path，以及 29 条相关用户触发器。没有调用业务 RPC 或写业务表。

| 函数 / 签名 | Preview 属性 | 来源证据 |
|---|---|---|
| `romiku_assign_number()` → trigger | SECURITY DEFINER，search_path=''，owner postgres；postgres/service_role/authenticated EXECUTE，anon/PUBLIC 无授权 | prosrc 与 `20260930120000_pi_number_prefix.sql` 完全一致 |
| `romiku_next_daily_document_number(kind text, prefix text)` → text | SECURITY DEFINER，search_path=''，owner postgres；仅 postgres EXECUTE | prosrc 与 `20260930120000_pi_number_prefix.sql` 完全一致 |
| `romiku_convert_document(source_kind text, source_id uuid, target_kind text)` → uuid | SECURITY INVOKER，search_path=''，owner postgres；postgres/authenticated/service_role EXECUTE，anon/PUBLIC 无授权 | prosrc 与 `20261025150000_commercial_unit_price_entered.sql` 完全一致 |

未发现这三处差异需要用 Preview 独有的 `20261015120000` 解释。完整定义与已知历史 migration 相符；没有证据指向未记录的手工修改。

## 2. 逐项差异与处理

| 差异 | Preview | 仓库基线 / 旧候选 | 来源、作用及风险 | 本次处理 |
|---|---|---|---|---|
| 非商业编号补零 | 固定 `lpad(nextval::text,6,'0')`，读取 prefix | 基线读取 prefix、min_digits，使用 `greatest(digits,length(sequence_value))`；旧候选会覆盖 Preview | `20260930120000` 与 declarative schema 不同步；仓库长编号保护可追溯至 `35417e6`。替换会改变 Packing/Inquiry 等共享调用者 | migration 不再替换 assign_number，保留各环境原样 |
| 长编号 | 固定长度存在截断风险 | 仓库保护超过最小位数的长编号 | 既有差异，非本轮名称能力；不宣称已修复 Preview 的历史风险 | 两套基线分别测试短/长输出迁移前后相同；仓库长编号保护不回退 |
| 商业单据 INSERT | Quote RFQ / PI PI / Order OD，调用每日分配器；拒绝显式传入编号 | 业务逻辑相同 | 触发器在 BEFORE INSERT 分配，非首次 UPDATE 分配 | 保留函数、触发器名称、TG_ARGV 和 INSERT 次序 |
| 每日 date_key | 使用已算出的 `local_date` | 再次使用 `(now() at time zone 'Asia/Shanghai')::date` | `now()` 事务内固定；语义等价。两边均按上海日期、事务 advisory lock、表最大值与 counter 防碰撞，均使用三位 lpad | 不替换每日函数；旧候选原本也没有替换该函数 |
| 商业 UPDATE | trim + 非空检查，允许改编号 | 旧候选把商业不可修改分支嵌入共享 assign_number | 本轮需要的唯一编号行为变化，但不应改变共享生成器 | 三张商业表独立 BEFORE UPDATE guard；原编号触发器仅改为 BEFORE INSERT，避免名称更新 trim 历史编号 |
| 转换函数大小写/空白/注释 | 历史 migration 原始格式 | schema SQL 关键字大写，增加一条说明 header lock 的注释，动态 SQL 格式不同 | 完整逐行审阅：没有实质业务差异；此前 byte/whitespace 不一致不能等同于业务冲突 | 保留实际已部署转换函数内容，只在 header INSERT 和 SELECT 投影各增加 document_name |
| 转换名称 | 未复制 | 旧候选新增两处 document_name | 本轮必要变化 | 保留；新增 preflight 仅接受两份已审计函数 body，未知定义先报错，不覆盖 |

额外说明：两套每日编号函数现有三位 `lpad` 逻辑完全不动。本轮不重设计编号上限、补零或 overflow 行为。

## 3. 触发器与调用链

- Quote/PI/Order 的 `romiku_number` 原为 BEFORE INSERT OR UPDATE；INSERT 调用参数分别为 Preview `('quote','Q')`、`('pi','PI')`、`('order','SO')`，实际商业 prefix 由函数内分支确定。
- migration 从三张固定表读取原触发器定义，检查函数 OID、row/before/insert/update 类型、enabled 和无条件；仅将事件缩为 INSERT，原名称/参数不变。
- 新 `romiku_document_number_immutable` 在三张表 BEFORE UPDATE 比较 `IS DISTINCT FROM`，变化报 23514，不 trim、不重编号；同值与仅名称更新通过。
- 既有 audit、workflow、source、financial、payment currency、status、order instructions 等触发器不改。名称 guard 不在 INSERT 路径运行。
- 非商业表触发器完全不动。Production 现有独立 `romiku_assign_production_number` 也不改。
- 转换：允许 Quote→PI/Order、PI→Order；源 header `FOR UPDATE`，item 写入沿用 parent lock；目标 INSERT 不传 document_number，由原 BEFORE INSERT 自动分配新号。
- 保留 source_quote_id/source_pi_id、source_quote_item_id/source_pi_item_id、客户/银行/条款快照、语言、日期、运费折扣、价格状态、客户货号、产品/装箱快照及 position。目标 UUID 和正式编号独立生成。
- Converter 保持 INVOKER、原 ACL、空 search_path，RLS 不变；没有权限提升。

## 4. 最终 migration 范围

仍只有 `20261026150000_commercial_document_names.sql`，尚未远端执行：

1. 首先验证转换函数是已审计基线（两份 body hash）且仍为 INVOKER + 空 search_path。未知定义立即停止。
2. 三张商业 header 新增 nullable `document_name text`，无默认值、无 backfill。
3. 新增独立编号 UPDATE guard，三张商业表原编号触发器保留 INSERT，其余表不变。
4. 转换仅增加名称投影；不改 UUID、价格、快照或编号机制。
5. 名称搜索、生产母单名称字段、三张 totals view 增加名称保持旧候选已测逻辑；保留 RLS/分页/排序/公式/列顺序/ACL。
6. 不包含任何业务数据 UPDATE/DELETE，不重写历史名称、编号、品牌或金额。

## 5. 本地验证

隔离 Docker 数据库：`romiku_names_compat_repo_20261027`、`romiku_names_compat_preview_20261027`。没有远端业务数据复制。

- RED：旧 migration 在 Preview 函数副本上出现 3 个预期失败（覆盖 assign_number、未拆 INSERT 事件、缺少独立 guard）。
- GREEN：两套基线分别通过 13 项 migration 演练断言：两个编号函数 definition/ACL/config 原样、历史 header 内容不变、触发器范围正确、短/长编号输出不变、三张 view 安全属性/ACL 不变、转换函数安全属性/ACL 不变。
- 两套基线各运行全部 28 套 SQL：全部 PASS。
- 名称/转换测试 39 项 PASS；独立编号/历史长编号/空白保护 7 项 PASS。
- 未知转换函数故障注入：拒绝 migration 且函数保持不变，2 项 PASS；事务回滚。
- 完整前端：1347 PASS / 0 FAIL / 3 skipped，含实际 Quote/PI/Order XLSX 生成与正式编号校验及五类 XLSX 回归。
- typecheck、lint、build、PWA cache：PASS。
- 初次 SQL 双基线重建漏恢复依赖 view 和 ACL，导致测试环境错误；修正本机 bootstrap 后全量重跑通过，没有调整业务逻辑或放宽断言。
- 独立代码审查无阻断项；补测了 reviewer 建议的未知转换函数拒绝路径。

## 6. 发布边界

完成后再次只读预检 Preview，结果另存进度记录。需要用户单独授权才能执行该 Preview migration；依赖字段的前端尚未部署。Production/Sanity 不访问、不修改。本报告不是 Production 发布结论。
