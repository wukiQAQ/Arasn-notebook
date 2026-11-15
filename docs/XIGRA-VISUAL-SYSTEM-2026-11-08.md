# XIGRA｜隙格 · 视觉审查与统一方案

本轮沿用工作站的结构、布局密度和卡片层级，采用同一套浅松绿、冰白与薄荷角色。小窗继续专注速记和投递，工作站继续承载导航、整理和共享。

## 现有界面审查

在真实 Electron 中保存了 12 张改前截图。下表颜色和字号来自运行时计算样式或实际生效的根变量。测试把窗口内容区设到指定尺寸，独立于生产窗口尺寸限制。

| 审查点 | 展开工作站实际表现 | 紧凑面板及重复点 |
| --- | --- | --- |
| 背景、卡片、边框 | 亮色 `#F4F3F5` / `#FFFFFF` / `#DCD8E0`。暗色 `#242323` / `#34312E` / `#50463E`。浅底与实色内容卡的层级值得继承 | 小窗亮色是 `#F3F7F5` / `#FFFFFF`，暗色 `#11231D` / `#1A2E26`。`desk.css` 与 `lagoon.css` 都定义同名全局色，小窗再局部覆盖一次 |
| 主色与选中 | 亮色莓灰 `#73566E` 与 `#E9E1EB`，暗色杏棕 `#E4B68E` 与 `#4B3E34`。导航选中实际对比 5.00 / 5.58 | 小窗使用深松绿及薄荷色，品牌图标也不同。弹窗挂载在应用根之外，会读到工作站的旧全局颜色 |
| 字体与正文 | Segoe UI 与微软雅黑系统字体。页标题 25 px / 450，导航 12 px / 600，常规便笺 18 px，文件名 14 px / 700。标题、导航和默认便笺采样均超过 4.5∶1 | 小窗 18 px / 600 标题、16 px 编辑正文、12 px 状态。编辑区对比 15.50 / 12.48。应统一字号角色，保留工作站画布的文档字号 |
| 控件形状与阴影 | 选中导航 16 px，新建按钮是非对称 16/7 px，文件输入 10 px，共享主按钮 5 px。工作站画布平面与浮动工具条分层有效，面板描边和浮层阴影来自不同文件 | 小窗工作站按钮 8 px，编辑容器 12 px。同一类动作和弹层需要统一半径、描边和浮层阴影 |
| 表单与状态 | 文件列表、搜索和共享链接使用不同输入样式。共享状态由文案辨识，链接复制按钮还混入旧强调色。960 px 顶栏隐藏保存状态 | 小窗已有独立的等待、保存、处理中、错误色，工作站没有用同一个组件。共享、警告和导入结果需要明确的语义槽 |

证据：[亮色工作站](screenshots/xigra-unified/before/light-workbench-960x680.png) · [暗色工作站](screenshots/xigra-unified/before/dark-workbench-960x680.png) · [亮色小窗](screenshots/xigra-unified/before/light-quick-480x560.png) · [运行时原始值](screenshots/xigra-unified/before/checks.json)。截图遮盖临时测试共享链接。

## 统一方案

比较过两个方向。直接把莓灰暖棕推广到小窗最接近旧工作站，但会放弃指定的松绿品牌方向。选用工作站的低饱和中性色、实色卡片和清晰分层，再把深松绿与薄荷分配给品牌和选中状态。暗色采用炭松灰，控制绿色覆盖面积。

| 语义角色 | 亮色 | 暗色 | 用途 |
| --- | --- | --- | --- |
| 窗口 / 表面 / 次表面 | `#F3F6F5` / `#FFFFFF` / `#EAF0ED` | `#1C2421` / `#25302B` / `#2B3731` | 窗口底、编辑器和弹窗、列表分组 |
| 文字 / 次文字 | `#1D2924` / `#4C6258` | `#EBF3EF` / `#B0C5BA` | 主文、说明与元信息 |
| 品牌按钮 / 按钮字 | `#184438` / `#FFFFFF` | `#A9DCC8` / `#142A21` | 标志、新建和确认动作 |
| 选中背景 / 选中文字 | `#DFEFE8` / `#184438` | `#344D41` / `#D2F0E3` | 导航、工具、列表和命令高亮 |
| 普通分隔 / 控件边界 / 焦点 | `#D3DFD9` / `#738A7F` / `#237356` | `#45574E` / `#789488` / `#A9DCC8` | 区域分隔、需要辨识的输入边界、键盘焦点 |
| 成功 / 警告与等待 / 错误 | 独立绿、琥珀、红三组前景与底色 | 同角色的低亮底色与高对比前景 | 状态文字、状态点、提示区 |

字体采用系统 Segoe UI 和微软雅黑回退。标题 24/600 或 18/600，操作 14/600，正文 16/400，元数据 12/400。采用 4/8/12/16/24/32 间距，8 px 控件、12 px 卡片、14 px 浮层，内容卡使用描边，浮层共享一档阴影。画布记录的用户字号和颜色是内容数据，保留原值和导出语义。

1. **基础层**　将双主题及历史变量映射收敛到 `src/xigra/tokens.css`。移除旧主题重复定义。根作用域覆盖 Portal，主进程及协议保持现有边界。
2. **组件层**　统一品牌标志、标题、按钮、焦点、导航选中、编辑表面、文件列表和输入、弹窗及菜单。两窗复用状态组件。已有白板共享按关闭、正在处理、已开启使用真实状态，逐项文件传输尚未接入。
3. **验收层**　前后各抓取两主题下的 400×460 与 480×560 小窗、960×680 工作站及文件和共享场景。抽查主要文字的 4.5∶1、必要非文字控件和焦点边界的 3∶1，验证键盘可见焦点、无裁切和现有保存、展开、文件及共享路径。此处的数值是 WCAG 2.2 AA 相关项的抽样检查范围。 [文字对比](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) · [非文字对比](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) · [可见焦点](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)

## 实施与复核结果

全局根 Tokens 同时覆盖桌面工作站、小窗、共享页和 Portal。两窗复用 XIGRA 标志与保存状态组件。导航、主要和次要操作、编辑容器、列表与表单、弹窗、空结果及反馈各使用明确的角色。共享已开启、等待和警告均有文字。第二轮修正了暗色工作站的独有标题缩进、列表操作的重复描边，以及多条共享链接导致提示区被推到弹窗底部的问题。

| Electron 内容尺寸与场景 | 亮色前后 | 暗色前后 |
| --- | --- | --- |
| 小窗 480×560 | [改前](screenshots/xigra-unified/before/light-quick-480x560.png) · [改后](screenshots/xigra-unified/after/light-quick-480x560.png) | [改前](screenshots/xigra-unified/before/dark-quick-480x560.png) · [改后](screenshots/xigra-unified/after/dark-quick-480x560.png) |
| 小窗 400×460 | [改前](screenshots/xigra-unified/before/light-quick-400x460.png) · [改后](screenshots/xigra-unified/after/light-quick-400x460.png) | [改前](screenshots/xigra-unified/before/dark-quick-400x460.png) · [改后](screenshots/xigra-unified/after/dark-quick-400x460.png) |
| 工作站 960×680 | [改前](screenshots/xigra-unified/before/light-workbench-960x680.png) · [改后](screenshots/xigra-unified/after/light-workbench-960x680.png) | [改前](screenshots/xigra-unified/before/dark-workbench-960x680.png) · [改后](screenshots/xigra-unified/after/dark-workbench-960x680.png) |
| 文件列表 | [改前](screenshots/xigra-unified/before/light-files.png) · [改后](screenshots/xigra-unified/after/light-files.png) · [空结果](screenshots/xigra-unified/after/light-files-empty.png) | [改前](screenshots/xigra-unified/before/dark-files.png) · [改后](screenshots/xigra-unified/after/dark-files.png) · [空结果](screenshots/xigra-unified/after/dark-files-empty.png) |
| 白板共享 | [关闭](screenshots/xigra-unified/after/light-share-idle.png) · [开启](screenshots/xigra-unified/after/light-share-active.png) | [关闭](screenshots/xigra-unified/after/dark-share-idle.png) · [开启](screenshots/xigra-unified/after/dark-share-active.png) |

- 实际 Electron 抓取 12 张改前和 14 张改后截图。三组目标尺寸未发现关键控件裁切或文档横向溢出。测试临时放开最小内容尺寸，生产外框仍是默认 620×700、最小 500×540。
- 亮暗共 52 组文字、图标前景与背景采样，最低 **5.56∶1**。焦点及必要控件边界色与两种表面的最低组合 **3.41∶1**，两种主题均用 Tab 实测了 2 px 焦点环。属于抽样验证，未覆盖所有控件、用户自定义便笺颜色及辅助技术组合。
- 构建、真实 Electron 保存、快速拖入、工作站文件搜索和空状态、白板共享开启与关闭通过。文件导入、回收还原、剪贴板和强制退出后恢复回归通过，存储和服务测试 8/8 通过。物理全局热键、多屏和读屏仍未复测。
- 本轮统一的是应用渲染界面。Windows 原生标题栏和系统选择器按系统绘制，用户自定义画笔与便笺颜色保留。局域网状态覆盖现有白板共享，逐项文件互传及其进度界面尚未实现。

[改后测量记录](screenshots/xigra-unified/after/checks.json) · [截图与验收脚本](../tests/xigra-theme.cjs)
