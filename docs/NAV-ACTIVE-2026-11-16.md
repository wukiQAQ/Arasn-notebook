# 左侧主导航：底部柔光定位

面向桌面工作站用户，优先让当前模块一眼可见。比较“底部窄幅柔光”和“全周光晕”两种方向，选择前者，避免整块发光抢占内容注意力。

沿用现有布局、14px/500 字重、20px 图标、圆角背景与左侧定位线。复用现有主题的 action/focus 色：亮色 `#5d4bd2` / `#6955da`，深色 `#6954d8` / `#b6a7ff`。不引入新的配色系统。

## 实现

- 在主导航容器启用 `nav-active-surface`，以子项 `aria-current="page"` 作为唯一选中来源，其他容器可按同一约定复用。
- 选中项底部增加局部渐隐柔光、微弱底边与轻量阴影，没有复制文字/图标或做镜像反射。
- 亮色柔光混合 20% action 色，深色混合 48% focus 色，再经模糊和透明度衰减；默认光层 opacity .85，选中 hover 为 1。
- 背景、阴影与光层使用统一 220ms ease-out 淡变。不是跨项滑动轨道；旧位置淡出、新位置淡入。
- 字重不变；未选中项 hover 不发光。光层不接受鼠标事件，保留键盘焦点框。
- 减少动态时无过渡；强制颜色模式关闭装饰光，使用系统 Highlight 定位；390px 底部导航将光层收在控件内。

## 修改文件

- `src/nav-active.css`：可复用样式、局部主题 tokens、响应式与无障碍回退。
- `src/main.tsx`：引入样式，主导航容器启用 class；未修改导航业务逻辑。
- `tests/sidebar-desktop.cjs`：沿用真实 Electron 导航回归，补充效果截图与状态检查，并将运行期输入限制在隔离测试窗口。
- `HANDOFF.md`：更新交接状态。

## 验证

构建通过，原有构建警告保留；101/101 项现有单测通过。真实 Windows Electron 导航回归通过：唯一选中、hover 区分、字体不增粗、220ms 过渡、键盘切换、文件/设备/设置、亮暗主题、1440/820/390、减少动态与强制颜色模式。

两轮实际截图检查：首轮确认层级、光层范围与字体；第二轮降低亮色光强、增强深色底部光，检查完整桌面及390px，无横向溢出。首轮脚本将减少动态的序列化时长误要求为两项，实际返回单项 `0s`；改为判断所有时长为零后最终回归通过。

最终截图目录：`docs/screenshots/sidebar-redesign/nav-active-final/`。

- [亮色导航局部](screenshots/sidebar-redesign/nav-active-final/nav-light.png)
- [深色导航局部](screenshots/sidebar-redesign/nav-active-final/nav-dark.png)
- [亮色完整界面](screenshots/sidebar-redesign/nav-active-final/desktop-light.png)
- [深色完整界面](screenshots/sidebar-redesign/nav-active-final/desktop-dark.png)
- [390px](screenshots/sidebar-redesign/nav-active-final/workspace-390.png)

日志：`docs/screenshots/nav-active/logs/`。截图来自实际 Electron 渲染，未使用设计稿替代。未重新打包 EXE，未提交或推送；此前窗口专项的第二、三批仍未实施。
