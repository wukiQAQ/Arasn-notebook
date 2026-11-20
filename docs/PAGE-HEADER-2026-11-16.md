# 工作站标题去重与信息层级统一

## 结果与规范

每个主内容页面只保留顶部一个可见 h1。共享 PageHeader 接收 title、meta、description、leading、actions 和 heading level；页面名称由 main.tsx 的 pageConfig 统一管理，内层组件不再声明同名标题。设备互传继续使用弹窗，通过同一组件渲染一个可见 h2，保留原有隐藏的无障碍 Dialog.Title。

选择中性单层标题区；相较独立标题卡片、双层导航标题，它更节省高度。沿用现有字体、亮暗语义色与按钮样式。标题18px/600/26px，辅助信息12px/400，说明13px/20px，Header基础高度64px、上下10px、横向间隔16px；有说明或窄屏换行时自然增高。

| 页面 | 排查及处理 |
| --- | --- |
| 文件中心 | 删除内部“文件”大标题；顶部保留文件中心、当前列表查询总数和原说明。返回按钮移至顶部；工具栏直接接入，去除文件区外框/独立底色。 |
| 关系画布 | 顶部“关系画布 · N 个节点”，统计当前房间未隐藏节点；删除内部标题和空标题容器，首次启用页也去重。顶部保留返回工作页；类型选择、搜索、整理、新建、导出、画布导航仍在原工具区。 |
| 自由工作页 | 删除内部重复标题行；导出与小屏阅读切换移入顶部操作区；移除旧固定高度覆盖规则和遗留空隙。工具栏和内容直接接入。 |
| 便签页 | 顶部保留既有“速记”名称，辅助显示记录数；便签库/便签正文属于功能分区，不是重复页面标题。 |
| 设备互传 | 保持原弹窗导航，只保留一个可见标题，说明和关闭操作使用共享Header。设备连接与便签互传、白板实时共享属于具体任务入口。 |

侧边栏导航标签、无障碍区域标签和工具按钮中必要的名称不计为重复页面标题。没有改变路由、画布数据、编辑器状态模型或原生窗口策略。

## 文件清单

- src/PageHeader.tsx：新增共享组件。
- src/page-header.css：新增标题、说明、数量、操作区与响应式布局规则。
- src/main.tsx：页面配置、顶部标题唯一所有者、返回/导出入口位置与设备弹窗标题。
- src/FileStation.tsx：向外报告当前查询总数，不改文件查询与操作逻辑。
- src/xigra/TopologyWorkspace.tsx：删除重复标题，返回回调移交外层Header。
- src/free-canvas.css：移除旧标题行和固定顶栏高度规则。
- tests/page-header-desktop.cjs：新增截图及布局、数据、导航与实例专项回归。
- tests/workbench-heading-desktop.cjs、quick-panel.cjs、quick-topbar-desktop.cjs：标题断言只匹配标题文字，适配既有模式按钮新文案；旧标题布局测试允许正常分行。quick-panel保存状态定位限定可见元素。
- HANDOFF.md：更新交接状态。dist由构建更新，未打包EXE、提交或推送。

## 验证与证据

- npm run build：通过，仍有既有bundle体积/use-client/inlineDynamicImports警告。
- ARASN_HEADER_PHASE=final node tests/page-header-desktop.cjs：通过。亮暗主题×普通1440×800/真实最大化（本机1707×996 CSS px）/720×800/390×800，共32组主页面检查、8组设备弹窗检查，40张最终截图。
- 每个主页面恰有一个可见h1、统一18px标题；无页面横向溢出，标题与操作不重叠，每个按钮处于窗口及Header范围内。文件计数完成加载后截图。
- 文件返回原页面、关系画布返回工作页；搜索内容跨导航保留；新建节点使标题从1变2、撤销回到1；自由工作页导出弹窗打开/关闭通过。
- 页面/主题/尺寸变化前后board数据完全相同。自由工作页根实例与关系画布viewport全程保持；自由纸面在同一响应式分支内保持。原有小于640px的文字阅读/画布分支仍按原设计切换，不将其误计为本次重新挂载。
- ARASN_HEADING_PHASE=page-header-regression node tests/workbench-heading-desktop.cjs：通过，四页1440/820/390及侧栏导航布局回归。
- 额外尝试旧tests/quick-panel.cjs：仍未通过其过时的xigra-view-enter动画监听断言（期待MAIN，实际无该事件）；本轮不修改窗口过渡实现。quick-topbar完整原生焦点/跨DPI套件未运行。
- 已查看改前3页和改后多轮代表截图，修复390px旧固定顶栏高度导致纵向裁切，以及操作区未限制宽度导致横向裁切。未进行全量业务、完整读屏或物理跨屏DPI检查。

## 三页修改前后截图（深色、普通窗口）

| 页面 | 修改前 | 修改后 |
| --- | --- | --- |
| 文件中心 | [前](screenshots/page-header/before/files-dark-normal.png) | [后](screenshots/page-header/final/files-dark-normal.png) |
| 关系画布 | [前](screenshots/page-header/before/relations-dark-normal.png) | [后](screenshots/page-header/final/relations-dark-normal.png) |
| 自由工作页 | [前](screenshots/page-header/before/canvas-dark-normal.png) | [后](screenshots/page-header/final/canvas-dark-normal.png) |

全部亮暗、普通/最大化/小窗口截图位于screenshots/page-header/{before,final}/；最终测量见final/verification.json。当前消息未附用户所述三张截图，改前证据来自修改前的真实应用构建。
