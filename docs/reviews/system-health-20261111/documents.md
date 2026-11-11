# 单据、装箱、录入与导出审计（Task E/F/G/J）

日期：2026-11-11。基线：68540bb2。仅本地 Chromium/Vitest、FakeRest/mock provider 和真实仓库 XLSX 模板；未访问远端、未连接真实数据库、未执行迁移、未改变财务计算或模板布局。

## 已修复并验证

|级别|问题与证据|最小修改|验证|
|---|---|---|---|
|P1|PI/Order `DocumentPages` 在明细仍 pending、缓存空数组正在刷新或查询失败时允许进入编辑。会以空/旧明细建立编辑会话，随后响应因 editing=true 不再同步；也允许从未完整加载的明细导出。原始 PI 三例实际红测均为编辑按钮未禁用；Order 首轮测试发生标题定位重名，不能计为业务失败。|复用已有 `useDocumentEditSession` 的 readyForEdit 门禁；明细必须成功、非 fetching、非 placeholder、为数组。编辑和导出按钮同步禁用，导出函数也检查就绪。未修改共享 session、财务规则。|新增 `DocumentEditReadiness.test.tsx` 六例覆盖 PI/Order 初载、缓存空明细刷新、错误；加载完成进入编辑后保留 Saved specification。最终六例通过。|
|P2|Packing XLSX G（Qty/Ctn）与 I（Quantity）硬编码 `0`；0.25 数值在文件内存在但 Excel 格式会显示 0。PI/Order G（Qty/Ctn）继承模板 `#,##0`，也会舍入。|Packing G/I 改 `0.####`；PI/Order G 改 `#,##0.####`。保留箱数整数格式、金额格式、所有值和布局。|使用真实模板生成、ExcelJS 重读 XLSX，检查 0.25 数值和格式。PI/Order H 总数量原先为 General，未修改该列。|

首次 XLSX 测试曾把 `undefined` numFmt 当作错误；它实际等价于 General。已修正断言，进一步隔离出真正有问题的 Qty/Ctn `#,##0`。此过程记录在 `documents-red.log`、`documents-fractional-red.log`，不把无效断言当作产品故障。

## 实际运行覆盖

最终命令与结果在 `documents-final.log`：**17 files / 184 tests passed**，真实 Chromium 本地运行。另 `documents-targeted-green.log` 为修改相关 3 files / 32 tests passed。中间 `documents-green.log` 是修复迭代中的失败记录，文件名不代表通过。

- E 单据：现有 documents 测试覆盖直接创建 PI/Order、保存/重开、取消暂存修改、独立快照、客户货号隐藏保留、转换确认的 RPC 参数。转换 RPC 被 mock，不能据此断言数据库复制、重复转换或权限通过。
- F 装箱：全部 packing 测试实际运行。包含订单剩余部分装箱、跳过已完成行、来源一致性、超剩余拒绝、编辑加回原数量、独立产品、整箱计算、默认值、导入失败清理，以及关联装箱只定位已有行、Enter 不加入外部产品。数据来自 FakeRest；并发数据库触发器未实测。
- G 录入：CommercialLineItemsTable、ProductLibraryLookup、OrderProductImage 实际运行。包含键盘选品、Enter 前进、IME/repeat 忽略、多行规格、保存快照图片、精确 SKU 图片回退、异步旧 SKU 响应丢弃。无真实产品 API/图片服务可用性结论。
- J 导出/可靠性：PI/Order/Packing 的实际 XLSX 生成和包结构测试，及 Quote XLSX 测试；检查行扩展、合并单元格、图片包、金额格式、0.25 的数值与显示格式。不是 Excel/LibreOffice 人工打开后的视觉验收。既有 Quote readiness 测试也通过。

## 未修复风险与边界（静态审计，不是运行 PASS）

1. **P1：多步保存不具备原子性/重试幂等性。** `DocumentPages.save` 先保存 header，再 `commitCommercialItems` 逐次 delete/update/create。任一步失败后之前的写入未撤销；新 draft 项部分创建成功后重试可能重复创建。PackingItemsGrid 也逐行保存、最后删行，失败时可能已写入部分数据。需要单独设计后端原子提交/幂等机制，本次未擅改事务或 schema；未做数据库故障注入，不能声称已复现生产数据损坏。
2. **原 P2 装箱清理失败文案：已补充故障注入并修复**，详见下方补充验证，不再作为未修复项。
3. **重复提交/并发**：可见按钮有 busy/saving 禁用，但多个保存/创建 handler 没有同步互斥锁，前端也没有幂等键。没有真实双标签、网络超时后重试或数据库并发测试，不能将按钮禁用等同于完整防重。
4. **原 Header 查询错误丢草稿：已补充故障注入并修复**，详见下方补充验证。真实断网/会话过期场景仍未实测。
5. PDF 导出在 Order UI 已标为暂停并禁用；未实现或恢复。未验证真实下载目录、打印分页视觉、离线/刷新草稿恢复、真实权限失败和超大批量性能。

本轮没有改 DS 类名、金额/税费/定金算法、生产逻辑、付款逻辑、数据库权限、schema 或 migration。所有修改未提交，由主审计统一集成。

## 补充：清理失败与 Header 错误恢复

按主审计要求继续完成普通前端错误处理，未扩展到原子保存/RPC。

- **装箱清理失败（P2，已修复）**：新注入测试令导入失败且 delete 拒绝，修复前实际收到“已撤销本次创建”，但 FakeRest 中新装箱单仍存在。现在逐项收集清理错误，提示“清理未完成”，保留可核查装箱单 ID、删除失败产品项 ID、清理错误与原始导入错误；仅所有清理调用成功才表示已撤销。两例覆盖零明细创建和部分明细已创建后失败，均核验残留记录数量及消息中的 ID。创建界面原有错误捕获不重置订单选择/创建模式，本次没有新增输入重置；未修改 PackingCreate。
- **PI/Order Header 后台错误（P1，已修复）**：注入 getOne 错误后，修复前 DOM 只剩“无法加载此 PI/订单”，证明早返回卸载编辑器。现在已有 header 数据时保留 DocumentEditor，显示刷新失败和重试按钮，禁止在 header 不就绪时进入新编辑或导出；当前编辑状态、规格输入保留。两例验证刷新错误后仍有未保存规格，取消后编辑按钮禁用。保存业务未更改。
- 红测：`documents-recovery-red.log`，3 failed / 18 passed，分别为两个 header 错误恢复断言与清理失败错误文案。
- 最终回归：`documents-recovery-verified.log`，**4 files / 51 tests passed**（DocumentEditReadiness、documents、packingWorkflow、PackingUnsaved）。新增共4例：2 header + 2 cleanup。之前的 `documents-recovery-green.log` / `documents-recovery-final.log` 属于迭代记录，不能作为通过证据。
- 限定4文件 ESLint及 diff whitespace检查通过，日志 `documents-recovery-lint.log`；仅有仓库既有 ESLintIgnoreWarning。

未解决的多次写入原子性、重试重复创建、并发防重仍保留原风险结论；准确显示清理失败不等于消除残留或使创建具备事务性。
