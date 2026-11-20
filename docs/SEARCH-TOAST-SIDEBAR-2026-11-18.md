# Arasn 搜索、Toast 与侧边栏专项 · 2026-11-18

## 实施范围与视觉方向
只处理速记搜索、搜索遮罩与窗口栏、重复搜索入口、成功通知和工作站导航。保留一体化 48px 窗口栏、品牌紫色、Segoe UI 字体栈和亮暗主题。
比较了现有居中搜索扩容、独立搜索侧栏、全屏搜索三种方向，采用第一种：改动集中且符合速记的临时查找任务。优先级为标题、摘要、选择反馈；没有可靠更新时间字段，不添加虚构时间。

## 实现
- 搜索宽度 `min(560px, 100vw - 32px)`；500px 宿主下实际468px；输入框44px；标题/摘要双层；结果容器独立滚动，行高64px。打开自动聚焦，↑↓选择，Enter打开，Esc关闭；保留原有匹配函数与草稿写入逻辑。增加 combobox/listbox 关联和选择状态，不通过字重突变反馈。
- 窗口栏根因：搜索的网页遮罩覆盖到窗口栏，原生 titleBarOverlay 控件在网页合成层之外，无法接受网页遮罩，形成色块断层。BrowserWindow 已是 hidden + 原生 overlay，并不存在另一个需删除的系统标题栏；复现时 document 保持 focus。搜索遮罩现在从48px下方开始，z-index100/101；顶部保持原有背景，不额外铺色块，也不改 focus/blur、原生按钮或拖动配置。原生截图及 WM_NCHITTEST=HTCAPTION 验证拖动区域保留。
- 顶部全局搜索仅在工作站渲染；速记保留内容工具栏搜索，不留下按钮占位。既有 Ctrl+K 命令搜索快捷键不变。
- 成功 Toast 使用指定四组浅/深绿色 tokens；保持胶囊、Check、约2秒、悬停/聚焦暂停、同类合并与减少动态效果。错误仍红、普通信息仍中性，并补充独立琥珀色 warning。文件中心原有 saved 语义映射为 success。状态栏原有成功色单独保留，附件管理面板未修改。
- 导航默认200px，展开可调180–280px，并预留至少320px主区；8px拖动边界，支持指针捕获及键盘左右/Home/End。紧凑64px，提供原有 Tooltip；顶部开关隐藏/恢复，下方紧凑开关在完整/紧凑之间切换。首个导航项仍距窗口栏下沿20px。
- 导航宽度/页面左内边距200ms ease-out；标签淡出、固定单行；隐藏结束后 visibility 生效；拖动无过渡，减少动态效果时取消过渡。编辑器不因伸缩重新挂载。
- 导航偏好走现有 `app:settings` 和 settings 存储，增加字段校验，不改变便签数据结构。浏览器 localStorage 仅作辅助；桌面动态端口下以持久 settings 为准。验证了真正关闭并重启 Electron 后恢复262px。

## 修改文件（仅指本轮内容，工作树原有改动保留）
| 文件 | 作用 |
|---|---|
| `src/xigra/records/RecordSearch.tsx` | 聚焦、键盘、选中项与独立遮罩 |
| `src/xigra/records/RecordList.tsx` | 可选搜索选择状态与无障碍属性，其他列表维持原用法 |
| `src/WindowNavigationBar.tsx` | 速记不渲染全局搜索按钮 |
| `src/search-sidebar-refinement.css` | 搜索尺寸、遮罩范围、导航三态和动效 |
| `src/useResizableSidebar.ts` | 宽度、三态、键盘、指针与持久设置 |
| `src/main.tsx` | 接线、导航切换与8px边界，移除旧即时 hidden 处理 |
| `src/Notification.tsx` / `src/Notification.css` | 成功视觉 tokens、独立警告语义 |
| `src/FileStation.tsx` | 原 saved 操作结果映射 success Toast |
| `src/board.ts` / `desktop/main.cjs` | 导航偏好类型、设置校验与恢复 |
| `tests/search-sidebar-desktop.cjs` | 新增双主题专项 |
| `tests/seven-details-desktop.cjs` | 更新本轮浅/深成功图标颜色预期 |
| `tests/integrated-navigation-desktop.cjs` | 采用现有一体化标题定位；增加导航切换相机/数据保持断言 |
| `HANDOFF.md` / 本报告 | 交接与验收记录 |

## 验证结果
- `npm run build`：通过。仍有依赖 use-client、chunk size、inlineDynamicImports 警告，无编译失败。
- `npm test`：103/103通过。
- 新专项：亮/暗主题；速记500×540、820×700、1440×900；工作站最小720×560、普通与最大化；独立滚动、焦点、键盘选择打开/Esc、草稿保持、导航拖动/键盘/三态、刷新及进程重启恢复、成功配色、悬停暂停与自动消失、减少动态效果。pageerror为空。
- 设备缩放1和1.5分别通过；截图及测量在 `docs/screenshots/search-sidebar/final/` 和 `dpr1.5/verification.json`。使用 Electron `--force-device-scale-factor`，并未修改 Windows 全局显示设置。
- `node tests/seven-details-desktop.cjs`：通过，覆盖双主题附件面板、引用移除保留文件实体、保存失败/重试、窗口尺寸、快捷键设置和画布回归。
- `node tests/integrated-navigation-desktop.cjs`：通过，包含真实 Windows 最小化/最大化/恢复/关闭隐藏系统命令、标题栏拖动区域、节点连接/撤销/重做、导航与主题。新增断言：完整/紧凑/隐藏切换后，自由画布相机、zoom、工具、DOM实例及整个 board 数据均保持。
- 检查了多轮实际渲染截图；第二轮压紧搜索列表行高、去掉调整边界整框焦点线，并将紧凑切换按钮移出主导航顶部，恢复20px间距。

## 实际截图
- `docs/screenshots/search-sidebar/final/light-search-native.png` / `dark-search-native.png`：包含系统窗口控件。
- `docs/screenshots/search-sidebar/final/light-search-500.png`：最小速记窗口。
- `docs/screenshots/search-sidebar/final/light-toast-success.png` / `dark-toast-success.png`。
- `docs/screenshots/search-sidebar/final/light-sidebar-full.png` / `dark-sidebar-compact.png` / `light-sidebar-hidden.png`。
- `docs/screenshots/search-sidebar/dpr1.5/`：150%设备缩放对应状态。
- `docs/screenshots/integrated-navigation/search-sidebar-regression/`：原生窗口与画布回归截图和 verification.json。
- `docs/screenshots/seven-details/final/`：附件与保存回归（沿用现有测试输出路径）。

## 边界与遗留
- 未收到用户提到的三张截图附件，不能声称逐张比对过参考图。
- 未手动切换 Windows 系统级100%/150%显示设置；已覆盖对应Electron设备缩放，但系统多屏/DPI切换仍需实机人工核对。
- 动画已检查CSS时长、减少动态效果、状态及多轮截图，没有提供视频或逐帧帧率分析。
- 未重新打包安装EXE、未提交/推送。运行旧安装版不会自动更新；本轮输出为源码与最新dist。
