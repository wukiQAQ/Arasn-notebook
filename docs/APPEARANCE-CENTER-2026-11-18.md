# Arasn 设置中心验收

## 尺寸与布局

设置目前使用工作站内嵌面板。旧桌面断点在 `detail-refinements.css` 中把设置面板高度覆盖为 `auto`，分类内容因而改变面板外框。对比了独立窗口、整页设置路由和稳定的内嵌面板，沿用内嵌面板可以复用现有窗口生命周期和 DPI 边界管理。

面板目标尺寸为 1080 × 740 CSS px，在较小窗口中受客户区约束。桌面分类栏为 200 px，右侧详情列最大 800 px。标题和底部操作栏独立于滚动区，外观重置和备份导出使用同一底部位置。分类记住各自的滚动位置。窄窗保留分类与详情两段导航，并在切换时转移键盘焦点。

## 外观行为

- 三张缩略图切换浅色、深色和跟随系统，支持实时预览及自动保存。
- 四套预设按显示模式提供语义色。强调色预设、HEX、原生色彩选择器和高级颜色共享同一组语义变量。
- 自定义颜色保留输入值。实际文字色和按钮文字色按背景校正，所选前景对比不足时展示提示。关系与状态各自使用原有语义色。
- 字体通过 Chromium 的本地字体验证，缺失时使用系统默认。标准、紧凑、舒适三档即时生效。
- 恢复默认外观只写入显示模式和外观设置。Electron 复用已有 SQLite 设置事务，网页复用本地存储。Windows 原生标题栏的明暗由系统主题接口控制。

## 修改文件

| 区域 | 文件 |
|---|---|
| 设置界面 | `src/SettingsLayout.tsx`、`src/AppearanceSettings.tsx`、`src/appearance-settings.css`、`src/five-fixes.css`、`src/detail-refinements.css`、`src/xigra/triggers.css`、`src/main.tsx` |
| 外观模型与应用 | `src/appearance.ts`、`src/useAppearance.ts`、`src/ui-system.css`、`src/nav-active.css`、`src/board.ts` |
| Electron 保存与校验 | `desktop/main.cjs`、`desktop/preload.cjs`、`desktop/appearance-options.json`、`desktop/engines/appearance.cjs` |
| 验收 | `tests/appearance-center-desktop.cjs`、`tests/helpers/select-option.cjs` |

## 运行验证

- `npm run build` 通过。
- `npm test` 通过 103 项。
- Windows Electron 专项在 DPR 1.0 与强制 DPR 1.5 下通过。普通窗口的实测面板为 1080 × 740，高缩放工况在 1256 × 664 的工作站客户区内收敛为 1080 × 584。
- 四个分类切换前后，原生窗口 ID、边框尺寸、设置面板尺寸和分类栏宽度一致。长快捷键内容可独立滚动，切换回来恢复位置。560 px 窄窗无横向溢出。
- 通过主进程复核保存值，重启后配色与字体保留。自定义主按钮文字和测试前景在各主表面达到 4.5:1。自动重置保留已有触发器、启动配置和工作区视图配置。
- 跟随系统使用真实 Electron 的系统主题源与 Chromium 明暗变化事件验证，明暗变化输入使用测试仿真。手动修改 Windows 系统外观、跨物理显示器移动和系统原生缩放切换未覆盖。

## Electron 实拍

- [浅色外观完整面板](screenshots/appearance-center/standard/appearance-light.png)
- [深海预设](screenshots/appearance-center/standard/appearance-ocean.png)
- [自定义色与低对比提示](screenshots/appearance-center/standard/appearance-advanced-dark.png)
- [150% 工况下独立滚动的快捷键设置](screenshots/appearance-center/scale-150/shortcuts-scroll.png)
- [150% 工况下 560 px 窄窗](screenshots/appearance-center/scale-150/appearance-narrow.png)
- [Windows 原生窗口截图](screenshots/appearance-center/standard/appearance-windows.png)
