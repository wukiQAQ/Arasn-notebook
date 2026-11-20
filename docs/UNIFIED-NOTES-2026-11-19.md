# 统一工作站便签验收 · 2026-11-19

## 窗口与组件

- 改造前：Electron 已有一个主窗口。速记与工作站各有一套尺寸记忆、窗口形变 IPC 和便签会话，速记由 `QuickPanel` 渲染。
- 改造后：`WindowManager` 持有一套工作站几何。便签页中的 `RecordWorkspace` 始终使用同一 `RecordEditor`、会话和自动保存队列。宽窗便签库为独立滚动的双栏，窄窗用抽屉。180ms 页面内过渡遵循系统减少动态效果设置。
- 标题、正文与状态栏左对齐。正文宽度随面板伸缩，宽窗限制行长。浅色和深色沿用现有 Graphite 主题。快捷布局的全宽导航临时采用紧凑呈现。
- 首次启动优先读取工作站布局。缺少工作站布局时回读旧速记尺寸和更早的位置值。新几何写入原工作站键。窗口最小尺寸为 520×420 DIP。

## 触发器和草稿

| 现有动作 | 迁移后的结果 |
| --- | --- |
| 呼出快速便签 | 激活并打开工作站便签页，折叠库、聚焦正文 |
| 显示或隐藏主面板 | 窗口在前台时收起，隐藏、最小化或在其他应用后方时打开快捷记录 |
| 展开工作站 | 激活工作站，退出快捷记录布局，保留当前页面 |
| 打开文件、快捷操作 | 保留独立动作和配置 |

绑定 ID、启用状态、键盘、鼠标、手势、热区与冲突检测沿用现有触发器注册表。已有绑定按动作路由，无需改写用户配置。输入法组合或阻塞编辑的对话框活跃时，呼出会保留正在进行的交互。

重复呼出继续编辑当前记录。新建先打开非持久草稿，输入有效标题、正文或成功关联附件才产生记录。启动时优先恢复待保存记录，其次读取最近有效记录。工作页中的共享文字已直接使用记录 ID。本机记录加入工作页只为原记录保存独立坐标。关系画布继续通过同一 ID 引用内容，复用既有节点。

## 验证与限制

- `npm run build` 通过。完整单元测试 92 项通过，覆盖窗口位置继承、数据边界、触发器注册和画布引用。
- `node tests/unified-notes-desktop.cjs` 在 Windows Electron 通过。验证了真实系统热键、从其他应用呼出、最小化恢复、单窗口、普通层级、编辑器与选区复用、空草稿、搜索及清空筛选、自动保存、恢复、附件导入、原图预览、文件中心引用、发送附件到工作页及两种画布联动。
- `npm run test:desktop` 已迁移到统一工作站入口，在 Windows Electron 通过。保留了快捷键注册、隐藏到托盘、局域网写入、停止共享和重启持久化的验收。
- 600×480、800×600、1280×800 和最大化均已在原生窗口检查。浅色与深色共 10 张原始截图，另附尺寸对比图 `window-size-comparison.png`。截图使用隔离测试便签，专项将原生图尺寸与窗口边界核对。
- 迁移时曾启动真实数据备份副本，逐项比对了 22 条便签、17 个节点、16 条边和 4 个内容引用，并验证旧本机便签以同一 ID 加入工作页。此次复验以只读方式重新检查 `workspace-consistent.sqlite` 的完整性和记录数，28 个附件对象的字节数和 SHA-256 均匹配。原用户数据未用于写入测试。
- 手势、鼠标和热区的配置与路由由注册表测试覆盖。本轮原生专项使用键盘热键。仓库早期的桌面脚本中仍有依赖旧速记入口的历史场景，应采用统一便签专项作为本轮验收入口。

## 文件清单

- 主进程与持久化：`desktop/main.cjs`、`desktop/preload.cjs`、`desktop/engines/window-manager.cjs`、`desktop/server.cjs`。
- 页面与编辑：`src/main.tsx`、`src/WindowNavigationBar.tsx`、`src/window-navigation.css`、`src/board.ts`、`src/NewNoteButton.tsx`、`src/detail-refinements.css`、`src/xigra/HelpPopover.tsx`。
- 便签库：`src/xigra/records/RecordWorkspace.tsx`、`RecordList.tsx`、`RecordSearch.tsx`、`session.ts`、新增 `workspace.css`。
- 附件：`src/FilePicker.tsx`、`src/FileStation.tsx`、`src/record-attachments.ts`。后者承接原 `AttachmentPopover.tsx` 的公共附件逻辑。
- 移除：`src/QuickPanel.tsx`、`src/quick-recorder.css`、`desktop/engines/window-transition.cjs`、`tests/window-transition.test.cjs`。旧源码已另存到本次交付的本地归档。
- 验收与说明：`tests/unified-notes-desktop.cjs`、`tests/desktop-smoke.cjs`、`tests/window-manager.test.cjs`、`package.json`、`README.md`、`HANDOFF.md`。
