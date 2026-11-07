# ROMIKU Design System 2.0 — 全站规范

沿用已确认试点。字体：英文/数字 Inter Variable，中文 Noto Sans SC 400/600，PingFang SC/Microsoft YaHei/system-ui 回退。字体本地 WOFF2，Noto 按 unicode-range 加载，不访问 Google Fonts；PWA 不预缓存全部中文字库。

## Token
画布 #f5f7fb；卡片 #fff；正文 #172338；辅助 #59677b；边框 #e2e8f0；交互蓝 #2455d6；淡蓝 #edf3ff。红/橙只用于既有错误、警告和逾期语义，不改变状态含义。

标题 24/32px 600；模块 18/26px 600；表格/输入 14px；按钮/表头 13px；辅助 12–13px。数字 tabular-nums；金额右对齐，日期与金额禁止拆行。桌面控件最小36px，移动44px/输入16px。圆角控件8px、卡片12px；卡片间距16–24px、桌面内边距20–24px/移动12–16px。

## 共享组件契约
romiku-ds 作用于 CRM Layout；ds-page 表示页面、ds-page-heading 标题操作区、ds-list-toolbar 搜索筛选白卡、ds-table-scroll 局部宽表、ds-form-page 表单、ds-detail-drawer 详情抽屉。React Admin List 和业务定制表格共享相同视觉。复杂宽表使用内部滚动，页面和 Tabs 本身允许 shrink。FullCalendar 和日期网格排除普通数据表规则。Portal 显式复用字体/颜色/控件尺寸。

工作流列表、Customer360、报价/PI/订单、生产组/子单、装箱网格、产品目录/采购抽屉、供应商表单、手动任务和日历保留自身业务布局，使用共享表面和组件。设置目前仍为占位页面，没有新增业务功能。

## 非视觉改动
唯一产品行为修正：订单与 PI 的编辑入口等待单据头及明细成功读取，拒绝 pending/error/refetch/placeholder 的不完整快照；真正零行单据仍能编辑。复用现有 readyForEdit，保存与计算不变。测试修正只更新旧入口选择器和失效 mock 路径，无断言删除。

## 验收
1440/1280/390，加载完成截图，长名称/SKU和多行产品；表单创建/取消/QA保存、日期、抽屉、搜索、Enter焦点与刷新。Production 不发布，数据库/RPC/导出模板/API保持不变。未完成项须单列，不以菜单可打开代替页面验收。


## 实际路由与页面覆盖
所有下列模块已应用共享 scope，并分别适配页面、工具栏、表格、表单或抽屉语义类。此表表示代码覆盖；截图与浏览器覆盖单独保留，不把二者等同。

| 模块 | 路由与实际子视图 | 本轮适配 |
|---|---|---|
| 工作台 | `/` 概览、全部待办、客户核实、收款/交期弹窗 | 沿用已验收试点与共享弹层 |
| 全局搜索 | `/search` 查询/分类结果/空状态 | 标题、搜索与结果卡 |
| 网站询盘 | `/website-inquiries` 列表、创建、详情、编辑、联系人、跟进、原始商品 | 工作流表格/抽屉、商品局部滚动 |
| 外贸开发 | `/outbound-development` 列表、创建/编辑/详情、联系人/跟进/转换 | 共享工作流全套 |
| 正式客户 | `/formal-customers` 列表、创建/编辑、360详情及业务标签页 | 工作流和360抽屉 |
| 报价单 | `/quotes`、`/quotes/new`、`/quotes/:id` 详情/编辑/转换/归档 | 列表、表单、宽明细、弹层 |
| PI | `/pi`、`/pi/new`、`/pi/:id` 详情/编辑/转换 | 共享单据适配，独立列样式 |
| 订单 | `/orders`、`/orders/new`、`/orders/:id` 详情/编辑、收款/生产/归档 | 保留试点，增加明细加载保护 |
| 生产 | `/production`、`/production/new`、`/production/:id` 分组/内联交期/详情/收货 | 分组、表格、表单、进度 |
| 装箱 | `/packing-shipping`、`/packing-shipping/new`、`/packing-shipping/:id` 关联/独立、导出详情 | 17列1440px内部滚动，按钮/详情 |
| 日历 | `/calendar` 月/周/日/事项；`/calendar/tasks`、`/calendar/tasks/:id`，new亦由:id处理 | 日历专用样式、任务表单 |
| 供应商 | `/suppliers`、`/romiku_suppliers/create`、`/romiku_suppliers/:id` | Admin列表、表单 |
| 联系人 | `/supplier-contacts`、`/romiku_supplier_contacts/create`、`/romiku_supplier_contacts/:id` | 表单及缺失创建路由修复 |
| 产品库 | `/product-library` 目录/扩展/采购关系/历史、产品抽屉/图片/批量供应商 | 宽表、筛选、产品抽屉 |
| 产品附属表单 | `/romiku_product_extensions/create`、`/:id`；`/romiku_product_suppliers/create`、`/:id`；`/romiku_procurement_cost_history/create` | 恢复已有表单路由，统一表单 |
| 设置 | `/settings` | 现有占位页，仅统一视觉；没有新增设置功能 |

## 本轮最小前端兼容修复
- 订单/PI 在头信息和产品项均已成功加载前禁用编辑，避免异步空数组被当成真实空单据；不改变保存算法。
- React Admin 未展开自定义 Resource 包装组件，六个现有 Create/Edit 链接无路由。仅补显式 CustomRoutes，保留现有 resource、权限与写入转换。
- 共享表格样式不覆盖 FullCalendar、日期网格，装箱17列保持1440px最小宽度，在容器内滚动。
