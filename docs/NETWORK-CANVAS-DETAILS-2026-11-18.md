# Arasn 四项 UI 修复验收

## 根因与处理

| 问题 | 根因 | 修复 |
|---|---|---|
| 网卡选中粗框 | Base UI 打开下拉时会高亮当前项。通用 `data-highlighted` 样式覆盖选中底色，并叠加内描边。 | 网卡下拉单独使用浅底与右侧对勾标记选中，鼠标悬停柔和变色，方向键导航保留 1 px 焦点环。 |
| 网络页面说明密集 | 设备入口、互传弹窗、网卡和白板共享常驻多处说明，阅读路径与当前操作交错。 | 三个入口复用同一个 `HelpPopover`，按设备互传或白板共享提供说明。连接状态、操作失败、配对指纹提醒和白板访问风险直接显示。 |
| 顶部与工作区错位 | 标题栏自行定位，标题起点由窗口导航控件和局部留白决定，画布起点由侧栏宽度决定。 | 关系画布标题、主内容和顶部操作栏共用侧栏宽度加 12 px 留白。关系画布的窗口操作集中到标题右侧，低于 900 px 时，历史和全局操作进入已有的「页面操作」菜单。 |
| 紧凑和隐藏模式偏移 | 三态下画布移动，标题仍停留在原处。侧栏宽度和外壳内边距各自过渡，窄窗口画布设置使用固定的窗口坐标。 | 只对共享侧栏宽度做过渡。浮动工具跟随画布，窄窗口画布设置跟随工具栏，工具栏内部仅纵向滚动。 |

## Electron 实拍与坐标

以下横坐标以窗口客户区左边缘为零点。普通窗口为 1240 × 780 CSS px。

| 导航 | 修改前标题 / 画布 | 修改后标题 / 画布 | 实拍 |
|---|---:|---:|---|
| 完整 | 163 / 212 px | 212 / 212 px | [修改前](screenshots/network-canvas-details/before-canvas-full.png) · [修改后](screenshots/network-canvas-details/after-canvas-full.png) |
| 紧凑 | 163 / 76 px | 76 / 76 px | [修改前](screenshots/network-canvas-details/before-canvas-compact.png) · [修改后](screenshots/network-canvas-details/after-canvas-compact.png) |
| 隐藏 | 163 / 12 px | 12 / 12 px | [修改前](screenshots/network-canvas-details/before-canvas-hidden.png) · [修改后](screenshots/network-canvas-details/after-canvas-hidden.png) |

- 网卡下拉：[修改前](screenshots/network-canvas-details/before-network-select.png) · [亮色](screenshots/network-canvas-details/after-network-select-light.png) · [深色](screenshots/network-canvas-details/after-network-select-dark.png)
- 互传帮助：[亮色](screenshots/network-canvas-details/after-lan-help-light.png) · [深色](screenshots/network-canvas-details/after-lan-help-dark.png)
- 白板帮助：[1240 px 亮色](screenshots/network-canvas-details/after-share-help-light-1240.png) · [390 px 深色](screenshots/network-canvas-details/after-share-help-dark-390.png)
- 画布设置与窗口控件：[820 px 画布设置](screenshots/network-canvas-details/after-canvas-narrow-settings-dark.png) · [Windows 最大化原生截图](screenshots/network-canvas-details/after-canvas-max-hidden-windows.png)
- [修改前测量](screenshots/network-canvas-details/before.json) · [修改后测量](screenshots/network-canvas-details/after.json)

## 修改文件

- 网卡：`src/xigra/AppSelect.tsx`、`src/xigra/NetworkPicker.tsx`、`src/xigra/controls.css`。
- 共享帮助：`src/xigra/HelpPopover.tsx`、`src/xigra/help-popover.css`、`src/xigra/LanNotesDialog.tsx`、`src/xigra/lan-notes.css`、`src/xigra/WhiteboardShare.tsx`、`src/xigra/whiteboard-share.css`、`src/PageHeader.tsx`、`src/page-header.css`、`src/main.tsx`。
- 布局：`src/WindowNavigationBar.tsx`、`src/window-navigation.css`、`src/search-sidebar-refinement.css`、`src/xigra/TopologyWorkspace.tsx`、`src/main.tsx`。
- 验收：`tests/network-canvas-details-desktop.cjs`、`tests/share-batch3-desktop.cjs`。

## 验证结果与边界

- `npm run build` 通过。常规权限下 `npm test` 通过 103/103。
- Electron 测试覆盖双主题的鼠标、键盘、帮助外部点击和 Esc，白板帮助同时在 1240、820 和 390 px 验证边界。390 px 为临时放宽窗口最小宽度的压力测试。
- 普通和最大化窗口均验证三态。三次过渡合计 108 个采样帧，逐帧断言标题、工具栏和画布对齐，浮动工具保持 12 px 内距。切换前后的画布数据、选中节点、连接工具、视口和 125% 缩放一致。随后验证了节点拖动、点击连线目标、保存标记及关系写入。
- 白板共享 Electron 回归通过 4 组，包括启动、停止、链接复制、失败重试、监听地址失效和关闭后保留工作区。下拉和帮助专项使用可重复的网卡测试数据。
- 旧 `relation-canvas-desktop.cjs` 在工作区入口超时。上述节点交互由专项脚本从当前桌面入口完成实测。
- 当前会话未收到可读取的四张参考截图。前后对比来自同一工作树在修改前后运行的 Windows Electron。真实跨设备收发及多屏 DPI 切换未纳入本轮验收。
