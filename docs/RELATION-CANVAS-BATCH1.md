# Arasn 关系画布：工程第一批

2026-11-12。按用户本次范围执行：导航与可读节点、基础连线、布局/连线保存、速记基础联动；本批结束后停止，不继续开发文件接入与讨论。

## 审查结论与实施依赖

复用已有 React、Graphite Blue、TopologyWorkspace 的坐标/相机/小地图/布局撤销，BoardClient 的版本、操作 ID、自动保存和恢复队列，以及 SQLite 的事务和备份。文件服务已有图片缩略图/预览，但组件尚未共享；本批保持文件业务，下一批接节点引用和预览。

任务依赖与最终实施顺序：

1. 底层原子创建：localOnly text 和 canvas-node 同事务保存，非法布局或 SQL 故障全部回滚；同操作 ID 重试幂等。
2. UI 切换到 canvas-node.layout，正文按 contentRef 指向原始 text/兼容 node；旧 topology 不再由关系画布写入。
3. 速记工作台与速记小窗加入/定位画布；打开原记录，双方编辑同一正文。重复加入复用引用，已移除引用恢复。
4. 基础连线通过 canvas-edge 保存；SVG 曲线锚点随节点布局/移动预览更新。增加可选 relationType，老边缺省“关联”，既有 label/direction 保留。
5. 导航、局部深色点阵与可读卡片优化，完成实际 Electron 和数据回归。

## 数据兼容与启用

- 内容主数据继续保留原 ID；节点只存 contentRef/layout，边只存端点、类型、说明和方向。移动布局不写正文或纸面位置；移除节点只更新 layout.hidden。
- 旧库显示“备份并启用关系画布”。复用已有非破坏性引用迁移：显式确认、完整备份、确定性引用 ID、事务、恢复队列门槛。预览过期刷新并要求重新核对；本批没有自动迁移真实用户库。
- 已有方案规定升级后数据库版本为 2，旧应用不能直接打开；回退使用升级前备份。不是删除或转换原记录，也没有更换共享协议。
- 保留旧 node 作为兼容正文源，速记会识别和编辑；兼容 node 仍不冒充可通过现有局域网文字协议发送的 text。
- 新画布正文使用 localOnly text，白板不显示这些仅用于本机内容组织的记录；速记仍能编辑。旧共享过滤继续隔离画布引用、边和本机记录。
- 本批不补造旧记录时间，不添加模拟文件；新建类型入口只展示便签/问题/灵感/待办，旧文件类标签仍兼容。真实文件节点、附件数和时间字段完善留在下一批。

## 已完成交互与视觉

- 导航使用原创“两张内容卡片 + 连接线”图标，与 Radio 共享、MonitorUp 传送区分。
- 画布局部固定深色点阵，沿用字体、控件和蓝色焦点；卡片直接展示标题、摘要、类型和状态，问题完成态显示“已解决”。
- 双击空白新建；顶部拖动节点；空格拖动平移；Ctrl+滚轮指针锚定缩放；双击节点进入编辑详情；布局撤销/重做、移除和恢复继续可用。
- 从右侧锚点拖到目标节点建立平滑贝塞尔曲线；也可在详情区选择目标后建立连接，提供键盘等价入口。
- 连线支持六种关系类型、说明、选中高亮、Delete/按钮删除；端点移除时暂停显示，恢复后重显，连线对象保留。
- 速记工作台“查看关系 / 添加到画布”，速记小窗“添加到关系画布”，画布“打开原记录”；摘要从当前原文解析。
- 新加入记录使用简单空位避让，避免遮挡已有卡片；不引入自动布局系统。

## 修改文件

| 文件 | 本批改动 |
| --- | --- |
| src/board.ts | 连线类型、迁移就绪状态、原子创建 API、兼容旧记录的恢复/置顶 |
| src/topology.ts | 关系类型与贝塞尔曲线几何 |
| src/xigra/TopologyWorkspace.tsx | 引用布局、正文解析、升级入口、连线交互、键盘入口、移除恢复、速记定位 |
| src/xigra/topology.css | 深色局部 token、连接锚点/曲线、高亮、可读性和窄窗 |
| src/LagoonIcons.tsx、src/main.tsx | 原创图标、跨页导航、内容请求、仅本机正文与白板显示隔离 |
| src/QuickPanel.tsx、src/xigra/records/RecordWorkspace.tsx、src/xigra/records/session.ts | 速记两个入口、旧 node 记录兼容和共享正文编辑 |
| desktop/preload.cjs、desktop/engines/install-services.cjs、panel-engine.cjs、storage-worker.cjs | 原子创建主窗口 IPC、存储事务、迁移状态 |
| desktop/server.cjs | 可选关系类型白名单校验，保留旧边格式 |
| tests/canvas-storage.test.cjs | 原子创建验证与 SQL 故障注入、重试、原文保护和关系重启 |
| tests/topology-desktop.cjs、tests/canvas-migration-desktop.cjs | 适配稳定引用 ID、显式启用、头部拖动与 Ctrl 缩放 |
| tests/relation-canvas-desktop.cjs | 新增完整锚点/速记/引用安全/重启交互流程 |
| 本文、HANDOFF.md、docs/screenshots/relation-canvas-batch1/ | 实施和验证记录、真实截图 |

文件模块 `src/FileStation.tsx` 本批没有改动。

## 验收结果

- `npm run build`：通过（含 TypeScript noEmit）。保留既有 Base UI 指令、包大小和 inlineDynamicImports 构建警告。
- `npm test`：42/42 通过；新增测试证明第二条写入被 SQL trigger 拒绝时正文/节点/数据库状态均回滚，重复命令不产生重复记录。
- `npm run test:ui`：1/1 通过，覆盖旧白板双客户端文字/笔画、离线恢复与冲突保留。
- `node tests/topology-desktop.cjs`：通过，覆盖原便签正文同步、类型/状态、负世界坐标、顶部拖动、撤销重做、Ctrl 指针缩放、小地图、重启/恢复、390px 与减少动效。
- `node tests/relation-canvas-desktop.cjs`：通过，覆盖真实锚点拖出建线、关系类型/说明编辑、删除并重启确认、速记双向正文、加入/重复定位、空格平移、速记小窗入口、布局重启、隐藏/恢复关联边及原文不变。
- `node tests/canvas-migration-desktop.cjs`：通过，覆盖升级预览、受限 IPC、完整备份、原始 ID/正文不变、独立布局、重启和幂等迁移。
- `node tests/core-desktop.cjs`：通过，覆盖文件拖入、剪贴板、清页保留文件、回收/恢复及重启。
- 实际截图两轮检查：第一轮发现缩放控件对比不足、窄窗小地图遮挡、新加入节点重叠；修改后重拍，检查桌面 1440px、390px 暗色和曲线关系画面。使用的是隔离测试库内的真实记录和真实操作，不向产品注入样例数据。

截图：`relations-desktop.png`（含曲线）、`topology-desktop-light.png`（详情）、`topology-narrow-dark.png`（390px），均在 `docs/screenshots/relation-canvas-batch1/`。

## 发现的问题与下一批边界

- 390px 是受限桌面工作区，选中后的节点可能被视口裁切；可用平移/缩放及关闭详情查看。已去掉详情打开时的小地图遮挡。
- 本批连线删除不提供撤销；现有历史继续只管理节点布局。连线自动布局、避障、多选与协作都未实现。
- 文件预览仍仅在现有文件页可用；下一批提取共享 FilePreview、按文件 ID 查询元信息、添加节点与精确 owner 引用、文件更名/回收/丢失同步，验证移除引用不删除文件。
- 节点时间、附件数、讨论正文和引用冲突专用处理界面按后续批次补齐。已有 BoardClient 保留失败操作，不自动复制引用。
- 物理触摸、跨显示器 DPI 和真实双机协作未纳入本批验收，不宣称已验证。
