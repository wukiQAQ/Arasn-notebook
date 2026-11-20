# 关系画布与一体化窗口导航

## 结果和方案

本轮实施Windows一体化顶部导航。比较完全无边框并自绘系统按钮、隐藏原生标题栏并叠加原生按钮、保留双层标题栏三种路径后，采用第二种：Electron `titleBarStyle: hidden` + `titleBarOverlay`。应用绘制48px导航内容，最右侧由Windows绘制最小化/最大化/关闭按钮；保留原生边框、系统交互和既有关闭到托盘/保存确认流程。不是在原生标题栏下叠一排按钮。依据：[Electron官方自定义标题栏文档](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)。

顶部左侧侧栏开关/返回/前进，中间唯一页面名称及辅助数量，右侧页面操作/搜索/快捷操作/共享，最右侧预留原生按钮区域。大窗口页面操作直接并入顶栏，小窗口收进单一“页面操作”浮层，功能不删除。便签窗口也显示同一窗口栏，速记内部不再重复显示页面名称。

侧栏Logo与品牌文字移除，以原高度36px空白占位保留内部导航项目间距、尺寸、选中态和业务回调。系统任务栏/托盘仍使用应用图标；本轮隐藏的是窗口标题栏左侧品牌，并未删除应用身份或托盘功能。

标题中心空白区域是窗口拖动区，所有按钮及内容区域明确no-drag。测试发现内容区域需要显式no-drag，已补齐。原生caption双击最大化保留。亮暗主题同步更新原生按钮底色和符号色，不新增主题色系。

## 关系画布

- 左侧圆角悬浮面板，复用Button与free-tool-rail分组语言；与自由工作页共享背景、阴影、12px卡片圆角、44px工具按钮和激活态。小于1000px窗口仅显示图标与短分组标记，按钮具有Tooltip。
- 导航：选择与平移；创建：新建节点/创建连接；历史：撤销/重做；管理：整理节点/画布设置。
- 节点类型、搜索、截图导出和已移除节点继续在顶部辅助工具区，未丢失功能。未添加关系画布不需要的画笔/橡皮擦。
- 点击节点选中、拖节点移动、拖空白平移，Shift空白框选，多选后仍可批量移动；中键不再被renderer的全局触发器冲突标记禁止。空格仍可作为原有可选手势，但不是必需条件。
- 默认自动滚轮行为现在缩放；保留用户显式配置的触控板平移选项，Ctrl/捏合仍缩放。
- 创建连接使用已有connect函数和关系数据结构，撤销/重做继续使用原历史栈。节点/关系字段和自动保存协议均不变。

## 单一画布导航浮层

原FreeToolbar为每个工具创建独立Popover.Root/Popup，且共享动态settings内容。本轮收敛为一个Root、多个Trigger、一个Portal/Popup，从组件结构上避免多容器承载同一面板。未声称已稳定复现用户所见的持久双面板截图（当前消息未附该截图）。

工具切换和离开自由工作页关闭旧浮层；Esc在工具设置打开时优先关闭设置，避免被全局Esc隐藏窗口抢先处理。打开子下拉菜单时仍先由下拉菜单处理Esc。参数状态仍在原App层，不因关闭面板丢失；对象属性分区保留。

自由工具导航也移除独立“平移”按钮，保留选择工具下的上下文交互；未删除底层可选手势能力。实际可见标题和关闭按钮各一个，位置由Base UI避让和可用高度约束管理。

## 文件清单

| 文件 | 修改 |
| --- | --- |
| desktop/main.cjs | 隐藏标题栏、原生按钮叠加、亮暗同步 |
| src/WindowNavigationBar.tsx | 新增统一窗口导航及页面历史 |
| src/window-navigation.css | 48px导航、拖动/非拖动区、系统按钮预留、工具面板共享外观 |
| src/main.tsx | 单一页面标题/操作归属、侧栏品牌占位、历史导航、上下文关闭 |
| src/FreeToolbar.tsx | 单一设置Popover，移除独立平移按钮，Esc优先级 |
| src/xigra/TopologyWorkspace.tsx | 纵向分组面板、连接入口、中键与默认滚轮 |
| src/ui-system.css | 页面操作浮层复用共享按钮规范 |
| tests/integrated-navigation-desktop.cjs | 原生窗口、节点交互、单浮层、主题/尺寸专项 |
| HANDOFF.md、本报告 | 交接与证据 |

保留其他既有未提交修改，源码/dist已更新；未打包EXE、提交或推送。

## 实际验证

- npm run build通过。
- integrated-navigation-desktop通过：节点移动、撤销/重做、左键空白平移、中键平移、滚轮缩放、连接创建、Shift框选两个节点；返回/前进、侧栏收起/恢复正常。
- 导航浮层连续打开/关闭/再次打开三轮，始终一个可见Popup和一个关闭按钮；打开时从1440缩至720×800后完整处于窗口内，Esc关闭正常。
- 系统命令消息测试最小化、最大化、还原、关闭到托盘通过；native caption双击消息最大化通过；窗口位置API移动及实际内容尺寸调整通过。拖动区域/no-drag计算样式通过。未声称完成物理鼠标拖动标题栏、Windows Snap悬停菜单和混合DPI人工操作专项。
- 亮暗主题各1440/720和实际最大化检查，标题仅一个、无页面横向溢出、侧栏无品牌组件、工具面板不超出窗口。便签窗口切换及新顶栏截图通过。
- Windows PrintWindow捕获完整窗口，包含实际原生控制按钮。当前环境Chromium截图协议在部分窄窗口捕获曾等待超时，改用PrintWindow后完整专项稳定通过；自动化窗口禁用后台节流仅用于测试，不改变产品后台策略。
- node --test tests/window-manager.test.cjs tests/window-transition.test.cjs tests/relation-hit.test.cjs：15项通过。
- 未运行全量业务、其他操作系统、物理混合DPI、读屏、长稳性能检查。旧测试如果依赖.main内topbar h1或侧栏品牌，需要适配新的唯一window-page-title；不可据此恢复重复标题。

## 改前后截图

改前复用本聊天上一轮已经验收的客户端截图，不包含原生Windows边框；改后为本轮真实PrintWindow完整窗口截图，因此尺寸和截图边界有差异。当前消息未附参考桌面软件截图，本轮按文字结构实施。

| 内容 | 改前 | 改后 |
| --- | --- | --- |
| 关系画布布局/品牌/顶栏 | [改前客户端](screenshots/page-header/toolbar-system/relations-dark-normal.png) | [改后完整窗口](screenshots/integrated-navigation/final/native-dark.png) |
| 便签窗口栏 | [改前客户端](screenshots/toolbar-system/final/quick-dark.png) | [改后完整窗口](screenshots/integrated-navigation/final/quick-window.png) |
| 单一导航浮层 | — | [唯一标题与关闭按钮](screenshots/integrated-navigation/final/single-navigation-panel.png) |
| 亮色主题 | — | [完整窗口](screenshots/integrated-navigation/final/native-light.png) |
| 小窗口 | — | [720深色](screenshots/integrated-navigation/final/relations-dark-720.png) / [720亮色](screenshots/integrated-navigation/final/relations-light-720.png) |
| 最大化 | — | [深色](screenshots/integrated-navigation/final/relations-dark-maximized.png) / [亮色](screenshots/integrated-navigation/final/relations-light-maximized.png) |

测量记录：screenshots/integrated-navigation/final/verification.json。
