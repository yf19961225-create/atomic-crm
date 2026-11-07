# Design System 2.0 Implementation Plan

Goal: 可操作的三个页面 Preview，等待视觉批准后再推广。
Architecture: route-scoped CSS tokens, same React state and RPC; current isolated worktree.
Spec: ../specs/2026-11-07-design-system-v2.md

- [ ] 审查字体和已有组件；保存基线页面截图。
- [ ] 新增 design-system.css；Layout 基于当前路由启用 .romiku-ds，不改导航或业务路由。设计 tokens 无副作用，字体同源、按需字集。
- [ ] DocumentPages 增加 order-only 展示类：list/create/editor/header/toolbar/table；共享子组件可使用已有aria/data-slot选择器，必要时只添加语义类。
- [ ] Workbench 添加语义布局类，保留所有feed、过滤和动作。
- [ ] 执行相关订单、搜索、图片、Enter、拖拽、工作台回归和样式作用域检查。typecheck/lint/build/PWA。
- [ ] 精确候选部署现有Vercel项目隔离Preview，沿用已授权Preview公开配置，不改Production环境。
- [ ] 浏览器1440/1280/390验收及截图；QA保存刷新重开、清理可清理数据，保留审计。输出报告、规范、SHA及Preview地址后停止。

Review focus: 长SKU不能被截断成错误标识；手机产品表仅容器滚动；日期弹窗不被overflow裁剪；sticky头部不遮挡Enter焦点；字体swap不改变控件高度。对应真实页面验收。
