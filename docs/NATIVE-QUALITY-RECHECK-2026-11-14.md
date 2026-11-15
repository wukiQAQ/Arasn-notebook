# 原生窗口与质量复核 · 2026-11-14

从属性与画笔预设第三批交接接续，仅验收和诊断；没有修改生产代码、模型或窗口/输入策略，没有打包 EXE，没有操作个人库。旧失败证据保留。

## 本轮结果

| 检查 | 结果 |
| --- | --- |
| `npm run build` | 退出码 0；保留已有 Base UI 指令、打包体积及 inlineDynamicImports 警告 |
| `npm test`（沙箱内） | 58/68 通过、10 失败；日志含临时文件 realpath/rename EPERM，不将该运行作为业务回归结论 |
| `npm test`（沙箱外） | 68/68 通过、退出码 0 |
| `free-native-input-desktop.cjs`（沙箱内） | Electron 无法启动 |
| `free-native-input-desktop.cjs`（沙箱外） | 退出码 1；首个拖动前系统前台保护失败，未执行原生拖动或 Ctrl+Z |
| `window-policy-desktop.cjs`（沙箱外） | 退出码 0；置顶切换、聚焦/被动唤出、设置校验与重启完整通过 |
| `free-quality-desktop.cjs`（沙箱外） | 退出码 0；300/1500 条、完整连续平移、性能短采样、保存失败/重试、崩溃恢复、25%/400%、DPR1/2 完整通过 |

窗口专项本次通过与旧失败记录并存，不据此称旧窗口问题已定位或修复。质量专项本次完整通过，也不据此称旧偶发输入中断根因已解决。

## 前台诊断

在质量专项结束后串行启动独立临时数据窗口，仅读取 Win32 状态并请求自身聚焦，没有输入注入。临时探针源码用后已删除，结果保留于 `foreground-probe.json`。

- `IsWindow` 为 true；本窗口及根句柄相同，句柄所属 PID 与 Electron 主进程 PID 相同，排除了本次读取无效/错误进程句柄的情况。
- `show/focus` 后 Electron `isFocused()` 与页面 `document.hasFocus()` 均为 true。
- 同时 Win32 `GetForegroundWindow()` 及其根句柄始终属于另一个 PID；`SetForegroundWindow` 返回 0，等待后仍不匹配。
- 因此页面/Electron 的聚焦标志不足以替代本轮 Win32 系统前台检查。为什么系统拒绝切换仍未确定；没有使用强制抢焦点、删除保护或向其他窗口注入输入。

本次置顶通过，说明当前可以完成这组 Electron 窗口策略断言；它不能证明系统前台输入前提已满足。

## 性能范围

| 笔迹数 × 每条点数 | 平移样本数 / P95 | 画笔 P95 / 最大值 | 擦除 P95 / 最大值 |
| --- | --- | --- | --- |
| 300 × 64 | 106 / 7.0ms | 7.0 / 7.1ms | 7.0 / 20.8ms |
| 1500 × 64 | 211 / 7.0ms | 7.1 / 20.9ms | 7.0 / 20.9ms |

两场景完整平移屏幕位移均为 (-420, 120)，相机双轴与缩放断言通过，短采样未检测到 >50ms 长任务。DPR1、CDP 输入、渲染器报告可见/聚焦；不是 Win32 前台物理输入到显示延迟。300 条场景另验 DPR2、故障恢复及 180 万世界跨度导出为 4000×4000 PNG。原生 blur 仍未观察到，仅验证合成 blur 取消处理。

## 证据与下一步

所有本轮日志与数据在 `docs/screenshots/native-recheck-2026-11-14/`：`build.log`、`unit.log`、`unit-outside.log`、`native.log`、`native-outside.log`、`native-input.json`、`window-outside.log`、`foreground-probe.{json,log}`、`quality.log`、`quality/performance.json`。旧原生输入与置顶证据另存于 `previous/`，原 `free-quality/` 的这两份 JSON 保持旧内容。

本轮没有新增 UI，也没有重新进行视觉审查；生成的压力截图只作专项证据，未声称已查看。

接着应在能获得系统前台的普通 Windows 桌面重跑受保护原生输入专项，然后执行 `FREE-CANVAS-BATCH4.md` 的物理首笔/连续平移、混合 DPI、触控板/触控笔、Explorer 拖入与数小时长稳清单。当前环境里反复 CDP 重跑不能替代这些检查。关系画布完整专项与真实双机同步本轮未重跑。不重做既定模型，不擅自打包。
