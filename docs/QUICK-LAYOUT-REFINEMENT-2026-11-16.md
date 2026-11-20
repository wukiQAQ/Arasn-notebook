# 速记布局与控件边框精修 · 2026-11-16

## 结果与根因
- 旧 NoteStatusBar 位于 quick-support 内，与最近列表并列；space-economy.css、detail-refinements.css 又将其绝对定位至整个面板底部。现已将同一个组件移至 quick-content 内，顺序为标题、正文、状态栏；删除旧浮动类和全部对应规则，无新增 z-index 避让。最近列表仍在容器外。
- QuickPanel 中只有一处 NoteStatusBar，无第二个 SaveStatus。工作区自己的状态栏属于另一页面，原布局保持。
- window-navigation.css 隐藏了速记工具栏标题，窄屏共享样式又设置顶端对齐。现恢复工具栏 21px/600 标题和垂直居中，窗口控制栏移除重复页面标题。宽屏显示搜索、新建和切换；600px 以下搜索和切换显示图标，保留标签及提示、新建文字。
- ui-system.css 的共享 secondary border 令普通按钮都带明显描边。默认改为透明边框，保留原低对比背景、轻 hover 边界、pressed 背景、selected 和 focus-visible。
- 设备弹窗关闭按钮复用原 Button/Dialog.Close，透明背景/边框，44×44 点击区域；hover/pressed 有背景反馈，键盘保留品牌色焦点环。
- 搜索外层拥有弱边框与统一品牌聚焦指示，子输入无重复边框；便签库未选筛选项透明边框，选中项以原品牌色强调。卡片必要边界保留。
- 未修改品牌颜色、保存、附件存储或切换实现。没有新增全局 outline:none。

## 本轮修改清单
| 文件 | 修改 |
|---|---|
| src/QuickPanel.tsx | 移动现有状态组件至正文容器，移除浮动类 |
| src/NoteStatusBar.tsx | 字数上限拆分为可响应收纳的文字，字数本身保留 |
| src/quick-recorder.css | 标题 21px |
| src/WindowNavigationBar.tsx | 速记模式去掉窗口栏重复标题，保留拖动区域 |
| src/window-navigation.css | 删除隐藏工具栏标题的规则 |
| src/space-economy.css | 删除旧浮动状态栏及正文覆盖预留规则 |
| src/detail-refinements.css | 编辑器内部底栏、响应式按钮、关闭控件、搜索和筛选状态 |
| src/ui-system.css | 次级按钮默认/hover 边框，修正窄屏工具栏对齐 |
| tests/quick-layout-refinement-desktop.cjs | 本次专项实测与截图 |
| docs/QUICK-LAYOUT-REFINEMENT-2026-11-16.md、HANDOFF.md | 结果与交接 |

## 实际窗口对比（亮暗主题结果相同）
| 内容视口 | 编辑器下沿 | 状态栏下沿 | 最近列表上沿 | 编辑器与最近间距 |
|---|---:|---:|---:|---:|
| 1440×900 | 820 | 819 | 840 | 20px |
| 820×700 | 620 | 619 | 640 | 20px |
| 500×540 | 472 | 471 | 486 | 14px |
| 390×560 | 492 | 491 | 506 | 14px |

390px 是测试中临时放宽窗口最小尺寸的压力测试；产品原有最小窗口 500×540 保持。

## 验证
- npm run build：通过；既有依赖打包警告仍存在。
- npm test：103/103，通过。
- node tests/quick-layout-refinement-desktop.cjs：通过；亮/暗 × 四尺寸，断言状态栏父节点、正常定位、正文/底栏/最近列表几何分离、状态数量唯一、标题和操作垂直居中、按钮无交叠且在窗口内。
- 专项交互：实际调用文件选择接口添加附件并展示数量；附件浮层/Esc；搜索打开/Esc；字数；保存；新建空白/切回原便签及附件；页面切换；键盘 Tab/Shift+Tab 和 Enter 关闭；筛选选择、搜索输入；关闭按钮四态测量及截图；无 pageerror。
- node tests/seven-details-desktop.cjs：通过，补充保存503失败/重试、自动保存静默、附件来源/移除仅删引用保留实体等已有回归。
- prefers-reduced-motion: reduce 已切换并确认匹配，沿用既有控件减少动画规则，未新增动画。
- git diff --check（本轮相关受跟踪源码）：通过。
- 两轮实际查看 Electron 渲染截图，修正窄屏对齐和筛选选中色被覆盖；最终查看窄屏双主题、中宽工具栏、关闭焦点、便签库、空白状态。

## 实际截图
最终 23 张 Electron 内容视口截图：`docs/screenshots/quick-layout/final/`，几何和状态测量：`verification.json`。

| 窗口 | 亮色 | 深色 |
|---|---|---|
| 1440×900 | [亮色](screenshots/quick-layout/final/light-1440.png) | [深色](screenshots/quick-layout/final/dark-1440.png) |
| 820×700 | [亮色](screenshots/quick-layout/final/light-820.png) | [深色](screenshots/quick-layout/final/dark-820.png) |
| 500×540 | [亮色](screenshots/quick-layout/final/light-500.png) | [深色](screenshots/quick-layout/final/dark-500.png) |
| 390×560 | [亮色](screenshots/quick-layout/final/light-390.png) | [深色](screenshots/quick-layout/final/dark-390.png) |
| 关闭按钮默认 | [亮色](screenshots/quick-layout/final/light-device-default.png) | [深色](screenshots/quick-layout/final/dark-device-default.png) |
| 关闭按钮键盘焦点 | [亮色](screenshots/quick-layout/final/light-device-focus.png) | [深色](screenshots/quick-layout/final/dark-device-focus.png) |
| 便签库 | [亮色](screenshots/quick-layout/final/light-library.png) | [深色](screenshots/quick-layout/final/dark-library.png) |

截图目录还含 hover/pressed、附件、搜索按钮焦点及空白便签。已有 Electron 回归证据在 `docs/screenshots/seven-details/layout-regression/`。

## 边界
本条消息没有实际收到所述六张参考附件，不声称已按附件逐像素比对。新截图来自隔离测试数据的真实 Electron 渲染，未覆盖用户生产数据；没有打包或启动新 EXE，也没有提交/推送。工作区原有未提交改动保持。
