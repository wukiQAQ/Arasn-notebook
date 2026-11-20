# Arasn 五项 UI 专项修复 · 2026-11-16

## 范围与设计方向

本轮仅处理缩放控件、画布便签卡片、顶部窗口栏、窗口尺寸适配、设置分类布局。未执行其他历史改版需求。

目标用户是在桌面应用中记录、浏览与整理便签的人。优先级为画布内容、当前操作、辅助状态。比较了三种方向：保留内联正文编辑、摘要卡片配浮层详情、常驻侧栏详情。选择摘要卡片配浮层详情：可控制卡片阅读密度，完整编辑不压缩画布，继续复用现有附件与保存机制。

沿用项目主题和字体变量，不新增品牌配色。缩放条使用一个轻边框，按钮无独立边框、34px 点击区和 13px 普通字重百分比。标题最多两行，摘要最多三行；卡片手柄是独立的 24px 操作区。设置左导航 200px，窄于 760px 改为分类列表与详情切换。顶部维持 48px。

## 五项修改

| 问题 | 实际修改 | 状态与业务边界 |
| --- | --- | --- |
| 缩放控件厚重 | 自由工作页与关系画布统一低对比度一体浮条；移除内部按钮边框；弱化百分比；仅 hover/pressed 提示按钮背景；深浅主题独立阴影 | 原缩小、百分比复位、放大、适配处理函数不变 |
| 便签卡片 | 标题与摘要分开，标题两行、摘要三行；拖动把手、复制/删除、详情、尺寸手柄分区；元信息归底部；修复 Tooltip 透明定位层阻挡拖动；详情提供完整正文和真实附件 | 自由便签复用 BoardClient 编辑；关系详情复用 FloatingInspector 和 RecordAttachments；没有新增数据字段或改关系引用 |
| 顶部窗口栏 | 调整两侧内边距；导航与全局操作之间设轻分组；标题靠左并保留拖动区域；窄屏继续使用现有页面操作菜单 | 保留原生 titleBarOverlay、最小化/最大化/关闭到托盘；无新增品牌标题 |
| 普通/最大化布局 | 复用实际容器测量的自适应导航与工具栏；工具板限制最大高度、可内部滚动；浮层避开 48px 原生控制区域 | resize 不写节点数据、不触发适配、不重置缩放与相机中心；无全局 CSS scale |
| 设置长页面 | 外观、快捷键与触发、窗口与启动、数据备份四类；右侧只呈现当前分类；快捷触发保留键盘/鼠标/手势/边缘/高级分组；减少嵌套背景 | 原设置回调、保存、恢复和备份逻辑不变；离开快捷触发分类使用组件原有卸载清理结束录制 |

尺寸调整采用屏幕位移除以当前 zoom。拖动中只预览，释放时走原有提交/历史；取消或窗口失焦不保存预览。支持方向键微调，Shift 加大步长。用户主动调整的范围为 220–720px 宽、144–640px 高。已保存的历史卡片不自动改尺寸；新建自由便签为 280×180px，立即打开可输入的详情编辑器。定位便签读取其真实宽高。

## 修改文件清单

| 文件 | 用途 |
| --- | --- |
| `src/main.tsx` | 接入摘要/详情、尺寸调整、设置分类；新建便签保持即时编辑；对象尺寸约束；按实际尺寸定位 |
| `src/xigra/TopologyWorkspace.tsx` | 节点尺寸预览、既有历史提交、完整详情附件 |
| `src/CanvasNoteContent.tsx`（新增） | 自由画布便签摘要与完整正文/附件浮层 |
| `src/CardResizeHandle.tsx`（新增） | 两种画布共用尺寸手柄、缩放换算、范围与取消处理 |
| `src/SettingsLayout.tsx`（新增） | 分类导航和响应式详情容器 |
| `src/five-fixes.css`（新增） | 本轮局部样式、主题适配与窗口边界约束 |
| `tests/canvas-storage.test.cjs` | 更新旧元数据字段白名单，验证已有来源字段值，继续限制公开字段 |
| `tests/five-fixes-desktop.cjs`（新增） | 隔离真实 Electron 专项交互、截图与 SQLite 重开验证 |
| `docs/UI-FIVE-FIXES-2026-11-16.md` | 本报告与截图索引 |
| `HANDOFF.md` | 本轮状态与后续交接 |
| `docs/screenshots/five-fixes/final/` | 实际运行截图与几何验证数据 |

仓库原有其他未提交修改已保留；上表只记录本轮触及的文件，不将此前差异算作本轮实现。

## 实际运行截图

全部来自真实 Electron 应用和隔离测试数据，使用 PrintWindow 捕获本次测试窗口，包含原生窗口控制区；不是设计图。图片外框会包含系统边框。截图便签与附件为测试资料，不是用户生产数据。

| 场景 | 浅色 | 深色 |
| --- | --- | --- |
| 普通窗口，客户区 1160×820 | [查看](screenshots/five-fixes/final/free-light-normal.png) | [查看](screenshots/five-fixes/final/free-dark-normal.png) |
| 实际最大化 | [查看](screenshots/five-fixes/final/free-light-maximized.png) | [查看](screenshots/five-fixes/final/free-dark-maximized.png) |
| 系统返回的最小窗口（客户区 720×520） | [查看](screenshots/five-fixes/final/free-light-minimum.png) | [查看](screenshots/five-fixes/final/free-dark-minimum.png) |
| 完整便签正文与附件 | [查看](screenshots/five-fixes/final/note-detail-light.png) | [查看](screenshots/five-fixes/final/note-detail-dark.png) |
| 关系卡片与缩放控件 | [查看](screenshots/five-fixes/final/relation-light.png) | [查看](screenshots/five-fixes/final/relation-dark.png) |
| 关系便签详情与附件 | [查看](screenshots/five-fixes/final/relation-detail-light.png) | [查看](screenshots/five-fixes/final/relation-detail-dark.png) |
| 设置：外观 | [查看](screenshots/five-fixes/final/settings-light-appearance.png) | [查看](screenshots/five-fixes/final/settings-dark-appearance.png) |
| 设置：快捷键，上部 | [查看](screenshots/five-fixes/final/settings-light-shortcuts.png) | [查看](screenshots/five-fixes/final/settings-dark-shortcuts.png) |
| 设置：快捷键，滚动到底部 | [查看](screenshots/five-fixes/final/settings-light-shortcuts-bottom.png) | [查看](screenshots/five-fixes/final/settings-dark-shortcuts-bottom.png) |
| 设置：窗口与启动 | [查看](screenshots/five-fixes/final/settings-light-window.png) | [查看](screenshots/five-fixes/final/settings-dark-window.png) |
| 设置：数据备份 | [查看](screenshots/five-fixes/final/settings-light-backup.png) | [查看](screenshots/five-fixes/final/settings-dark-backup.png) |

最小窗口设置：[分类列表](screenshots/five-fixes/final/settings-minimum-list.png)、[分类详情](screenshots/five-fixes/final/settings-minimum-detail.png)。

旧版关系画布实际截图：[修改前](screenshots/five-fixes/before/relation-before.png)。该早期测试资料标题较短，仅用于比较旧缩放控件和节点结构，不作相同文案的像素对比。

## 验证结果

- `npm test`：完整默认测试集 **103/103 通过**。首次发现旧附件元数据白名单未包含此前已有的两个来源字段；更新精确字段白名单并补充来源值断言后全量通过，未改后端逻辑。
- `npm run build`：通过 TypeScript、Vite 和 LAN 构建。
- `node tests/five-fixes-desktop.cjs`：通过。测试真实正文与附件、详情编辑、新建便签即时输入、自由/关系卡片尺寸拖动和键盘边界、关系尺寸撤销/重做、主题切换、设置分类、小窗口列表/详情切换。
- 窗口专项断言：普通、实际最大化、系统真实最小尺寸下，保存的节点位置/宽高、当前 zoom 与相机中心保持不变；页面无横向溢出；工具板不越出画布；设置浮层位于原生控制区下方。
- 关闭测试进程后重开 SQLite：完整正文、420×280px 的已调整尺寸、原 x/y、附件实体和便签附件引用仍在。
- `node tests/integrated-navigation-desktop.cjs`：通过原生最小化/最大化/还原/关闭到托盘、caption 双击最大化、窗口位置/尺寸 API、导航、单一工具参数浮层、节点移动/连接/撤销重做、画布手势和主题回归。
- 窗口状态、关系命中、文件来源/生命周期、存储恢复：22 项通过。
- 快捷键注册与智能触发：9 项通过。
- 专项运行无 renderer `pageerror`。几何记录见 [verification.json](screenshots/five-fixes/final/verification.json)。原生导航回归记录见 [navigation-verification.json](screenshots/five-fixes/final/navigation-verification.json)。

真实截图进行了多轮查看，修正了透明 Tooltip 拦截尺寸拖动、元信息底部间距被覆盖、最小窗口弹窗贴近系统按钮，以及深色主题旧 `.modal` 规则覆盖详情宽高的问题。最终复查包括浅/深色普通和最大化画面、最小窗口、两类便签详情、设置与快捷键画面。

## 检查边界

本轮未发现阻断上述五项验收的问题。未专项覆盖人工鼠标拖动系统标题栏、多显示器/混合 DPI、触控与全量屏幕阅读器；拖动区域的 CSS 语义及系统窗口命令已自动验证。极低缩放下沿用原有关系画布简化显示规则。没有打包或安装新的 EXE，也没有提交或推送代码。
