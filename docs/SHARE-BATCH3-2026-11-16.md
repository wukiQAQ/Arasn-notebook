# 第三批验收：局域网共享界面精修

2026-11-16。第三批已完成并停止；保留前两批和导航柔光的全部未提交修改。源码及 dist 已更新，未打包 EXE、未提交或推送 GitHub。

## 根因与设计

旧共享弹窗顶部的广播图标单独占位，返回按钮、标题、说明和网卡/操作区域混排；单个 working 状态让启动、停止和刷新都显示“正在处理”，无法看清服务状态。错误信息还与底部通知重复。

选用纵向工具面板：轻量返回导航 → 设备网络图标与标题 → 独立状态 → 网卡和操作 → 地址 → 访问范围。相比居中引导页节省占位，相比并排卡片更适合窄窗口。保持既有 Graphite 主题、字体、semantic tokens 和控件系统。

## 完成内容

- 共享弹窗、设备互传入口及浏览器共享导航统一使用设备网络图标，替换广播图标。
- 状态显示“未开启、启动中、共享中、失败”，另有读取/停止进度。刷新显示独立进度，不把已有共享显示成启动中。
- 开启共享为唯一 primary；停止、刷新、返回、复制地址和重试为次级操作。忙碌时禁用操作，保持键盘焦点框、hover/pressed 和减少动态设置。
- 启动、停止和刷新失败均显示具体原因及相应重试入口。停止失败明确说明服务仍在运行；网卡丢失显示明确故障，不继续给出失效链接。
- 网卡与地址区分组；复制地址保留原有安全 IPC 和统一通知组件。访问范围常驻说明本机文件、附件和关系画布不共享，保留原权限与 HTTP 说明。
- 保留第一批窗口关闭机制，不增加退出动画或中间路由。截图下核对并修正深色返回按钮视觉过重、开启后范围说明不明显、失败状态仍显示普通引导文案三处问题。
- 附带最小修复：本机实际 DPR 1.5 下，指针浮点坐标把 820×330 的框选上报为 820.000061×330.000015，导致旧导出向上取整多1px。CaptureRegion 输入按1/64 CSS像素布局精度归一化，保留渲染倍率和内容坐标系统；完整截图专项已重新通过。

未修改共享权限、访问令牌、网络协议、记录结构、数据库或窗口架构。

## 本批修改文件

| 文件 | 修改 |
| --- | --- |
| `src/main.tsx` | 接入共享展示组件；区分共享操作及失败重试；共享错误仅在状态区显示；替换共享入口图标及补充对话框描述关联 |
| `src/xigra/WhiteboardShare.tsx`（新增） | 共享状态、标题、网卡、操作、地址、错误和访问范围展示 |
| `src/xigra/whiteboard-share.css`（新增） | 沿用主题角色，统一层级、按钮状态、响应式与减少动态 |
| `src/CaptureRegion.tsx` | 分数DPI指针坐标噪声归一化，避免额外1px |
| `tests/share-batch3-desktop.cjs`（新增） | 真实Electron共享状态/失败重试/复制/主题/响应式/窗口返回验收与截图 |
| `tests/interaction-batch4-desktop.cjs` | 旧错误选择器限定到弹窗，避免同时匹配统一Toast |
| `tests/capture-batch2-desktop.cjs` | 增加实际指针/DPI诊断；强制DPI场景核对真实DPR和PNG对应视口，不假定native DIP宽度等于CSS宽度 |
| `docs/superpowers/plans/2026-11-16-share-batch3.md` | 设计取舍、token和实施验收计划 |
| `docs/SHARE-BATCH3-2026-11-16.md`、`HANDOFF.md` | 本报告与交接 |

## 实际验证

- 构建通过，原有依赖指令/chunk/inlineDynamicImports警告保留。
- **103/103单测通过**，无失败或跳过。
- **共享专项4组通过**：真实本机Electron＋隔离数据＋回环网络；亮暗1440/820/390×900，以及390×700短窗口滚动可用；无横向溢出。
- 真正调用共享服务启动/刷新/关闭，验证网卡锁定和空网卡禁用；专项通过测试进程内IPC注入复现启动等待、启动/停止/刷新失败并重试，不修改真实系统网卡或用户数据。
- 地址复制写入Windows剪贴板并读回逐字对照；测试前保存全部剪贴板格式，结束后恢复，未记录原有剪贴板内容。
- 键盘逐项Tab、focus-visible、hover、pressed、忙碌禁用及prefers-reduced-motion通过。已测状态文字最低6.25:1、主按钮文字最低5.44:1；仅为这些指定色对，不是全应用无障碍认证。
- **共享/网络旧回归通过**：指定地址绑定、授权/无效令牌、原记录读写隔离、令牌轮换、网卡丢失、真实停止失败及重试；另含模拟系统适配器的自启核验/持久化回滚，不触碰真实启动注册表。
- **13项窗口生命周期检查通过**：普通/最大化/隐藏恢复、独立速记草稿、无重复记录；亮暗关闭/Esc/返回/原生窗口切换均无中间设置页DOM帧，原画布节点身份、选择与视口保留。
- **原生窗口策略通过**：置顶级别、主动/被动呼出、隐藏、最小化、保存选项和重启。
- **真实Windows键鼠通过**：五类键盘动作、多个绑定、捕获/禁用/迁移/重启、鼠标中键/侧键/双击、20次钩子注册释放。
- **截图回归8组/11份PNG通过**：修复后的框选1/2/4倍尺寸、内容图层、原图缓存淘汰、原生剪贴板像素、Esc/速记清理、缺图重试/超限/留白、缩放平移像素对照、强制125%缩放。

最终专项结果：[results.json](screenshots/share-batch3/final/results.json)。构建、单测及各回归日志：[logs/](screenshots/share-batch3/logs/)。截图专项输出：[capture-regression/](screenshots/share-batch3/capture-regression/)。窗口生命周期原生截图仍输出到既有 `docs/screenshots/window-batch1/`；网络旧回归输出到 `docs/screenshots/interaction-batch4/share-batch3/`。

早期脚本前置选择器、焦点边界Tab等待和hover过渡等待问题均已修正后重跑通过；旧回归的Toast重复匹配只修测试作用域。DPI问题先记录实际pointerdown/up坐标后修正输入，未通过放宽PNG尺寸断言规避。强制DPI时原生内容宽与CSS宽可能差2px，测试仍严格比较PNG与实际CSS视口尺寸。

## 实际截图

以下均为实际运行截图，使用隔离验收记录及回环网卡名称；Win32图仅捕获测试应用HWND，包含Windows标题栏。

- [Windows亮色共享中](screenshots/share-batch3/final/light-active-windows.png)
- [Windows深色共享中](screenshots/share-batch3/final/dark-active-windows.png)
- [亮色未开启](screenshots/share-batch3/final/light-off-1440.png)
- [深色窄窗口](screenshots/share-batch3/final/dark-active-390.png)
- [390×700操作区](screenshots/share-batch3/final/dark-active-390x700.png) / [底部滚动](screenshots/share-batch3/final/dark-active-390x700-bottom.png)
- [亮色启动中](screenshots/share-batch3/final/light-starting.png) / [深色启动中](screenshots/share-batch3/final/dark-starting.png)
- [启动失败重试](screenshots/share-batch3/final/light-start-failed.png) / [停止失败仍运行](screenshots/share-batch3/final/dark-stop-failed.png)
- [键盘焦点](screenshots/share-batch3/final/keyboard-focus.png) / [次级按钮按下](screenshots/share-batch3/final/secondary-pressed.png)

## 未解决或未验证边界

- 第一批仍为用户允许的单原生窗口、两套几何与UI会话隔离替代方案；不是两个独立原生窗口。本批未重新讨论或改动此决定。
- 未进行两台物理设备、防火墙真实放行、物理混合DPI多显示器或长时间连续运行验证。回环绑定和故障注入验证不等于真实办公局域网已连通。
- 未运行屏幕阅读器或全量无障碍审计；本环境未提供web-design-guidelines技能，按现有frontend-design、项目规则及visual-qa完成检查。
- 源码和dist可验收；已有EXE仍需另行打包，GitHub也尚未包含本轮未提交修改。

三个批次至此均已实施并分别验收。下一步为用户试用反馈，或按后续明确要求打包/同步/物理双机验收。本聊天历史已长，建议新聊天先读取HANDOFF.md。
