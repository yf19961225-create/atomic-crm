# 本地代码写入口审计 — cc1b16b

| 入口 | 最终写表 | 覆盖策略 |
|---|---|---|
| OrderPayments provider.create/update | romiku_payments INSERT/UPDATE | 数据库行触发器；所有有效证据实质字段变化失效 |
| romiku_void_payment | romiku_payments UPDATE status/void字段 | 同事务触发失效；保留原函数及禁止删除规则 |
| 裸DELETE/受控删除订单连带付款 | romiku_payments DELETE | 原financial history guard禁止；新逻辑不得绕过 |
| Order编辑/通用provider/归档/作废/bulk状态 | romiku_orders UPDATE | total来源、currency、deposit_percent、draft/void/cancel/archive变化失效 |
| Order行保存、导入/复制/删除、转换创建 | romiku_order_items INSERT/UPDATE/DELETE | 父order_id两侧按UUID锁；影响金额时失效 |
| Quote/PI转Order | 新orders/items INSERT | 无旧人工确认；不得虚构confirmed状态 |
| 生产工作区RPC/普通provider/批量编辑 | production_orders factory_due_at UPDATE | 无新受控角色与revision校验的一律拒绝日期变更；其他字段保持 |
| 新建生产单 | production_orders INSERT | 原日期允许；状态读取默认；无既有日期覆盖 |

检查方法：全文检索src及supabase/schemas，不只检查UI。服务端触发器覆盖REST和RPC落表路径。SQL测试需以实际最终表的所有写操作为准。

已知兼容点：旧void_payment先锁付款，确认动作先锁父单；不改原金融RPC，允许数据库死锁检测整事务回滚，严禁吞错误后返回成功。旧生产工作区RPC带日期变化会被拒绝；安全回退需禁用该日期编辑。

新本地测试库从既有本地合成schema库建立，初始orders=0，migration ledger=0（此前schema测试库并非线上ledger镜像）；不得把它当作Production ledger预检证据。
