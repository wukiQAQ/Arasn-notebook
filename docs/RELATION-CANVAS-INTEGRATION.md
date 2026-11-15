# 关系画布与内容工作空间联动审查

日期：2026-11-12。初版范围：现有代码审查、独立导航修正、后续分批设计。用户已确认方案，引用模型与迁移基础批次已实施，当前进度见第 11 节；页面联动尚未实施。

## 1. 结论与本轮范围

关系画布应读取同一批记录和受管文件，只持久化引用、布局和关系。保留单一 BoardClient、SQLite、恢复队列与旧白板共享边界；不做全面重构。

本轮只修改图标和用户可见命名，内部 topology、IPC、数据及存储路径不变。未修改数据库或用户正文，未运行迁移。

## 2. 导航与视觉方向

用户为在便签、白板、文件间整理内容的桌面用户，首要任务是识别入口、定位内容与继续编辑。沿用 Swiss Minimalism + Bento Grid + Subtle Glass 的既有 Graphite Blue 实现。

候选：A 分区画布（PanelsTopLeft）；B 内容叠层（接近现有 Layers3 工作页）；C 便签连线（仍接近网络拓扑）。选择 A，避免复用节点连接图形。

| 功能 | 原状 | 本轮修改 |
| --- | --- | --- |
| 拓扑空间 | Network，与共享重复 | 关系画布，PanelsTopLeft，矩形分区轮廓 |
| 局域网白板共享 | Network | Radio，无线广播轮廓 |
| 局域网传送 | ArrowUpRight；底部入口又用 Network | MonitorUp，设备与向上发送箭头 |
| 互联网浏览 | 没有发现独立导航入口 | 不新增虚构功能；将来如存在浏览入口用 Globe |

通过现有 LagoonIcons 出口复用已安装 lucide-react，不加图标依赖。三种新图标线宽 1.65、桌面导航 21px、行内操作 16px，匹配现有自绘 glyph；窄窗继承既有 18px 规则。标签、标题、无障碍名称一并调整。保留 active 背景、左侧选中线、aria-current 和键盘焦点，不仅靠颜色。

复用 tokens.css 的 Segoe UI / Microsoft YaHei UI、4/8/12/16/24px 间距、14px 控件字、18px 标题、7px 控件与 11px 面板圆角；背景 #f3f4f6、表面 #fff、文字 #242833、边框 #d8dee9、强调 #4358c4。暗色继续使用现有语义变量。此轮无需重新设计页面布局。

## 3. 当前数据结构与真实能力

| 对象/服务 | 已有实现 | 缺口及约束 |
| --- | --- | --- |
| BoardClient | Snapshot(roomId, revision, items[id]); Item(version, value/null)；opId + expected；恢复队列及 rejected 冲突 | value 为整体版本，正文和布局共用版本；不能声称字段级自动合并 |
| 速记/旧白板 | TextValue(type=text, text, x/y, color, 可选 topology)；速记只列出 text | 相同 ID 已同步正文；所有 text 默认进入画布，并非用户明确添加 |
| 新画布节点 | NodeValue(type=node, text, topology)，含 kind/status/hidden | 新正文独立于速记；没有 contentId、fileId、画布 ID 或边模型 |
| 画布移除 | topology.hidden=true，有恢复及布局撤销 | 不是物理删除；原始对象删除后，当前枚举直接不画节点，缺少失效引用占位 |
| 文件库 | files(id,name,category,size,sha256,status,deleted_at)，文件本体在受管对象目录 | ID 已稳定，不能用路径、文件名或 hash 充当引用 ID |
| 文件引用 | file_refs(id,panel_id,file_id)，当前 panel_id=default | 只表示面板引用；unreference 按 file_id 删除该面板全部引用，不能用于精确删除某个画布节点引用 |
| 预览 | FileStation 内部 FileMedia，thumbnail(id) + Base UI Dialog | 当前仅图片缩略预览；非图片是类别图标，没有通用文档/视频预览或原文件打开 IPC |
| 文件状态刷新 | FileStation 局部查询/分页/selection/revision | 本页操作后刷新；缺少供各模块订阅的文件变更流 |
| 持久化 | storage-worker 的 panels.state + elements；事务写入 SQLite；备份、恢复、WAL | 新类型必须通过 server 校验；只给前端增加字段会被校验重建时丢弃 |
| 共享 | legacySnapshot 过滤本机 node 和拓扑墓碑，剥离 text.topology；访客编辑保留本机布局 | 新引用/边不能默认暴露给旧共享，禁止借记录引用读取本机文件 |
| 局域网传送 | LanBridge.send(recordId,fingerprint)，lan-notes.send 明确只接收 text | 现有是文字协议、授权接收、回执与重试；没有文件、选区或完整关系图包 |
| 页面状态 | App 持有记录会话、workbenchPage；白板/记录/画布保持挂载，用 hidden 切换；相机存 settings | 原选区及画布位置有基础；画布返回固定 canvas；FileStation 在 Dialog Portal 中关闭可能卸载、丢查询/选择 |

删除风险：记录删除写 null 墓碑，恢复为新 ID，不能假定旧引用自动复活。文件 trash 与 purge 分开；目前 purge 遍历回收站 ready 文件，没有检查未来画布引用。

## 4. 建议关联模型（实施前锁定）

### 4.1 单一正文与显式引用

- 现有 text ID 为记录内容 ID，现有 files.id 为受管文件 ID，保留原值。引用带 roomId 以隔离恢复/切换工作页；画布、节点、边、附件关系分别有独立稳定 ID。
- ContentRef = { kind: record|file, id }。CanvasNode = { id, canvasId, contentRef, layout, version, removedAt? }。CanvasEdge = { id, canvasId, fromNodeId, toNodeId, label, direction, version, removedAt? }。记录附件关系 = { id, recordId, targetRef, version }，用于便签关联文件及其他记录。
- 画布节点不存正文或文件字节；标题从原始内容实时派生。仅允许失效时展示脱敏的最近标题提示，不能拿缓存正文作为第二份可编辑内容。
- 首批只设一个默认画布，以既有 roomId 派生确定性 ID；“查看所在画布”先返回该画布，模型支持以后多画布，不先做多画布管理。
- 建议通过现有 BoardClient 操作通道增加本机专用 canvas-node/canvas-edge/content-link 值类型；保持旧 text、stroke、node 可读。新增值必须从白板共享过滤，恢复队列/校验/备份同步支持。文件引用索引在相同 SQLite 提交中维护。
- 暂不把所有内容搬到新数据库。新增画布内容创建为原 text 记录，再建立引用；如何在旧白板上显示新增记录必须显式处理，避免自动堆积。推荐可选的仅本机来源标记，旧白板及旧共享按原对象保持原行为，不把所有新记录默认公开。此策略与老版本读取需在模型批次一起验证后才能上线。

### 4.2 更新、冲突与一致性

正文只走 records.write / BoardClient.edit；布局与边有独立 item/version，减少拖动与编辑正文互相冲突。保留 expected + opId：版本冲突保留草稿并提示重载/复制/比较，不自动覆盖远端。输入法组合中禁止跳转，离线待提交使用现有恢复保障。

建立只读选择器 resolveContent / nodesForContent / relatedContent；记录读取 BoardClient.view，文件读取统一 metadata store。文件新增/重命名/回收/恢复/清理后由主进程广播 file-changed(revision, ids)，刷新/失焦恢复时补拉，避免只有当前文件列表刷新。IPC 查询按稳定 ID 批量解析，区分 ready、trash、purged、missing、permission-denied、loading、error，禁止全库分页扫描寻找一个 ID。

正文与布局提交不能假定多次 edit 天然原子；创建记录+节点、文件节点+file_refs、迁移等组合变更需存储层事务和幂等操作，不允许中途形成无主引用。文件引用检查与清理也必须在同一串行事务/维护锁内，防止检查后又新增引用。

### 4.3 删除语义

| 操作 | 实际效果 | 保障与恢复 |
| --- | --- | --- |
| 从画布移除节点引用 | 标记节点 removed；边保留但暂停绘制 | 不调用记录删除/trash/purge；撤销恢复节点后重显边 |
| 删除记录本体 | 原记录墓碑，节点保留 contentRef | 确认提示受影响画布/附件数；显示“记录已删除”；已有新 ID 恢复流程后要求显式重新关联 |
| 移除文件引用 | 按 referenceId/owner 删除精确关系 | 不调用 trash；不移除其他画布或面板引用 |
| 回收/清理应用文件副本 | trash 软删；purge 删除受管副本 | 清理列出所有活跃/可恢复引用，默认阻止；明确二次确认才允许，保留失效元数据及备份恢复/重新关联入口；不删除导入来源 |

回收站对象可恢复原 ID；已清理、源文件丢失显示明确状态和重试/从备份恢复/选择替代内容/移除引用。改关联目标属于版本化操作，不能悄悄按同名文件重新匹配。

## 5. 跨页面交互与状态

统一 navigate({target, contentRef?, canvasId?, nodeId?, returnToken})，仍由 App 管理现有页面及 Dialog。returnToken 保存来源页面、记录 ID/草稿与 caret、列表查询/滚动/选中项、文件过滤/页码/多选/滚动、画布选中节点/相机。文件会话提升至 App 或独立会话 hook，先验证 Portal 卸载行为。返回恢复快照，显式“定位节点”才移动相机；普通返回不 fitCamera。

| 来源 | 新操作与目标 |
| --- | --- |
| 速记 | 添加到关系画布（已添加则定位，禁止无意重复）、查看所在画布、查看关联内容 |
| 文件中转站 | 添加到关系画布、查看文件节点、预览关联文件；保留原选择与过滤 |
| 画布记录节点 | 打开原始记录、编辑同一正文、关联已有记录/文件、查看关联内容、发送、返回来源 |
| 画布文件节点 | 预览图片/导出；通用打开能力完成安全 IPC 后才显示“打开文件”；不显示无效按钮 |
| 画布通用 | 添加已有内容选择器；通过节点锚点或菜单建边，详情中改标签/方向及删除；多选后按能力发送 |

提取 FileMedia 为共享预览组件，沿用 thumbnail(id)、Base UI Dialog 和既有样式；错误有明确提示。记录/文件/画布的 Menu 复用同一 Base UI 菜单外观、禁用原因、焦点返回和快捷键约定；本轮不另加依赖。上下文菜单先完成键盘等价入口，右键只是补充。

## 6. 局域网与共享能力边界

文字节点先 resolve 到原 text ID，确认编辑持久化后复用现有 sendNote/LanNotesDialog，沿用设备授权、逐次接收和落盘回执。旧 node 的内容需先完成无损记录化后才可走该入口，禁止发送时临时复制正文并假装同一对象。

多选文字先逐项复用现有协议，显示逐项成功/失败及重试，不称为原子批次。混合选择明确列出不能发送的文件，不静默跳过。文件节点发送需要独立附件协议：能力协商、大小限制、流式校验、用户同意、受管导入、回执/重试及断点策略；复用安全连接和配对不等于复用现有文字 payload。

完整图另评估 manifest 版本、节点/边 ID 重映射、附件授权、重复内容、缺失引用和部分接收失败的事务策略。实时协作另立项，需权限、事件顺序、冲突和断线恢复；本方案不把旧白板共享或文件发送宣称为画布协作。

## 7. 数据兼容与迁移

1. 先备份完整 SQLite、对象目录、设置与恢复队列；记录版本/计数/hash 清单。拒绝在未提交草稿或恢复队列未处理时迁移，先让用户保存/处理冲突，不丢弃队列。
2. 新程序先同时理解旧值和新值，再启用写入。扩展 server validateValue、legacySnapshot、localTopologyItem、BoardClient.validRecovery、共享读写拒绝规则及备份恢复校验；旧共享不能看见或修改新引用、边及墓碑。
3. 默认画布为 roomId 的稳定映射；旧 text 保持 ID、正文、纸面坐标与版号含义不变。把已有 topology 或默认派生布局转换成引用节点；保留所有 text 原先自动可见的表现，不让“显式添加”规则在升级时藏掉旧内容。hidden 映射为移除状态。
4. 旧 node 原对象作为兼容记录内容源保留 ID 与正文，给统一记录选择器增加兼容读取；新建引用节点指向该内容。新 UI 用新引用布局，旧 node.topology 冻结作迁移前证据，不能出现两套可写布局。首批不把旧 node 变为 text，以免改变共享暴露范围或旧白板显示。
5. 新增 file_refs 所属类型/所属 ID 或独立 ownership 表，旧引用全部保留为 panel/default。按 owner 精确去重，不把旧 unreference 语义直接复用给节点。backup/restore/audit/clearPanel 必须覆盖新关系和索引；备份恢复的 ID 合并冲突不得串联到错误对象。
6. 一个事务写入新对象、关联索引、schema/feature version 和迁移完成标记；分阶段故障注入覆盖“备份后/写入中/提交后回执前”，以确定性 ID 重跑，禁止重复节点或关系。先做 dry-run 报告再迁移真实库。
7. 校验旧记录 ID/正文/坐标、文件对象 hash 与数量、hidden 状态、关联数及恢复队列一致后才启用新 UI。只读回退原备份是回滚路径；旧程序不会理解新类型，不承诺直接降级可写，避免新数据被旧程序覆盖。

## 8. 修改文件清单

| 批次 | 现有文件及建议新增文件 |
| --- | --- |
| 0，本轮 | src/LagoonIcons.tsx、src/main.tsx、src/xigra/TopologyWorkspace.tsx、tests/topology-desktop.cjs；本文、HANDOFF.md、截图 |
| 1，模型 | src/board.ts、src/topology.ts、desktop/server.cjs、desktop/engines/{storage-worker,recovery-service}.cjs；新增 src/content-links.ts、desktop/engines/canvas-migration.cjs 及模型/迁移测试 |
| 2，记录 | src/main.tsx、src/xigra/records/{session,RecordWorkspace,RecordList}.tsx/ts、src/xigra/TopologyWorkspace.tsx；新增内容选择器、内容菜单与导航会话 hook |
| 3，文件 | src/FileStation.tsx、src/board.ts、desktop/{preload,main}.cjs、desktop/engines/{install-services,storage-worker,thumbnail-service}.cjs；新增共享 FilePreview 与文件 metadata store |
| 4，关系 | src/topology.ts、src/xigra/{TopologyWorkspace.tsx,topology.css}、content-links 选择器、server 校验与边持久化/撤销测试 |
| 5，发送 | src/main.tsx、src/xigra/LanNotesDialog.tsx、desktop/engines/{lan-notes,lan-network}.cjs；附件协议评估文档与双端测试 |

新增文件名为提案；采用现有组件约定即可，不要求为命名做重构。

## 9. 分批实施与验收门槛

每批均要求构建、相关单测、真实 Electron 流程、桌面约 1440px 与 390px 截图检查。数据批次以前一批兼容门槛通过为前提，不一次铺开。

| 批次 | 实施范围 | 必须通过的验收 |
| --- | --- | --- |
| 0 | 图标及命名 | 三入口轮廓不同、线宽一致、标签/aria 正确、亮暗/窄窗可读、键盘与原导航不回归；无数据修改 |
| 1 | 引用、版本、迁移基础 | 旧 text/node/文件备份无损；迁移重复运行/中断恢复；无重复正文；恢复队列不丢；旧访客不能读取/写新类型；清页/备份恢复一致 |
| 2 | 速记双向联动 | 速记添加→定位→画布编辑→原页立即更新；反向打开准确；并发冲突保留草稿；输入法、离线恢复、来源返回与 caret/滚动/相机不丢；删除节点不删正文 |
| 3 | 文件双向联动 | 已有文件 ID 加节点不复制；共享图片预览/错误状态；重命名各处同步；节点移除不删文件/其他引用；回收/清理确认列引用；缺失/回收/已清理可恢复或重新关联；文件选择/查询保留 |
| 4 | 记录附件、关系边 | 建边/改名/改方向/删除、撤销重做及重启一致；断开的端点明确显示；移除节点暂停边，恢复重显；稳定节点 ID，跨画布非法边被拒绝 |
| 5a | 文字与多选发送 | 发送使用原记录 ID 和已保存版本；未保存/冲突阻止发送；配对/拒收/幂等回执、逐项重试；不支持类型说明清晰 |
| 5b | 文件发送（协议评估通过后） | 两端能力协商、附件校验、安全导入、拒收/中断/重试/大小限制；两台物理设备实测；图包与实时协作不混入本批 |

用户十项验收映射：1→0；2/3→2；4/5→3；6→2/3；7→1/4；8→2/3；9→2/3/4；10→所有批次的白板双客户端、速记编辑与文件核心回归。

## 10. 本轮验证记录

- 构建通过；仍有现有打包警告（Base UI use client、包体积与 inlineDynamicImports），未扩展为构建配置重构。
- 29/29 Node 测试在获准执行环境通过。沙箱内 27/29：两个文件测试失败；最小导入探针确认是 realpath EPERM，移出限制后全部通过。
- 首轮真实 Electron 1280×780 亮色和 390px 暗色截图已检查：画布/广播/设备轮廓可区分，沿用原选中条；窄窗继承原策略隐藏画布侧栏入口，通过工作页按钮进入。详情区可滚动，无横向溢出。节点被视口裁切属于既有平移行为。
- 更新回归增加三种导航图标、线宽及 aria-current 检查；第二轮桌面使用 1440×900。最终结果见 HANDOFF.md 本轮条目。
- 最终 1440×900 尺寸由 innerWidth 断言确认，已实际检查导航总览与节点详情截图；390px 暗色再次检查通过。文件核心 Electron 回归通过，旧白板双客户端共享、离线重载与冲突保留回归 1/1 通过。
- 数据联动批次尚未执行，不能把上表未来验收项记为通过。

## 11. 批次 1 实施结果（用户确认方案后）

- 已新增 canvas-node、canvas-edge、content-link 类型、引用解析选择器和仅本机 text.localOnly 标记；对象仍走既有 BoardClient 与版本冲突队列。引用项不存正文或文件字节，布局与正文独立版本。
- 已扩展 server 校验、跨工作页/跨画布限制、本机共享过滤及墓碑隔离。旧 HTTP 客户端对本机记录与引用的读取、创建、删除均已验证隔离。仅本机共享范围不能被编辑操作悄悄改成公开。
- 已实现显式迁移预览与受限主窗口 IPC：默认 dryRun，拒绝未处理草稿、畸形恢复副本、跨工作页恢复副本和过期预览；备份完整 SQLite 与受管文件后事务写入。确定性节点 ID 保证幂等；旧对象与用户操作回执保持不变。容量和 ID 冲突在写入前检查。
- 数据库初次新类型迁移提交时升为版本 2，旧版程序会拒绝打开；支持恢复版本 1/2 备份，已升级库恢复旧内容后不降版本。此版本保护不等于支持直接降级。
- canvas_file_refs 按 owner_id 维护精确文件引用，随 BoardClient 操作同事务更新；旧 file_refs 保留。清页清除引用而保留文件，备份恢复根据对象重建索引。隐藏节点的引用仍受保护；文件仍有面板或画布引用时阻止 purge，不提供未经确认的强制删除。
- 通用冲突“恢复为新内容”不会复制引用对象，引用冲突原样保留；专用冲突处理与重关联界面留在页面联动批次。
- 已通过构建、41/41 单测；真实 Electron 的迁移预览/备份/独立布局/重启/幂等；原画布和文件核心 Electron 回归；旧白板双客户端回归 1/1。事务失败测试由 SQLite trigger 注入，证明无部分节点、标记或版本升级；另验证迁移前备份可还原原数据。
- 本批未修改正常页面的读取方式，也未自动迁移用户库。新迁移仅在隔离数据中实际执行验收。下一批必须一次切换 TopologyWorkspace 到引用布局，再启用正常用户迁移入口，避免旧 topology 和新 layout 双写。
- 新增/修改文件见实施清单 `docs/superpowers/plans/2026-11-12-canvas-references.md`，新增验收入口 `node tests/canvas-migration-desktop.cjs`。
