# 交接单现状核验 · 2026-11-15

按 HANDOFF.md 最新“第4批后完整回归补验”核验。沿用 Graphite、现有数据模型和接口约定；未修改生产源码或验收脚本。本轮重新构建 dist，未打包或安装 EXE。工作区已有大量未提交改动，本次不代表审查全部历史差异。

## 本轮实际结果

| 检查 | 结果与证据 |
| --- | --- |
| `npm run build` | 退出0；TypeScript、Vite、LAN bundle 构建通过 |
| 沙箱内 `npm test` | 75/87，12项失败；日志包含临时目录 realpath 的 EPERM，不记作通过 |
| 沙箱外 `npm test` | 87/87，失败/跳过均0，退出0 |
| `node tests/relation-motion-desktop.cjs` | 沙箱外完整通过，退出0；语义色、对比度、方向、菜单键盘、减少动态、820/390、压力采样 |
| `node tests/relation-canvas-desktop.cjs` | 沙箱外完整通过，退出0；拖连、关系编辑删除、同源正文、引用去重、浮动属性、原记录保护及重启 |
| `node tests/workspace-interactions-desktop.cjs` | 沙箱外P0及P2/P3完整通过，退出0；文件清理保护/撤销重启、手势、历史、搜索、整理确认及偏好恢复 |
| `node --check` | 上述三个脚本及 `tests/helpers/pan-gesture.cjs` 均退出0 |
| `git diff --check` | 退出0；另有 index.html 的 LF/CRLF 提示 |

日志与新截图统一位于 `docs/screenshots/handoff-verification-2026-11-15/`。构建日志为 `build.log`；两次单测分别为 `unit.log`、`unit-unsandboxed.log`；三个专项各有同名 `.log` 与截图子目录。旧 `post-batch4-regression` 证据没有覆盖。

构建保留三类警告：JS chunk 超过500kB、依赖模块的 `use client` 指令、`inlineDynamicImports` 弃用。它们未导致本轮构建失败，本轮未作依赖或构建配置整改。

## 交接结论核对

- 工作区脚本确实同时检查渲染相机与落盘相机，并验证主键手势的身份、按键、起终点及松手前中断；两次平移前后完整 board 不变。
- 新 `workspace-interactions/pan-gestures.json`：屏幕(60,35)/(30,20)，相机(-60,-35)/(-30,-20)，zoom均1。`lostpointercapture` 在 `pointerup` 后，未被误当作提前中断。Space/中键仍沿用既有断言，不宣称新增完整事件校验。
- 整理流程确实先验证弹窗及完整board不变，确认后等待实际节点布局变化；本轮完整走通。
- 本轮再次通过支持最新交接的自动化结论；不能由此认定旧生产输入/前台偶发问题已定位或修复。

## 实际截图检查

本轮分两次查看新截图：关系浅色1440、深色390；浮动属性1440、清理确认390；随后查看最终工作区390及整理确认1440。检查了层级、文本可读性、工具栏换行、弹窗和画布边界，未重设计界面。

保留视觉观察：`relation-canvas/floating-inspector.png` 中启用提示与属性面板底部移除按钮区域局部重叠；`workspace-interactions/clear-confirm-390.png` 和 `canvas-practical-390.png` 中短时提示与底栏区域重叠。本轮未专项验证持续时间、点击命中或复现条件，未修改提示布局，不把它记为已修复。窄屏画布的节点裁切属于可平移视口，不等于页面溢出；文件引用夹具显示“原内容不可用”属于该测试数据状态。

## 下一步与边界

本轮核验及交接更新完成。若继续体验完善，可先专项复现上述提示遮挡并验证点击/键盘；真实登录自启、安装/便携成品、系统前台和物理输入、真实双机/防火墙、混合DPI及长稳仍需独立环境。本轮未重跑第4批网络/自启等其余专项，不把历史结果写成本轮通过；不默认打包。
