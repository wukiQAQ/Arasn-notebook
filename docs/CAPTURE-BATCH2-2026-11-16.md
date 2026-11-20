# 第二批完成：画布截图 / 导出

仅实施窗口专项第二批。保留现有主题、窗口机制、记录结构与网络权限；第三批共享界面精修未开始。

## 结果与实现

- 自由画布与关系画布均使用单一“截图 / 导出”入口，命令菜单同步更新；移除顶部重复入口。
- 三种范围：框选截图、当前视口、完整画布。框选使用画布上的轻遮罩，支持任意方向拖动、松开预览、重新框选和 Esc 退出；键盘可选择整个视口。
- 预览、复制图片和保存 PNG 使用同一渲染结果。提供 1×/2×/4× 输出，完整画布提供 0/24/48/96px 留白。输出实际像素尺寸，低像素原图如实提示，不宣称放大能增加素材细节。
- 框选期间暂时隔离应用根节点，拦截滚轮和快捷键，隐藏画布工具、网格、卡片操作及选中标记；退出、取消、窗口模式切换均解除隔离并恢复交互，不修改记录/视口数据。
- 沿用“画布轻遮罩＋预览窗口”方向。亮暗主题使用既有表面、边框和操作色；窄屏预览图片完整缩放，内容区可滚动，操作区固定，通知避开弹窗操作区。

## 渲染正确性

不是将低分辨率屏幕截图放大。渲染器冻结内容快照，读取 DOM 的文字/主题样式及便签滚动位置，复用 SVG 笔迹和关系曲线几何，在目标分辨率 Canvas 上合成 PNG。

保持关系/笔迹、文件卡片、便签的内容叠层；读取原图而非缩略图；恢复关系节点标题、真实摘要、类型/任务状态及语义连线/标签。完整画布包含视口外的显示对象，边界包含笔迹宽度、曲线和标签。隐藏节点不导出。

修复原实现中正文颜色可能沿用前一绘图对象的问题；不再展开长便签导致输出覆盖邻近对象，而是保留卡片尺寸、当前滚动位置及可见正文。未改变或截断原记录全文。

尺寸按逻辑像素计算，不叠乘 Windows DPR，并修正非整数缩放的浮点误差导致多出一像素的问题。编码前限制单边 16384px、总计 3200万像素。原图显式解码缓存最多两张，导出结束或失败清理，避免批量图片无界常驻。

原生复制通过受信 IPC 接收 PNG 字节，验证格式、64MiB 字节上限、像素上限及实际解码尺寸；使用本项目 Electron 45 的异步 ClipboardItem API。保存沿用原 PNG 下载机制；关闭预览不会提前撤销正在下载的 URL。

## 本批修改清单

| 文件 | 用途 |
| --- | --- |
| `src/ExportDialog.tsx` | 统一范围、倍率、留白、预览、重选、复制、保存与重试 |
| `src/CaptureRegion.tsx` | 框选、键盘退出、手势隔离、尺寸变化及清理 |
| `src/capture-export.css` | 遮罩、预览、固定操作区及亮暗/窄屏样式 |
| `src/render-export.ts` | 两类画布共用内容合成、原图缓存、叠层与错误处理 |
| `src/canvas-export.ts` | 共享坐标换算、像素取整与尺寸上限 |
| `src/main.tsx` | 自由画布单入口、渲染快照与快捷键隔离 |
| `src/xigra/TopologyWorkspace.tsx` | 关系画布单入口、节点/连接快照及关闭联动 |
| `src/free-canvas.css` | 修复图片预览按钮被通用26px按钮样式压小 |
| `src/CommandMenu.tsx` | 更新命令名称对应图标 |
| `desktop/engines/copy-image.cjs` | PNG校验及异步原生复制 |
| `desktop/engines/install-services.cjs`、`desktop/preload.cjs`、`src/board.ts` | 窄IPC与类型，未改业务数据模型 |
| `package.json` | 纳入截图导出单测 |

新增测试：`tests/capture-export.test.cjs`、`tests/capture-batch2-desktop.cjs`。

更新测试：`tests/free-content-desktop.cjs`、`tests/free-canvas-desktop.cjs`、`tests/free-quality-desktop.cjs`、`tests/correctness-batch1-desktop.cjs`、`tests/board.spec.ts`。旧入口/自动关闭/展开全文断言按新交互更新；等待真正完成的窗口切换；压力手势选择真正空白区域并隔离无关物理输入；浏览器编辑先退出画笔模式，确认恢复副本已落盘再重载。未削弱手势完整性、图像像素、原记录、文件保护与历史断言。

计划：`docs/superpowers/plans/2026-11-16-capture-batch2.md`；交接：`HANDOFF.md`。此前未提交的微交互、窗口第一批、导航修改均保留。

## 实际验证

- 构建通过；既有 chunk、依赖指令和打包选项警告保留。
- **103/103 单测通过**：包含负坐标/缩放、倍率、浮点像素边界、留白/超限，以及原生PNG格式和像素校验。
- **截图专项8组通过、11份实际导出PNG**：框选、重选/Esc、1/2/4倍、原生剪贴板像素等同保存文件；有真实撤销历史时绘图/滚轮/撤销被隔离；退出后原记录与历史可用状态保留；呼出速记解除截图隔离。
- 完整画布包含远处便签，留白尺寸正确，超限没有生成可误保存的残缺图；降低倍率后可恢复。缺失原图明确失败，恢复原图后重试成功。
- PNG像素检查包含独立正文笔迹、红色SVG图形、绿/黄原图及另外两张蓝/紫原图；第三张原图触发缓存淘汰后仍全部存在。
- 缩放和平移后，区域PNG与对应视口裁剪像素一致。关系节点、语义曲线/标签也通过整图与框选导出，图数据不变。
- 亮暗主题、1440/820/390布局及125% Electron设备缩放检查通过；旧正确性回归另覆盖渲染DPR 1/1.5/2。实际PNG尺寸不重复乘DPI，保存后立即关闭预览仍能完成下载。
- 旧附件/自由画布/导出及节点整理/历史/锁定/重启回归通过；300/1500笔迹、180万世界坐标跨度超限提示及视口回退、恢复失败/重试、25%/400%与DPR1/2压力回归通过。
- 窗口策略、真实Windows五类键盘动作/鼠标钩子20次注册释放回归通过。浏览器双端文字/绘图、离线恢复、冲突及PNG下载回归通过；因Playwright自带Chromium未安装，使用已安装Edge无头模式和临时配置，临时文件已删除。

日志：`docs/screenshots/capture-batch2/logs/`；专项结果及输出尺寸：`docs/screenshots/capture-batch2/final/results.json`。压力记录属于短程CDP渲染检查，原生失焦前置条件不可用时按脚本使用合成blur，不作物理输入延迟基准。

## 实机截图与PNG

使用隔离临时数据、验收用便签及合成原图。截图来自实际运行的Windows Electron；原生图通过Win32 PrintWindow仅捕获测试HWND，包含标题栏。已查看多轮遮罩、预览、实际PNG与窄屏效果，修复工具遮挡、图片预览被压小、窄屏图片裁切/操作区折叠和样式优先级问题。

- [Windows框选](screenshots/capture-batch2/final/light-region-windows.png)
- [Windows亮色预览](screenshots/capture-batch2/final/light-preview-windows.png)
- [Windows深色预览](screenshots/capture-batch2/final/dark-preview-windows.png)
- [390px预览](screenshots/capture-batch2/final/dark-preview-390.png)
- [1× PNG](screenshots/capture-batch2/final/region-1x.png) / [2× PNG](screenshots/capture-batch2/final/region-2x.png) / [4× PNG](screenshots/capture-batch2/final/region-4x.png)：820×330 / 1640×660 / 3280×1320。
- [完整画布PNG](screenshots/capture-batch2/final/all-1x.png) / [关系画布PNG](screenshots/capture-batch2/final/relations-all.png)

## 限制与后续

完整画布保留当前卡片排版和可见正文，不自动展开隐藏全文；全文仍在原记录与完整备份中。超限需降低倍率或缩小范围，不自动缩成模糊图。原图读取沿用既有托管PNG/JPEG及安全上限，未新增其它素材解码；无法读取时明确失败，不静默省略。

设备缩放/渲染DPR已实跑，物理混合DPI多屏和长时间连续导出未实测。非安全HTTP共享页若不支持Clipboard API会提示保存PNG，桌面使用原生复制。

源码/dist已更新；未打包EXE、未提交或推送GitHub。第二批验收结束后停止。第三批共享图标/状态/信息层级及相关UI精修，等待用户明确继续。
