# Arasn 七项 UI 细节专项修复 · 2026-11-16

## 范围与方向

只处理本轮七项。保留品牌紫色、深浅主题、一体化顶部栏、既有数据结构和业务入口。本条请求中没有收到所述 11 张图片附件，因此以当前代码、真实运行窗口和 DOM 几何为验收依据，没有假称对照未收到的截图。

用户的主要任务是记录与浏览便签，状态和低频操作应退到内容之后。比较了继续独立定位各组件、统一状态栏、将全部操作放入菜单三种方式，采用统一状态栏：保存状态与附件操作有明确的空间分配，常用入口仍可见。视觉沿用现有主题变量，普通卡片 13–14px 圆角，浮层 16px，按钮 10px，短状态消息为胶囊；仅增加用户指定的成功色（浅色 #16845E、深色 #55C99A）。

## 七项根因、修复与证据

| 问题 | 代码中确认的根因 | 解决方案与实际验证 |
| --- | --- | --- |
| 1. 底部组件冲突 | Quick footer 同时继承旧的可换行 Footer、不可换行的状态组、独立加号及绝对定位宽度规则；附件触发器混在状态文字中，缺少统一的操作区。便签页则另有 Footer 与内联附件列表 | 共用 NoteStatusBar，Grid 将状态和操作明确分列，内部不互相侵占；窄容器隐藏字数辅助文字，仍可从状态区 title 查看。便签页附件列表移入底部入口浮层，保留查看和移除引用。实测普通、最大化、紧凑窗口的状态/按钮边界不相交。菜单 Portal 和碰撞检测保留，没有提高 Z-index 掩盖问题 |
| 2. 保存提示厚重 | QuickPanel 监听 pending→saved 并为自动保存弹 Toast；App、QuickPanel、FileStation 各自持有通知状态并渲染 Portal；旧通用样式使用 12–14px padding 和大阴影矩形 | 删除自动保存成功 Toast 监听，保存状态静默更新。NotificationProvider 收口为一个状态源，App 只渲染一个通知出口，连续消息替换并重启计时。成功消息用绿色 Check、小胶囊、约 2 秒淡出，悬停/焦点保持。重要操作沿用真实完成回调。保存错误不自动消失，保留原恢复入口，并提供可重试 Toast；重试再次失败也显示原因。503 注入后重试成功，正文与附件仍在 |
| 3. 紫色按钮文字变黑 | recorder 的 `.xigra-quiet-button:hover` 有较高选择器权重并设置正文色；共享 Primary 只约束默认颜色，通用 selected 规则也可写入普通正文色 | Primary 明确保证 Default/Hover/Pressed/Focus 文本为白色，图标继承；通用 selected 规则排除 Primary。只通过背景变化反馈 Hover/Pressed。深浅主题四态 computed style 均为白色、500 字重、宽度不变，Hover/Pressed 背景不同；键盘 focus-visible 仍可见 |
| 4. 方框套方框 | 输入父面板、标题分隔、附件列表、操作按钮和通知各自描边；设置弹窗固定高度使短分类留下大块空白 | 面板用现有背景、轻阴影和低对比 1px 边界分层；移除重复内层边框，附件操作降低边框权重。短设置分类随内容收缩，长快捷键列表保留滚动。保留键盘聚焦反馈，没有全局删除 Outline。实际查看了亮暗输入区、附件浮层、成功/错误提示和卡片 |
| 5. 左导航顶部空白 | 移除 Logo 后仍有 36px `.brand-spacer`，再与侧栏 gap 叠加 | 删除占位节点和专用固定高度规则，保留原侧栏 20px 顶部 padding。实测首个导航项距 48px 顶栏下沿 20px。NavItem、品牌色圆底与阴影样式未改；展开/收起和窗口导航回归通过 |
| 6. 快捷键按钮错位 | “录制”在组标题，已配置的修改/禁用/删除则位于另一种可换行 Flex 行；未配置只有一个提示文字，无相同的操作列 | 已配置与未配置共用 `.trigger-row` Grid，操作列为 112/64/64px、36px 高；未配置对应不存在的操作显示 disabled。新增绑定保留为标题旁的轻量入口。窄容器可将操作区放到下一行。DOM 验证每组操作列的 x/宽/高一致，并实际验证录制取消、修改取消、启用与删除，既有注册、冲突检查及保存函数未改 |
| 7. 便签卡片不统一、留白不合理 | 便签仍有旧折角式圆角、3px 色边和独立表头描边；表头额外 padding 占用旧 140px 高卡片；固定世界像素的底部留白不能避让保持屏幕尺寸的调整手柄 | 便签页、自由便签、关系节点共享柔和圆角和细边界语言，保持各自尺寸。自由便签表头 28px，标题/正文/附件分区，取消折角，色边减为 2px；按当前 zoom 计算底部操作预留，详情按钮和尺寸手柄不相交。便签页距顶栏增加 10px 留白，按钮有内部 padding。没有写入新的尺寸或坐标，也未把三类视图强制统一尺寸 |

另一个实测行为修复：附件打开时 Esc 可能继续触发应用“隐藏窗口”快捷键。两种附件入口现在优先处理 Esc，输入法组合态和下拉选项不抢处理；外部点击、关闭按钮、Esc 与再次打开均验证。打开附件也结束当前 Toast，避免两个浮层竞争同一位置；保存错误的状态与恢复入口仍由现有保存状态保留。

## 修改文件清单

| 文件 | 本轮用途 |
| --- | --- |
| `src/NoteStatusBar.tsx`（新增） | 两种便签界面共用的保存/字数/附件/操作布局 |
| `src/detail-refinements.css`（新增） | 七项局部视觉与响应式规则 |
| `src/Notification.tsx` | 共享 Provider、单通知状态、成功/错误图标、两秒计时和重试错误处理 |
| `src/Notification.css` | 轻量胶囊、成功色、主题与淡出；位置避让底部操作区 |
| `src/QuickPanel.tsx` | 移除自动保存成功 Toast；共用状态栏；附件重要操作成功反馈 |
| `src/FileStation.tsx` | 使用全局通知出口，取消重复 Portal，普通通知统一两秒 |
| `src/AttachmentPopover.tsx` | 附件 Esc 优先关闭、顶栏碰撞避让、打开时结束当前通知、区分成功/错误反馈 |
| `src/main.tsx` | Provider 接入、保存错误重试通知、移除品牌占位、便签操作区屏幕空间预留 |
| `src/ui-system.css` | Primary 各交互态白色约束、selected 规则排除 Primary |
| `src/window-navigation.css` | 删除品牌占位固定高度规则 |
| `src/xigra/TriggerSettings.tsx` | 快捷键行的统一 DOM；保留原操作回调 |
| `src/xigra/records/RecordWorkspace.tsx` | 共用状态栏、附件浮层入口；复用原 RecordAttachments 的查看/移除功能 |
| `src/xigra/TopologyWorkspace.tsx` | 按缩放预留操作空间，仅 CSS 变量 |
| `tests/seven-details-desktop.cjs`（新增） | 真实窗口、按钮四态、附件/保存/快捷键交互专项 |
| `docs/UI-SEVEN-DETAILS-2026-11-16.md`、`HANDOFF.md` | 验收与交接 |
| `docs/screenshots/seven-details/final/` | 35 张真实截图及验证记录 |

以上是本轮触及的文件。仓库中此前已有的其他未提交改动均保留；没有修改后端存储、窗口配置或关系数据结构。构建更新了 dist，未打包 EXE、提交或推送。

## 实际运行截图

图片使用真实 Electron 测试窗口的 PrintWindow 捕获，包含系统窗口控制，数据为隔离测试资料，不是生产便签或设计示意图。已查看并修正多轮；中间探测输出已清理。

| 场景 | 浅色 | 深色 |
| --- | --- | --- |
| 便签区普通窗口 620×700 | [查看](screenshots/seven-details/final/quick-light-normal.png) | [查看](screenshots/seven-details/final/quick-dark-normal.png) |
| 便签区紧凑窗口 500×540 | [查看](screenshots/seven-details/final/quick-light-compact.png) | [查看](screenshots/seven-details/final/quick-dark-compact.png) |
| 便签区实际最大化 | [查看](screenshots/seven-details/final/quick-light-maximized.png) | [查看](screenshots/seven-details/final/quick-dark-maximized.png) |
| 附件浮层，普通窗口 | [查看](screenshots/seven-details/final/attachments-light-normal.png) | [查看](screenshots/seven-details/final/attachments-dark-normal.png) |
| 附件浮层，紧凑窗口 | [查看](screenshots/seven-details/final/attachments-light-compact.png) | [查看](screenshots/seven-details/final/attachments-dark-compact.png) |
| 便签页普通窗口 1160×820 | [查看](screenshots/seven-details/final/records-light-normal.png) | [查看](screenshots/seven-details/final/records-dark-normal.png) |
| 便签页紧凑窗口 720×520 | [查看](screenshots/seven-details/final/records-light-compact.png) | [查看](screenshots/seven-details/final/records-dark-compact.png) |
| 便签页最大化 | [查看](screenshots/seven-details/final/records-light-maximized.png) | [查看](screenshots/seven-details/final/records-dark-maximized.png) |
| 便签页附件与移除入口 | [查看](screenshots/seven-details/final/records-light-attachments.png) | [查看](screenshots/seven-details/final/records-dark-attachments.png) |
| Primary Hover | [查看](screenshots/seven-details/final/primary-light-hover.png) | [查看](screenshots/seven-details/final/primary-dark-hover.png) |
| Primary Pressed | [查看](screenshots/seven-details/final/primary-light-pressed.png) | [查看](screenshots/seven-details/final/primary-dark-pressed.png) |
| Primary 键盘 Focus | [查看](screenshots/seven-details/final/primary-light-focus.png) | [查看](screenshots/seven-details/final/primary-dark-focus.png) |
| 快捷键对齐，宽窗口 | [查看](screenshots/seven-details/final/settings-light-shortcuts.png) | [查看](screenshots/seven-details/final/settings-dark-shortcuts.png) |
| 快捷键对齐，紧凑窗口（已滚到配置项） | [查看](screenshots/seven-details/final/settings-light-compact.png) | [查看](screenshots/seven-details/final/settings-dark-compact.png) |
| 短成功提示 | [查看](screenshots/seven-details/final/save-success-light.png) | [查看](screenshots/seven-details/final/save-success-dark.png) |

其他：[保存失败与重试](screenshots/seven-details/final/save-error-dark.png)、[附件添加成功](screenshots/seven-details/final/attachment-success-light.png)、[附件来源与去向](screenshots/seven-details/final/attachment-menu-light.png)、[自由便签卡片](screenshots/seven-details/final/canvas-cards-light.png)、[关系节点](screenshots/seven-details/final/relation-cards-light.png)。

## 测试结果

- `npm run build`：TypeScript、Vite、LAN 构建通过。
- `npm test`：**103/103 通过**。
- `node tests/seven-details-desktop.cjs`：通过。覆盖双主题、普通/紧凑/最大化、状态栏几何、浮层边界与命中、自动保存静默、附件外部点击/Esc/再次打开、按钮四态颜色/背景/字重/宽度/聚焦、快捷键操作列与真实操作、成功色、两秒淡出/悬停保持/连续通知合并。
- 保存失败使用隔离实例的 `/api/ops` 503 注入；解除拦截后从 Toast 重试成功，正文保留，三个附件引用与三个文件实体仍在。随后主动移除一条附件引用，确认仅该引用删除，文件中心三个实体仍在。
- `node tests/five-fixes-desktop.cjs`：上一轮详情/附件、卡片尺寸、历史、主题、普通/最大化/系统最小窗口下的坐标和 zoom 保持、SQLite 重开验证通过。
- `node tests/integrated-navigation-desktop.cjs`：原生最小化/最大化/还原/关闭到托盘、caption 双击、窗口位置/尺寸 API、导航、工具设置单实例、节点移动/连接/撤销重做、画布手势及主题回归通过。
- 专项运行 renderer `pageerror` 为 0。验证数据：[七项专项](screenshots/seven-details/final/verification.json)、[上一轮功能回归](screenshots/seven-details/final/previous-features-verification.json)、[窗口与导航回归](screenshots/seven-details/final/navigation-verification.json)。

## 检查边界

本轮未发现阻断七项验收的剩余问题。尚未专项覆盖多显示器/混合 DPI、触控、全量屏幕阅读器和人工物理鼠标拖动系统标题栏；原生窗口命令与拖动区域语义已自动验证。未收到用户所述 11 张截图，不能声称逐像素匹配那些参考图片。
