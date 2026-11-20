# 搜索浮层磨砂玻璃 · 2026-11-16

## 设计与实施
面向桌面快速检索，优先保证操作清晰与内容稳定。比较过仅输入条磨砂（父面板遮挡背景）、整块搜索浮层单层磨砂（采用，可透出真实内容）、全局浮动控件磨砂（范围过大）。本次只落地 Ctrl+K 搜索与快捷操作，不改变搜索或导航行为。

- `GlassSurface.tsx` 为轻量div组件，React19透传ref/DOM属性，兼容Base UI的render组合；基础样式 `.glass-surface` 可复用到搜索框、浮动条、输入容器等。
- 当前用法：`<Dialog.Popup className="command-popup" render={<GlassSurface />}>`；普通浮动区域可用 `<GlassSurface className="floating-input">...</GlassSurface>`。
- 深色：rgba(28,32,43,.78)，白边.09，16px圆角，blur(10px) saturate(120%)，0 8px 24px rgba(0,0,0,.22)，顶部白色高光.035。文字#F0F2F8，次级#B5BED0。
- 亮色：rgba(249,251,255,.78)，深灰蓝边.16，阴影.14，高光.46；文字#263044，次级#566279。
- 一块面板只使用一层blur，内部输入与选中行不叠加blur；整屏遮罩只轻度压暗，无模糊。blur/阴影/大面积背景不做动画，不设置常驻will-change。
- 保留焦点提示、输入法与原键盘交互；窄屏仍可滚动，桌面常用操作完整展示。减少透明度偏好下改实色/关闭blur；不支持backdrop-filter时实色降级。系统高对比度无blur，减少动态关闭浮层过渡。

## 真实验证
- `npm run build` 通过；既有bundler指令和包体积警告未新增处理。
- `ARASN_GLASS_PASS=final node tests/glass-search-desktop.cjs` 沙箱外真实Electron通过，测试使用临时独立数据，退出清理。
- 亮暗1440/820/390截图，真实正文/笔迹夹具作为玻璃后内容；已查看首轮/精修/最终实际渲染，修细滚动条、减弱焦点分隔线、避免末条常用操作初始截断。
- 搜索过滤/无结果、上下键、Enter执行、Esc关闭、Ctrl+K重开重置、初始焦点、无横向溢出、减少动态/减少透明度/强制颜色通过，无renderer错误。
- blur开启/关闭真实截图像素对照，排除输入区/首选项/页脚后，深色20640、亮色27840像素产生大于3的通道差异，确认确实模糊背景。
- 本机GPU合成启用。亮暗各采样90帧，包含逐字输入：blur开关两组rAF间隔中位数约6.1ms、P95约6.2ms，均0帧超过34ms。无结果过滤8/9ms（含Playwright调用开销）。原始记录 `docs/screenshots/glass-search/final/metrics.json`。

## 边界与交付
当前未附参考截图，按文字参数制作，不声称逐像素还原。性能数据仅为本机小型正文/笔迹场景的短时rAF采样，不代表GPU渲染耗时、低配机器、大型画布或长时间性能保证。未验证真正不支持blur的旧引擎（仅提供CSS降级）。未打包EXE、未提交/推送，保留已有未提交修改。

截图均来自真实Electron渲染内容；detail-*为局部，search-*为全窗口内容，非设计稿。最终目录：`docs/screenshots/glass-search/final/`；另留pass1作为精修前证据。示例文字/笔迹为临时验收数据，不写入用户数据。
