# 窗口状态与共享退出 · 第一批验收

范围：仅第一批。截图/导出系统、共享图标及完整视觉层级重排尚未实施。沿用现有主题与控件，不改变业务记录结构、共享权限或网络协议。

## 根因与实现

1. **共享关闭闪屏**：`dialog=null` 后，Base UI 的 Popup 尚在退出阶段，原三元分支立刻落入“设置”内容。现保留最后一个有效弹窗类型至卸载，关闭、Esc、返回设备互传均不经过设置页。跨窗口模式时只重置临时浮层，使用各自唯一的 React key；工作区不重置。共享页的 Esc 捕获只作用于共享页，不干扰设置中的快捷键录制取消。
2. **窗口跳动**：原来复用一份几何，切换会无条件取消最大化并套用默认尺寸。现 Quick 保留原 `quick-panel-bounds-v2`；Workspace 使用 `workspace-window-state-v1` 保存正常位置/尺寸及最大化状态。按角色串行持久化，失败可重试，退出等待两份写入。
3. **显示顺序**：隐藏后修改几何，通过带序号 IPC 等待目标 React 布局提交及两个动画帧，再恢复显示。旧确认无效，超时回滚；回滚也失效时保持隐藏。Windows 的 maximize/restore 会自动显示隐藏 HWND，因此几何切换期间即时设为透明，完成后先隐藏再恢复原透明度及显示。这是就绪屏障，没有新增淡入、缩放或等待动画；原模式入场动画已移除。
4. **工作状态丢失**：原条件分支卸载工作区，并每次将页面改回便签列表。现保持模式子树、关系节点 DOM、工作页面、视口、选择和历史状态；只暂停隐藏画布的交互。速记和工作站分开保存编辑选择、草稿与光标，共享唯一 BoardClient。首次进入工作站可打开当前速记，此后各自保留选择。
5. **后台唤出与关闭竞争**：目标动作在隐藏状态下完成模式切换后才显示；保留焦点策略。隐藏/退出使旧触发器显示请求失效，切换中确认隐藏会取消待执行显示，避免刚关闭又弹出。Workspace 不沿用 Quick 的置顶。

## 为什么本批没有直接改成双原生窗口

当前 recovery 是单个 BoardClient 整包写入；直接复制 renderer 会有恢复队列互相覆盖风险。IPC 主 frame 信任校验、广播、文件对话框父窗口、原生输入钩子、托盘及退出握手也绑定唯一窗口。

采用用户允许的替代方案：**单原生窗口，两套独立几何和 UI 会话，就绪后显示**。并未实现两个同时存在的独立原生窗口。后续双窗口需要单独设计唯一数据服务和跨 renderer 协调，不应通过复制数据客户端实现。

## 本批修改文件

| 文件 | 用途 |
| --- | --- |
| `desktop/engines/window-manager.cjs` | 两角色几何、最大化持久化、显示器适配及退出写入 |
| `desktop/engines/window-transition.cjs` | 串行切换、透明保护、就绪确认、回滚与关闭优先级 |
| `desktop/main.cjs` | 窗口生命周期、IPC、后台触发、隐藏/退出协调 |
| `desktop/preload.cjs` | 就绪和显示请求的窄 IPC 桥 |
| `src/main.tsx` | 保持工作区挂载、独立 UI 会话、共享退出内容及临时浮层生命周期 |
| `src/board.ts` | 桌面桥类型 |
| `src/QuickPanel.tsx` | 隐藏模式与输入焦点恢复 |
| `src/xigra/records/session.ts` | 区分首次恢复记录的 UI 会话 |
| `src/xigra/TopologyWorkspace.tsx` | 保留节点 DOM，隐藏时清理临时悬停/焦点 |
| `src/xigra/TriggerSettings.tsx` | 原生动作焦点与显示序号类型 |
| `src/xigra/shell.css` | 隐藏模式不参与布局，移除模式入场动画 |
| `package.json` | 纳入窗口切换单测 |

测试新增：`tests/window-transition.test.cjs`、`tests/window-lifecycle-desktop.cjs`、`tests/helpers/native-window-capture.cjs`。

测试更新：`tests/window-manager.test.cjs`、`tests/quick-recorder-desktop.cjs`、`tests/canvas-micro-desktop.cjs`、`tests/notification-desktop.cjs`、`tests/desktop-smoke.cjs`、`tests/trigger-desktop.cjs`。保留隐藏 DOM 后按可见状态查询保存提示；更新旧文件弹窗断言、Win32 快捷键检查和实际共享网卡地址；明确等待初始页面、隐藏布局切换完成与缩放帧。仅 CDP 测试窗口隔离无关物理输入，原生键鼠测试仍发送真实 Windows 输入。

项目原本已有上一轮微交互的未提交改动，已保留；本表仅列本批涉及文件。

## 验证与证据

- `npm run build` 通过；既有 chunk 大小、依赖 use-client 和打包选项警告仍在。
- `npm test`：**101/101** 通过，含 8 项 WindowManager、6 项 WindowTransition 单测。涵盖跨屏 DIP/负坐标、拔屏适配、正常/最大化/最小化、存储失败、旧确认、回滚、Windows 自动显示透明保护和切换中隐藏。
- `window-lifecycle-desktop`：**13 项** Windows Electron 实机检查，普通尺寸恢复、最大化/最小化、Quick 几何、页面/视口/选中项/节点 DOM 身份、独立速记正文、无重复记录；亮暗两主题的共享关闭按钮、Esc、返回、模式切换；后台目标动作与第二实例恢复，以及切换中隐藏优先于就绪显示。共享退出使用 MutationObserver 检查中间内容，未出现“设置”分支；几何事件检查未出现就绪前的不透明缩放。
- `window-policy-desktop`：置顶开关、Workspace 不置顶、主动/被动显示、隐藏/最小化恢复与重启通过。
- `quick-recorder-desktop`：标题/正文、光标/焦点、搜索、附件、画布引用、重启和 5 种宽度通过。
- `trigger-desktop`、`trigger-desktop --mouse`：真实 Windows 五类键盘动作、录制取消、禁用/重启/默认值；鼠标中键/侧键、双击及 20 次原生钩子注册释放通过。
- `desktop-smoke`：保存、局域网实际网卡白板写入、停止监听、隐藏托盘和重启恢复通过。
- `canvas-micro-desktop`：亮暗、1440/820/390、缩放/平移后的交叉与重叠选线、编辑/删除/历史、节点信息与原记录保护通过。
- `notification-desktop`：合并计时、失败原因/重试、自动保存静默、不占布局、亮暗及减少动态回归通过。

日志与结构化结果：`docs/screenshots/window-batch1/logs/`、`docs/screenshots/window-batch1/results.json`。

## Windows 原生截图

真实 Electron 在 Windows 上运行，以 Win32 PrintWindow 仅捕获测试 HWND，包含标题栏；不是设计稿或桌面截图裁剪。另存有 `-content.png` 浏览器内容图用于对照。已实际查看亮暗画布、共享页和速记截图。

| 场景 | 截图 |
| --- | --- |
| 亮色工作站最大化 | [Windows 截图](screenshots/window-batch1/light-workspace-maximized-windows.png) |
| 亮色独立几何的速记 | [Windows 截图](screenshots/window-batch1/light-quick-windows.png) |
| 亮色共享弹窗 | [Windows 截图](screenshots/window-batch1/light-share-windows.png) |
| 亮色返回原工作站 | [Windows 截图](screenshots/window-batch1/light-restored-workspace-windows.png) |
| 深色共享弹窗 | [Windows 截图](screenshots/window-batch1/dark-share-windows.png) |
| 深色返回原工作站 | [Windows 截图](screenshots/window-batch1/dark-restored-workspace-windows.png) |

## 限制及下一步

- 本批仍是单原生窗口隔离方案，不支持同时显示两个原生窗口。
- 多显示器/不同 DPI/拔屏已有模型测试，尚未物理混合 DPI 多屏实测；屏幕热区完整场景、长时间运行、安装版/便携包未在本批实测。
- 未收到本次所述最新参考截图，依据实际运行界面定位。没有以静态截图证明每一帧显示器合成都无闪烁；退出分支和显示时序有运行期检查。
- 第二批截图/导出（三种方式、框选、倍率和复制）与第三批共享图标/层级精修未开始。
- 源码与 dist 已更新；未重新打包 EXE、提交或推送 GitHub。
- 第一批验收后停止。下一批应在新聊天先读 `HANDOFF.md`，由用户明确继续。
