# Arasn 多画布交付记录 · 2026-11-20

## 画布库与工作流

侧栏的工作页和关系画布进入各自的画布库。默认网格以实际画布内容为预览，列表用于密集浏览。卡片提供搜索、排序、操作菜单和回收站。工作站顶部显示当前名称，菜单可切换近期画布或返回库。Ctrl+Shift+J 打开最近使用的画布。

视觉以现有应用的浅色／石墨深色表面、强调色和控件为基础。实际预览是卡片的主要视觉内容。390 px 下画布库自动采用紧凑导航。视觉复核后压缩了重复标题、将画布名称移到所属页面标题旁，并修正了弹窗控件的主题样式。

## 分批改动与验证

| 批次 | 文件 | 已验证结果 |
| --- | --- | --- |
| 存储与迁移 | `desktop/engines/canvas-catalog.cjs`、`storage-worker.cjs`、`panel-engine.cjs`、`desktop/server.cjs`、`src/board.ts` | 历史便签、节点、连线、笔迹与视口保留。备份存在。数据库注入失败后回滚，重试只创建一组默认画布。 |
| 画布库与编辑 | `src/CanvasLibrary.tsx`、`canvas-library-model.ts`、`canvas-library.css`、`main.tsx`、`WindowNavigationBar.tsx`、`CanvasNoteContent.tsx`、`useFreeViewport.ts`、`useDrawingTools.ts`、`xigra/TopologyWorkspace.tsx`、`xigra/records/RecordWorkspace.tsx` | Electron 从两个库创建和打开画布，搜索、网格／列表、顶部菜单切换、重开 96% 视口、浅深主题以及 390 px 无横向溢出。通过真实工作站验证新关系节点、77 张关系画布搜索及回收站恢复。存储测试验证复制布局、回收站恢复和清理保留全局资源。 |
| 画布包 | `desktop/engines/install-services.cjs`、`storage-worker.cjs`、`src/CanvasLibrary.tsx` | 版本化单画布包回读成功，校验不符时原子拒绝。Electron UI 以隔离测试路径验证导出及重新导入。附件以内容哈希复用，缺失资源以占位和计数提示。 |
| 局域网 | `desktop/main.cjs`、`preload.cjs`、`server.cjs`、`desktop/engines/canvas-share.cjs`、`canvas-share/`、`storage-worker.cjs` | 缺少令牌拒绝，只读拒绝写入，其他画布对象不可访问，过期版本拒绝覆盖，显式授权附件可下载，停止后链接立即失效。真实 Electron 还验证了面板开启、默认正文占位及停止。 |
| 回归 | `package.json`、`tests/canvas-catalog.test.cjs`、`canvas-library-desktop.cjs`、`canvas-catalog-package.cjs`、`desktop-smoke.cjs`、`board.spec.ts` | `npm test` 97 项通过。真实 Electron 专项与桌面冒烟通过。浏览器双客户端回归 1 项通过。Windows 生成 Portable 和 Setup。 |

## 数据结构与安全行为

- 多画布目录版本为 1，沿用工作站 SQLite 文件，数据库版本为 3。画布 ID 与名称无关。布局实例保存画布 ID，便签和托管文件保持原 ID。关系复制和导入为对象分配新 ID，并同步重映射连线两端。
- 迁移先等待待保存内容和恢复副本落盘，再写入可恢复的 SQLite 与附件备份。目录、默认画布、历史布局以及迁移标记在同一事务中提交。旧便签正文和旧备份可独立恢复。
- 保存继续使用 BoardClient 的顺序队列、操作回执和对象版本检查。位置写入绑定画布 ID。切换等待内容和待写入视口，进入不同画布时重置编辑撤销栈。用户自定义画笔预设属于应用偏好。
- 缩略图复用现有 Canvas 导出，以实际内容范围渲染。可视卡片异步生成，会话内按对象及便签版本缓存，生成失败回退为统一空预览。
- 画布包可选包含引用便签正文和引用附件。包内嵌附件合计上限 24 MiB。按实际保存位置导出，导入限制包体、条目数量及可接受的对象结构。失效引用保留占位。
- 新的单画布局域网入口复用现有 HTTP 共享服务器，默认仅查看。正文与附件分别由发布者授权。允许编辑时，访客可调整当前画布中的卡片和可移动节点位置。编辑使用对象版本避免覆盖。访问者每 2.5 秒重连或刷新，停止分享会关闭连接。当前每次运行可开启一条此类画布分享链接，适用于信任的私有网络。已有设备互传入口继续使用原协议。

## 真实 Electron 截图

- [自由工作页库](screenshots/multi-canvas/workspace-library.png)
- [关系画布库](screenshots/multi-canvas/relation-library.png)
- [新建画布弹窗](screenshots/multi-canvas/create.png)
- [顶部快速切换](screenshots/multi-canvas/switcher.png)
- [分享面板](screenshots/multi-canvas/share.png)
- [390 px 紧凑导航](screenshots/multi-canvas/narrow.png)

## Windows 打包复验

- `npm run pack:exe` 生成并发布 `Arasn-0.6.0-Portable.exe` 和 `Arasn-0.6.0-Setup.exe`。
- 启动单文件 Portable 及从 Setup 提取的 Electron 应用。两个隔离数据目录均成功读取旧便签并迁移关系节点。安装向导、系统注册及跨实体设备访问尚未执行。
- `npm run test:desktop` 验证全局快捷键、隐藏至托盘、局域网位置写入、停止共享和重启后从新画布库读取。
- 使用系统 Chrome 跑双客户端浏览器回归，覆盖便签同步、鼠标绘画、离线恢复、版本冲突、视口平移和 PNG 导出。测试改用现有的便签详情弹窗。
