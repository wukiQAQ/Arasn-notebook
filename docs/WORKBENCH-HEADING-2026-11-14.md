# 工作站模块标题

左侧侧栏 Logo + Arasn 继续作为唯一全局品牌。右侧原固定 Arasn 改为语义 h1，按现有页面状态显示：自由工作页、关系画布、速记、文件中心。共享浏览器工作页显示“自由工作页”并保留共享副信息。

采用简洁模块标题，未增加额外面包屑和计数。标题沿用现有字号/字重与色彩，移除品牌字距并重置 h1 默认边距，保留顶部高度、留白、右侧按钮和保存状态。关系画布标题使用主文字色。没有更改路由、正文、保存或侧栏品牌。

修改文件：src/main.tsx、src/xigra/primitives.css、src/visual-order.css；tests/workbench-heading-desktop.cjs 为新增四模块标题和截图检查；tests/quick-panel.cjs、tests/quick-topbar-desktop.cjs 更新旧品牌断言，现分别检查模块标题和侧栏品牌；dist 已构建。

验证：npm run build 成功；workbench-heading 四模块在1440/820/390宽度的路由对应、标题、品牌保留、唯一选中态、无横向溢出、标题与操作不重叠通过。sidebar-desktop 导航/设备/设置/亮暗主题/键盘及响应式专项通过；quick-panel 窗口切换/焦点/记录及尺寸恢复通过。图片来自真实 Electron，实际查看关系画布1440、自由工作页390、文件中心820图。

证据：docs/screenshots/workbench-heading/{before,after}/（12组截图和verification.json）、quick-regression/checks.json；侧栏回归图在docs/screenshots/sidebar-redesign/heading-regression/。

边界：关系画布截图处于未启用的原有引导页；无虚构节点数。EXE未重新打包，物理多显示器/DPI未重测。
