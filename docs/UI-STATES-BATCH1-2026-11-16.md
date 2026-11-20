# Arasn UI/UX 精修第一批：交互状态与焦点 · 2026-11-16

## 范围与决策
已读AGENTS.md、HANDOFF.md及相关实现，未发现本批需要破坏性架构改动。保留品牌、整体配色、组件DOM结构、按钮回调、数据模型、编辑器与原生窗口生命周期。
设计比较：逐处覆写（继续积累状态漂移）、建立共享状态规则并局部指定焦点所有者（采用）、替换所有按钮/表单组件（本批不需要）。使用现有语义色tokens，160ms颜色/背景/边框过渡，主按钮保持品牌强调，次级按钮用中性色明度；选中不改变字重或尺寸，不通过弹跳反馈。保留已确认的NavItem图标柔光与GlassSurface。
本次未收到所述六张截图附件，依据需求文字、代码与实际Electron渲染检查，不能声称完成与TapNow截图的对照。

## 具体根因
1. `src/xigra/file-station.css` 的.file-query:focus-within外环，与 `src/style.css` 的.file-station input:focus-visible及公共输入outline同时生效，形成父子双环。
2. `src/quick-recorder.css` 给quick-title设置内侧2px矩形outline，叠加标题下划线；`src/xigra/shell.css` 的quick-content:has(.quick-input:focus-visible)又对整张正文容器反馈。
3. `primitives.css`、`interaction.css`、`note-file-polish.css`及各组件的状态规则分散，Hover会被后续背景规则覆盖；Pressed与菜单焦点缺少统一规则。
4. `LagoonMotion.tsx`通过Web Animations API播放图标位移/弹跳，CSS覆盖无法停止，须对本批区域排除。
5. Chromium文本输入框在鼠标点击后也可能匹配:focus-visible，单用该伪类不能满足“鼠标轻量/Tab清晰”的区别。

## 修改文件
- `src/control-states.css`：统一文件中心、便签区、顶部header工具栏、设置弹窗、命令与文件菜单的Default/Hover/Pressed/Selected/Focus-visible/Disabled；沿用语义色，主/次/危险动作分级；不切换字重/几何，不叠加内部图标transform。
- `src/FocusModality.tsx`：仅记录根DOM焦点来源；pointerdown与Tab/修饰快捷键捕获，无React状态更新，不修改输入值/选择区。文本复合控件由父容器独享键盘环；标题独享底部单线，正文只用局部细竖线，不框整张正文；复选框由标签独享键盘环。
- `src/LagoonMotion.tsx`：目标区域停用旧JS图标动作，保留其余既有作用域。
- `src/main.tsx`：加载状态样式、挂载无UI的FocusModality。
- `tests/control-states-desktop.cjs`：真实Electron专项，测试数据隔离至临时目录并清理。
- 本报告与HANDOFF.md，构建产物dist已更新。

## 验证结果
- `npm run build` 通过，既有bundler指令/体积警告仍在。
- `ARASN_STATES_PASS=final node tests/control-states-desktop.cjs` 通过：亮暗共18组组件，各组Default/Hover/Pressed背景变化、字重和尺寸恒定、图标不位移、160ms；选中与disabled语义、键盘菜单；标题/正文/文件搜索/复选框单一焦点所有者；125%/150%页面缩放、1440/820/390、减少动态与强制颜色；草稿切换后保留，无renderer错误。
- `ARASN_RECORDER_PASS=states-regression node tests/quick-recorder-desktop.cjs` 通过：标题/正文、光标、搜索、文件、加入画布、重启恢复、五种宽度。
- `ARASN_GLASS_PASS=states-regression node tests/glass-search-desktop.cjs` 通过：单层blur、亮暗、搜索/上下键/Enter/Escape/Ctrl+K、1440/820/390、减少动态/透明度/强制颜色；本机短时输入采样与关闭blur对照无明显恶化。
- `git diff --check` 对本轮已跟踪代码通过。
- 首轮与最终实际截图均已产生并查看代表场景（标题鼠标/键盘、文件搜索、菜单键盘焦点、设置Hover、亮暗与390等）。最终65张PNG及metrics.json在 `docs/screenshots/control-states/final/`。测试期间修正了定位隐藏的速记记录列表，以及Select指针选择退出与键盘重开之间的夹具等待，不据此声称业务菜单有缺陷。

## 入口绑定初查与后续范围
现有main顶部ViewSwitch调用switchView(false)，QuickPanel的“打开工作区”调用expand，方向相反、分别在工作站和速记模式显示；不能因为图标相似直接删掉。新建便签分别调用records.open或addText，取决于页面上下文，语义需结合页面核对。完整去重留第三批，本批未删任何入口。
第二批仍未实施：设置分类、分组、快捷触发管理、小窗口分类导航与保存反馈整理；当前设置仍纵向拥挤。第三批仍未实施：完整入口动作核对/去重、页面/浮层动效统一、原生窗口专项。没有把其验收项当作本批已通过。

## 限制与停止点
按要求第一批完成后停止，不自动执行第二/三批。页面缩放不等于物理混合DPI；未进行真实多屏、长稳、屏幕阅读器、全量业务回归或新一轮Win32生命周期专项。未打包EXE/提交/推送，保留此前未提交工作。
