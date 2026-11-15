# 主题第二批 · 2026-11-15

接续文件工作区第一批中已排定的“设置→外观→主题、统一亮暗Design Tokens和跨页状态”。用户本轮要求继续下一步，实施此项；第三批配色重设计不在本轮范围。

## 设计与实现

面向在速记与多个工作区间切换的用户，优先让主题易找到并保持偏好一致。比较独立设置页、新增设置标签、现有弹窗内分组，选用最后一种，保留原操作路径。外观分组放在快捷触发前，其后为应用偏好。保留原AppSelect、“外观主题”可访问名称与浅色/深色/跟随系统三模式，文字说明覆盖范围与系统跟随行为。

沿用Graphite字体、颜色和控件；分组16px、正文14px、辅助12px，8/12/16/24间距及既有圆角，无新动画/依赖。导航与关系画布的 `--ui-*` 语义变量从visual-order.css移到tokens.css，数值未变；原 `--xigra-*` 和短别名仍按既有角色使用。本轮集中维护亮暗变量，不声称第三批全工作区配色统一已完成。

启动改为在React加载前执行 `/assets/theme-init.js`。遵守现有静态资源白名单及CSP，不增加根路径脚本访问或内联脚本权限。桌面preload通过只读同步IPC从主进程内存获取当前模式，只返回受校验主窗口同源主frame的主题值；不做同步磁盘访问。桌面设置优先于浏览器缓存，重新加载也读取当前偏好。浏览器缓存不可用或值无效时仍可解析系统主题。

原主题effect改为layout effect，主题切换同步更新color-scheme并释放启动背景样式；缓存读写容错；设置失败回读时同时同步主题。原settings存储/API及数据库不变。原生窗口启动背景使用当前nativeTheme，并监听其updated事件更新背景，关闭窗口时移除监听。

## 验证

| 检查 | 本轮结果 |
| --- | --- |
| 启动单测 | 先观察到缺少初始化脚本失败，实现后通过；覆盖桌面优先、缓存、无效值、系统解析与缓存访问异常 |
| `npm run build` | 退出0，dist更新，原chunk体积/use client/弃用配置警告仍在 |
| 沙箱外 `npm test` | 88/88，失败/取消/跳过均0；新增测试接入默认命令 |
| 主题Electron专项 | `pass2c.log`退出0；暂停React脚本、旧浅色缓存下的深色启动、原生初始背景、三模式、媒体事件切换、保存失败与恢复、四页亮暗、紧凑模式、整份board保护与重启正文恢复；无pageerror |
| 响应式 | 实际1440×900、820×650、390×700及紧凑500×540，最终几何无页面横向溢出，设置弹窗在视口内 |
| 状态提示完整回归 | `status-regression.log`退出0；长错误、窄屏、导航/属性、自动消失等通过 |
| 速记完整回归 | `recorder-regression.log`退出0；标题/正文、选区、搜索、文件、关系画布、重启和五宽度通过 |
| 语法及空白检查 | main/preload及新专项语法、git diff --check通过；既存LF/CRLF提示保留 |

主证据目录：`docs/screenshots/theme-batch2/`，最终主题截图与geometry为`pass2c/verification.json`。速记回归图位于`docs/screenshots/quick-recorder/theme-batch2/`。均为隔离临时数据，退出后核实路径并清理，不使用个人数据。

第一轮实际查看pass1d的appearance-dark-1440、appearance-light-820、appearance-light-390；第二轮实际查看pass2c的appearance-dark-390、appearance-light-390、relation-dark-1440、compact-dark-500。外观入口可达、说明可读、窄屏控件换行且弹窗滚动，未发现需追加视觉调整的问题。

中间失败保留：Electron颜色值大小写、重载时上下文销毁、选择器隔离Escape导致弹窗未关闭均修正了验收方式；首屏专项发现根路径脚本被静态白名单拒绝，生产脚本改到assets后通过。pass2b在视口尺寸刚变化时测到溢出，增加两帧渲染等待与越界元素诊断后pass2c无溢出；未据此修改生产布局或宣称修复持续溢出问题。

## 文件与边界

生产文件：index.html、public/assets/theme-init.js、desktop/{main,preload}.cjs、src/{main.tsx,board.ts,visual-order.css}、src/xigra/{tokens,triggers}.css。验收：tests/theme-init.test.cjs、tests/theme-batch2-desktop.cjs、package.json。计划：docs/superpowers/plans/2026-11-15-theme-batch2.md。

源码/dist已更新，EXE未打包。系统跟随通过Electron真实页面的媒体事件模拟验证，不等于操作Windows系统设置实测；首屏验收证明React加载前主题及初始背景正确，不等于物理屏幕全启动链无闪烁测量。未做全量WCAG/屏幕阅读器、物理输入、混合DPI、真实登录/双机、防火墙、安装升级及长稳；旧偶发问题根因结论不变。未重复所有历史UI专项，也未审查全部历史未提交改动。

本批完成。下一步由用户体验反馈驱动，若继续原分批任务则进入第三批色彩理论/全工作区配色与语义状态统一；不自动打包。
