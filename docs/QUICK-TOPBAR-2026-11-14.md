# 快速速记顶部信息架构

## 标题栏确认

desktop/main.cjs 创建 BrowserWindow 时使用默认原生 frame，title 为 Arasn、icon 为 appIcon，没有 titleBarStyle/titleBarOverlay/frame:false。WindowManager 仅管理尺寸/置顶/唤出，不替换标题栏。

真实 Win32 检查确认 WS_CAPTION，标题 Arasn、可移动/可关闭，WM_NCHITTEST 命中系统标题栏返回 HTCAPTION(2)。保留系统标题栏处理拖动、最小化和关闭。系统关闭继续触发原 close handler 隐藏到托盘。本轮没有修改 desktop 生产代码、窗口/托盘图标资源或完整工作站的品牌导航。

## 布局

采用单行“速记 | 搜索、新建便笺、展开图标+工作区”，删除速记独立 Logo+Arasn 品牌行及内容区重复的隐藏按钮。工作区按钮保留文字、aria-label 和 title=打开工作区；避免纯图标影响发现。沿用现有石墨主题/字体，标题16px，操作12px，按钮32px，普通顶部56px/短窗48px，窄窗边距16px。

比较纯图标方案（紧凑但依赖提示）与图标+短文字方案，选择后者。在更窄的兼容宽度中仅隐藏搜索文字，工作区文字保留。

同一620×700内容尺寸和同一记录，输入区顶部从106px变为56px，释放50px；短窗从88px变为48px，释放40px。输入、标题、正文、保存、最近切换、附件和关系画布保持原会话与回调。

## 文件

- src/QuickPanel.tsx：合并顶部、移除快速模式品牌和重复窗口按钮；完整工作站使用的 XigraBrand/ViewSwitch 未改。
- src/quick-recorder.css：单行高度、标题颜色/字号、工作区间隔及极窄搜索显示。
- tests/quick-topbar-desktop.cjs：修改前后截图、四档渲染缩放、原生样式/命中/鼠标拖动、全局快捷键、关闭隐藏和焦点恢复。
- tests/quick-panel.cjs：顶部断言更新为速记标题及无重复品牌，保留其他断言。
- tests/relation-canvas-desktop.cjs：隐藏测试使用原生关闭入口，取代本轮移除的重复隐藏按钮。
- dist/：构建更新；本文、HANDOFF.md 及 docs/screenshots/quick-topbar/ 为交付证据。

## 验证结果

- npm run build 成功；npm test 72/72通过。
- quick-topbar-desktop：620×700、500×540内容尺寸；devicePixelRatio=1/1.25/1.5/2 下按钮同一行、无横向溢出、底栏未越界。非整数缩放允许最多2px的窗口像素取整。
- 原生标题栏检查在四档渲染缩放均通过；系统实际 GetDpiForWindow=96。真实 Windows 鼠标事件在确认前台/光标命中属于临时测试窗口后拖动标题栏，位置由[650,166]变为[678,180]。
- 原生关闭隐藏、second-instance 唤出、选区/焦点保留通过；从专用前台测试窗口通过 Win32 SendInput 发送 Control+Alt+F23，全局快捷键实际唤出成功。
- 工作站品牌 Arasn 保留、往返窗口内容/焦点保留通过。
- quick-panel 原回归通过，最小原生窗口正文299px、无溢出；新增 quick-recorder 保存/标题/输入法合成/光标/文件/画布/重启专项通过；relation-canvas 完整专项通过，包含保存失败、原生关闭隐藏、唤出恢复、重试和关系去重。
- 实际查看修改前620、修改后620、500@150%、500@200%截图；第二轮截图复查及原生输入专项再次通过。没有发现需要继续改动的可见缺陷。

所有测试使用临时数据并清理，未操作个人便签。证据：screenshots/quick-topbar/{before,after}/verification.json、regression/checks.json；文件/画布回归证据在 screenshots/quick-recorder/topbar-regression/ 及 screenshots/quick-topbar/relation-regression/。

## 截图和边界

前后对照：screenshots/quick-topbar/before/content-620-dpi1.png、after/content-620-dpi1.png。截图来自真实 Electron 内容区域，截图工具不包含 Windows 系统标题栏；不能用这些图宣称已目视核查任务栏或系统托盘图标。原生标题栏依据配置、Win32样式/命中和鼠标拖动实测确认。

四档缩放为 Chromium 强制 device scale factor，不等同于跨显示器混合 DPI；后者及物理硬件手动体验尚未验证。独立 EXE 没有重新打包，本轮更新源码/dist。
