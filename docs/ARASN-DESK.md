# Arasn Desk 界面改造

## 2026-11-02 Hover / Fancy 交互细化（最新）

参考 [Hover.dev 按钮](https://www.hover.dev/components/buttons)、[滑动页签](https://www.hover.dev/components/tabs) 和 [Fancy 可变字体距离效果](https://www.fancycomponents.dev/docs/components/text/variable-font-cursor-proximity)，保留现有桌面信息架构，新增以下细节。使用自主实现，未复制收费组件代码。

| Before | After | Why |
| --- | --- | --- |
| 品牌字固定字重 | Arasn 五个字母按光标距离在 540–760 间变化 | 品牌区形成辨识度，正文保持稳定 |
| 图标笔画粗细与反馈不一致 | 1.65px 图标线条；工具悬停轻移、笔尖轻转、设置轻转 | 反馈与动作含义一致 |
| 命令项只有文字 | 语义图标、选中图标描边与执行回车标记 | 更快识别操作及当前选择 |
| 小窗选中态直接切换 | Base UI Indicator 在页签之间滑动，约 160ms | 显示模式切换关系 |
| 动态文字可能依赖网络或产生挤动 | 随包提供 Manrope 可变字体；字母固定占位 | 离线可用，避免字重变化挤动布局 |

技术实现：`src/ProximityBrand.tsx`、`src/interaction.css`。保留 Lucide 与 Base UI，不添加动画运行库。仅在品牌命中区域按指针事件触发单帧 rAF，不运行全局指针监听或常驻动画循环。触屏关闭距离字重与页签滑动；减少动态效果设置同时停用过渡并恢复默认字重。

字体：`src/assets/Manrope-Variable.ttf`（约 165KB），许可证 `public/fonts/Manrope-OFL.txt`。Vite 输出到已有 assets 路径，不修改 HTTP 静态访问白名单，不使用 CDN。

两轮真实 Chromium 检查：第一轮 `desk-motion-1/`；第二轮 `desk-motion-final/`。专项证据与截图位于 `docs/screenshots/redesign/motion/`：

- `brand-proximity.png`：品牌距离反馈。
- `command-icons.png`：命令面板图标与键盘选中状态。
- `quick-slide-tabs.png`：小窗页签底板。
- `touch-mobile.png`：触屏静态界面。
- `checks.json`：本地字体加载成功，靠近字重 760、离开恢复 540；字母占位宽度未改变；减少动效后过渡为 0s；实际触发 left/width 过渡且底板与选中页签位置/宽度误差小于 1px；零页面/控制台错误。

验证：`npm run build`、`node tests/motion-review.cjs`、`node tests/visual-review.cjs desk-motion-final`、`npm run test:ui` 均通过。原 UI 回归 1/1，12.0 秒正常退出。截图覆盖桌面、平板、手机、小窗与触屏模拟。未重新打包 exe，也未复测原生热键、托盘或真实触摸硬件。

2026-11-02。本轮用户新指示替代此前“文具工作台”视觉方向，产品仍以快捷记录、画图和信息传递为核心。

## 方向、布局与组件

采用石墨灰/冷白中性色、单一松绿品牌强调色。浅/深主题分别使用同一套语义变量：desk、surface、rail、ink、muted、line、accent、tint。样式位于 `src/desk.css`；旧 `workspace.css` 不再被主入口导入，保留供此前说明文档追溯。

主体变为左侧工作空间导航与真实便笺索引、右侧紧凑编辑工作区。索引显示便笺首行，点击滚动定位并聚焦编辑。顶部 48px 路径/状态栏、紧凑操作栏、贴近画布的工具栏与 32px 状态栏，去掉文具装饰、大标题和底部口号。手机折叠侧栏，保留新增、共享、导出、设置和命令入口。

已安装 `@base-ui/react`，实际使用 Dialog 管理设置、共享、命令面板的弹层与焦点，Tabs 管理小窗模式选择。保留原生文本输入与项目已有绘图工具，不引入 Panda CSS、Tailwind 或新的组件样式框架。

组件选择依据：[Park UI](https://park-ui.com/) 使用 Ark UI/Panda CSS；[coss](https://coss.com/ui) 基于 Base UI。现有工程是 React/Vite/CSS，直接使用 [Base UI](https://base-ui.com/react/overview/quick-start) 更适合逐步迁移。参考 [Linear Modal](https://www.ui-layouts.com/components/linear-modal) 的收放感，用 160ms CSS 透明度与 6px 位移实现，不增加 Motion 依赖。不复制参考中的营销卡片或引入新业务指标。

界面文字约 11–14px，主要标题 14px，品牌 20px。间距以 4/8px 为基础，控件圆角 4–6px；仅弹层保留轻阴影。绘图调色板中的多种颜色属于内容工具，不作为界面品牌强调色。遵守减少动效偏好。

## 新交互

- 完整页 Ctrl/Cmd+K 或点击命令入口：搜索新增、绘图、共享、PNG 导出、设置及真实便笺定位。
- 方向键选择、Enter 执行、Escape 关闭；无匹配时提供具体提示。
- 执行后清空查询；便笺索引自动反映已有数据，不注入演示内容。
- 520×640 小窗保留打字、画图和已有文件入口。文件模块的本地存储/导入/删除逻辑不在本轮重写。

## 视觉复查记录

已生成结构概念并与真实截图比较。生成图中的示例日期、待办、macOS 窗口按钮不作为需求：保留真实数据、Windows 原生窗口、既有便笺几何尺寸与绘图格式，因此不声称像素级复刻或“10/10”。

| Before | After | Why |
| --- | --- | --- |
| 文具工具架、展示性大标题 | 中性导航、紧凑编辑标题与工具区 | 把空间用于工作内容 |
| 侧栏重复介绍文案 | 真实便笺索引与定位 | 内容增多时仍能找到便笺 |
| 常用操作分散 | 可搜索且可键盘操作的命令面板 | 减少路径与鼠标移动 |
| 第一轮深色导出按钮仍为旧蓝灰 | 使用语义中性色，修正旧 `:is()` 规则的优先级 | 单一品牌色更一致 |
| 第一轮命令输入框大焦点边框 | 输入区域底线反馈 | 保留可辨识焦点，降低视觉噪声 |
| 第一轮手机品牌文字未绘制 | 移除父容器零字号隐藏技巧，改用独立桌面路径元素 | 正常显示手机品牌 |

`docs/screenshots/redesign/desk-1/` 是第一轮截图；最终截图位于 `desk-final/`。第二轮重拍并检查桌面深色、命令面板、390px 手机、320px 窄屏及小窗；与概念核对中性色、导航结构、工具密度。测试文字与笔迹使用隔离内存数据，未修改用户实际白板。

## 验证结果与边界

- `npm run build`：通过。Base UI 和 lucide 的 `use client` 指令在 Vite 客户端构建产生提示，不影响此次构建。
- `npm test`：6/6 通过。
- `npm run test:ui`：1/1 通过，12.1 秒正常退出；覆盖双客户端文字/绘图同步、离线恢复、冲突副本、拖动与 PNG 导出。
- `node tests/visual-review.cjs desk-final`：正常退出；1440、820、390px 页面与工具栏无横向溢出，补测 320px 页面；页面脚本错误为零。验证命令面板方向键、搜索/执行、无匹配状态、索引定位、弹窗焦点保持在内部、手机新增/编辑/删除和小窗切换不丢内容。
- 初次小窗测试发现桌面桥替身缺少新增 `onBoard` 接口，已补齐测试替身，没有回退真实桌面订阅行为。
- 本会话未提供 Browser 技能，因此沿用仓库 Playwright/Chromium；真实截图不等于原生 Electron 生命周期或真机验收。
- 文件中转站是已有并行改动，本轮只统一其基础外观。其完整存储流程、原生热键、托盘、自启动、真实两机与新版打包不在本轮验收结果中。

运行新版源码：在项目目录执行 `npm start`。截图复现：安装 Chromium，执行 `npm run build` 后运行 `node tests/visual-review.cjs desk-final`；可按本机安装路径配置 `PLAYWRIGHT_BROWSERS_PATH`。

关键文件：`src/main.tsx`、`src/CommandMenu.tsx`、`src/QuickPanel.tsx`、`src/desk.css`、`tests/visual-review.cjs`。
