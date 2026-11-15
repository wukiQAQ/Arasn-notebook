# Arasn 前端设计与视觉验收

2026-11-02 · 基于现有 0.5.0 React / TypeScript / Electron 工程。

## 任务与选择

用户是需要随时记下会议内容、画草图并向同事传递信息的办公人员。主要任务仍是快捷呼出、打字与画图切换、主动开启局域网共享。默认 520×640 小窗优先，完整工作页和手机浏览器共享页面也需可用。不新增账号、统计面板、多页或虚构产品指标。

| 方向 | 字体 | 配色 | 布局与留白 | 图片策略 |
| --- | --- | --- | --- | --- |
| 文具工作台（采用） | 雅黑 UI 正文；Georgia 品牌字；系统字体回退 | 雾灰、纸白、松绿 | 桌面工具架 + 大纸张；小窗页签 + 编辑纸张；留白集中在画布 | 不使用装饰照片；矢量纸边、细点阵和真实笔迹 |
| 精密制图台 | 等线正文；Consolas 用于尺寸信息 | 冷白、石墨、工程橙 | 顶部紧凑工具带、强网格、较密间距 | 几何线条、工具示意，不使用营销插画 |
| 柔和便笺本 | 雅黑正文；宋体标题 | 浅米、苔绿、淡黄 | 便笺导航 + 单页编辑，舒展段落间距 | 页签、纸张折角和便笺纹理 |

选择文具工作台：现有松绿色可以延续，深绿工具架使完整页可识别，纸张和不对称页角呼应“随手页”。不使用渐变、卡片网格或营销大图；把视觉注意力留给内容。浅色工作台与深色工作台使用同一套语义变量。

## Design Tokens

源文件：`src/workspace.css`。复用原有 `src/style.css` 的画布尺寸、笔迹、便笺拖动与窗口基础规则，用独立的设计层定义语义主题和响应布局，不改变数据坐标。

| Token | 浅色 | 深色 / 角色 |
| --- | --- | --- |
| `--desk` | `#edf1ef` | `#18241f`，外围桌面 |
| `--surface` | `#ffffff` | `#23332c`，纸张、输入与弹窗 |
| `--ink` | `#243d35` | `#e2ebe5`，主要文字 |
| `--muted` | `#607169` | `#adbbb2`，辅助文字 |
| `--line` | `#d5dfd9` | `#45564b`，结构分隔 |
| `--accent` | `#315e4e` | `#a9d7bb`，工具选中与焦点 |
| `--tint` | `#e3eee7` | `#354d40`，浅选中面 |
| `--rail` | `#23473b` | `#142b22`，工具架 |

字号：品牌 29px，桌面主标题 32px，手机主标题 26px，正文与主要操作 13–14px，辅助信息 11–12px。间距：4/8/12/16/24/32px。控件圆角 6px，纸张外框 12px，便笺和小窗纸张使用非对称页角。字体不依赖网络下载。

桌面为左对齐标题、右侧共享动作、中部纸张。≤1100px 工具栏分为“模式与预设颜色”和“工具参数与缩放”两行；≤720px 改为品牌顶栏和直接操作按钮。保留画布自身滚动，不把 1600×1000 内容强制缩成无法阅读的小图。

## 真实截图与两轮修复

截图在真实 Chromium 浏览器中生成，使用隔离内存服务端。截图文字是测试内容。没有读取或更改用户实际白板文件。

第一轮，依据 `screenshots/redesign/before/` 的真实截图，修复五项：

1. 状态、辅助文字过小偏淡：提高到 11–13px，改用语义文字色。
2. 390px 工具栏内容宽 516px、可见宽 364px：改为响应布局，完整露出工具和缩放入口。
3. 手机端隐藏侧栏后缺少新增、设置入口：增加手机专用操作，桌面保持现有入口。
4. 空白提示固定在大画布坐标内：移到可见纸张容器，按可见区域居中。
5. 小窗品牌、模式、编辑区层级弱：统一品牌字和纸张形态，改为底线页签，明确当前模式。

第一轮修复后捕获并检查 `round-1/` 的桌面空白态、手机内容态、深色手机态及打字小窗。

第二轮，根据第一轮截图细化：统一深色按钮、便笺与外围背景，避免旧主题覆盖新语义色；把小窗输入焦点的大矩形改为可见的左侧强调线；扩大触控命中范围。复查 `round-2/` 后，发现 820px 的撤销按钮单独换行，再将模式、颜色和参数明确分组。最终重新构建与捕获 `final/`，检查桌面、手机、平板、小窗、深色和空白态。

最终截图：

- [桌面空白态](screenshots/redesign/final/desktop-empty.png)
- [桌面内容态](screenshots/redesign/final/desktop.png)
- [桌面深色](screenshots/redesign/final/desktop-dark.png)
- [820px 平板](screenshots/redesign/final/tablet.png)
- [390px 手机](screenshots/redesign/final/mobile.png)
- [手机空白态](screenshots/redesign/final/mobile-empty.png)
- [手机深色](screenshots/redesign/final/mobile-dark.png)
- [320px 窄屏](screenshots/redesign/final/mobile-320.png)
- [520×640 打字小窗](screenshots/redesign/final/quick-text.png)
- [520×640 画图小窗](screenshots/redesign/final/quick-draw.png)

## 审查与验证

已使用 frontend-design 制定方向、visual-qa 执行截图复查。本环境未安装 web-design-guidelines 技能，因此没有声称执行该技能；按公开 [Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines/blob/main/command.md) 检查了控件命名、焦点、响应布局、主题与减少动效设置。

- `npm run build`：TypeScript 与 Vite 构建通过。有 lucide-react 的 `use client` 打包提示，无构建错误。
- `npm test`：6/6 通过。默认沙箱临时目录曾出现文件重命名 EPERM；改用项目内隔离临时目录后通过，未修改服务端实现。
- 原有 `tests/board.spec.ts`：1/1 通过、正常退出，覆盖双客户端文字/笔迹、离线恢复、冲突副本、便笺拖动、PNG 导出。常规 `webServer` 方式曾出现退出等待；改用同一内存服务端、临时无 webServer 的配置运行原用例，最终输出 `1 passed (9.1s)`，临时配置已删除。
- `node tests/visual-review.cjs final`：正常退出、零页面脚本错误；1440/820/390px 页面和工具栏均无横向溢出。补充检查 320px 页面宽度、手机新增/编辑/删除、弹窗 Tab 焦点循环、小窗模式切换保留文字。
- 弹窗增加首次聚焦、Tab 循环与关闭后焦点归还；编辑区域增加跳转入口；遵守减少动效偏好。

小窗截图渲染的是真实 QuickPanel 组件，但 Electron 桥通过浏览器测试替身提供。此次没有重新验证原生窗口热键、托盘、多显示器、真实两机同步、自启动，也没有重新打包 release 目录。手机截图使用浏览器视口模拟，并非真机触控验收。画布拖动/绘画仍依赖指针手势，不是完整无障碍认证。

## 运行与复查

完整应用：`npm start`（构建后启动 Electron；使用原有用户数据目录）。仅运行 `npm run dev` 没有白板 API。

隔离预览：`npm run build` 后执行 `node tests/serve.cjs`，浏览器打开 `http://127.0.0.1:47839/#ui-test-token`，使用内存数据，关闭服务即清空。

复现截图：安装 Playwright Chromium 后运行 `node tests/visual-review.cjs final`。若浏览器已安装在其他目录，按本机位置设置 `PLAYWRIGHT_BROWSERS_PATH`；本次使用 `C:/Users/31387/AppData/Local/ms-playwright`。
