# 全局交互审查（2026-11-15）

更新：第4批 #12/#13/#14 已实施，自动验证与实机边界见 `INTERACTION-BATCH4-2026-11-15.md`；第3批见 `INTERACTION-BATCH3-2026-11-15.md`。以下表格保留首次审查及分批方案，不代表最新实现状态。

第2批 #1/#3/#5/#6 已实施，根因、实测及边界以 `INTERACTION-BATCH2-2026-11-15.md` 为准。下表保留首次审查时的定位和建议。

第4批后已补跑relation-motion、relation-canvas、workspace-interactions完整回归；修正旧验收流程与相机采样后全部通过，见 `POST-BATCH4-REGRESSION-2026-11-15.md`。这项补验不等于真实双机或Windows登录验收。

依据用户专项文本、当前源码及本批真实 Electron 隔离复现。附件中没有可读取的原始14张截图，以下“表现”来自需求描述；只有 #4/#8 提供了本轮修复前后运行证据。不能把其余条目的源码审查视为实机验收。

| 编号及表现 | 代码位置与根因/待验证原因 | 修复方案与数据/API影响 | 验收及回退 |
| --- | --- | --- | --- |
| 1 关系浮层过大 | `src/xigra/TopologyWorkspace.tsx`、`FloatingInspector.tsx`：现有详情走 FloatingInspector，hover 状态另用于关系聚焦；原始截图中的大窗触发路径未复现 | 第2批新增约200px紧凑悬停/焦点提示；点击才编辑，边缘避让；不改数据 | hover/leave/键盘/边缘/节点遮挡实际测试；回退提示组件 |
| 2 亮暗语义色 | `src/relation-appearance.ts` 已有两套蓝紫橙绿青与来源紫；TopologyWorkspace读取共享tokens | 第3批先验收现有能力，补遗漏；本批关系PNG复用浅色语义配置；不改关系数据 | 亮暗、缩放、文字标签/箭头对照；回退外观绑定 |
| 3 输出端拖连接 | TopologyWorkspace 的 relation-anchor-out 已有 pointerdown / connecting 分支 | 第2批复验拖动命中、预览、方向与取消，按实际缺口修；不预设需要新结构 | 双端拖动/非法目标/重复边/失焦/保存；回退手势代码 |
| 4 整理不读边 | TopologyWorkspace.arrange 原来 sqrt网格，直接 layouts，无确认，忽略尺寸和边 | **本批已改**：`src/graph-layout.ts` SCC循环收敛、方向分层、重心排序、尺寸避碰、固定障碍；确认后一次history。新增可选layout.locked及校验；没有已有分组模型，不新增分组概念；多选仅移动所选，读取全图上下文 | 分支/循环/异尺寸/锁定/取消/撤销重做/重启；回退算法和入口，旧版忽略/写回丢弃locked；正文引用与边不迁移 |
| 5 选择平移分离 | `src/main.tsx` down：select 空白只清空选择，hand/中键才平移；`FreeToolbar.tsx` 独立工具 | 第2批调整默认手势，明确框选修饰键，保护编辑/附件；不改坐标结构 | 空白/对象/控制点/输入法/画笔擦除回归；回退手势及toolbar |
| 6 只有整条擦除 | `src/useDrawingTools.ts` 用strokeHit记录整条stroke，手势结束一次commit；`board.ts`是点列 | 第2批保留整条+实现几何分割片段模式；需定义新ID、样式继承与一组历史，不假称已有局部擦除 | 连续扫动、缩放、分段、撤销、非笔迹保护；回退新模式入口，保留已生成合法点列 |
| 7 图片预览模糊 | `FileStation.tsx` FileMedia：弹窗和列表共用thumbnail；thumbnail-service为160×120，标注为缩略预览 | 第3批读取原图并加入contain/100%/缩放/尺寸；本批新增原图IPC仅供导出，不表示预览已修；保留现有托管边界 | 原始尺寸、细节、高DPI、读取失败；回退预览组件，IPC可保留 |
| 8 PNG缺正文/低清 | `src/main.tsx`旧exportImage独立Canvas循环，高度截断且尾行易丢；factor≤1且会静默降采样，图片调用thumbnail | **本批已改**：`canvas-export.ts` / `render-export.ts` / `ExportDialog.tsx`；全正文排版、1/2/4、完整/视口、安全拒绝、原图失败提示、独立关系PNG含箭头标签。新增files.originalImage IPC，无正文迁移 | PNG末行像素、尺寸倍数、原图、失败、导出前后数据不变；回退导出入口及模块。本批并非DOM逐像素截图：白底输出，完整导出展开正文可能覆盖邻近对象；视口裁切不展开 |
| 9 通用控件不一致 | `src/xigra/AppSelect.tsx` 与 TopologyWorkspace 原生select并存；`controls.css`、现有Base UI Dialog/Menu | 第3批统一规范并保留aria/focus；本批两个新弹窗复用Base UI/AppSelect；不全局替换 | 键盘、读屏语义、Escape/焦点、窄屏；回退局部组件/CSS |
| 10 禁用光标突兀 | `controls.css`、`sidebar.css`仍有not-allowed；部分绘图按钮已default | 第3批统一淡化/原因提示/disabled；不改业务判定 | 无历史Redo提示且不能执行，减少动态；回退状态样式 |
| 11 导航微交互 | `sidebar.css`已有独立hover/active和固定500字重；`interaction.css`已有160ms图标过渡及reduced-motion | 第3批实际复查背景、文字图标同步与唯一active，保留已有布局 | hover/active/键盘/reduced-motion/宽度稳定；回退局部样式 |
| 12 IP数字列表 | `LanNotesDialog.tsx`以addresses:string[]渲染；`desktop/engines/lan-notes.cjs`从os.networkInterfaces提取地址，丢失网卡名/类型 | 第4批扩展接口元数据，保留兼容地址字段；虚拟与推荐只按可证实信息标注，活动共享切换先告知 | 真网卡/虚拟/断开/切换失败和状态同步；回退新元数据展示与选择逻辑 |
| 13 共享层级和权限 | `main.tsx`共享dialog、`desktop/main.cjs`share：HTTP服务绑定0.0.0.0、随机Bearer token在链接fragment中，server使用timingSafeEqual校验；legacyOnly过滤拓扑/本机内容。设备便签互传另有TLS配对，不能混称白板已有设备授权 | 第4批区分启动/监听/外部访问，明确“持有链接者可访问共享内容”、HTTP局域网风险。token鉴权不等于按设备授权；如需设备批准，新增会话授权/撤销与范围协议，不能只改UI | 无token/错token/正确token/非公开内容隔离/双机/停止失败；回退UI，授权改造另订迁移 |
| 14 自启是否真正生效 | `desktop/main.cjs`已有get/setLoginItemSettings、--autostart与startHidden/startMinimized，开发环境禁用；不是只有本地布尔值。设置调用之后没有就地核验系统实际注册结果，便携路径/安装形态可靠性待验 | 第4批实际注册后回读比对、失败恢复；评估Portable临时解压路径，不能按isPackaged一概声称支持；不擅自修改本机启动注册 | 安装版/便携/开发、系统管理器改动、Windows登录、托盘和快捷键；回退注册到原状态并恢复旧UI；本批未操作注册表 |

第1–4批源码已实施，当前自动验证以各批报告为准。物理鼠标、混合显示器DPI、Windows重启自启、真实双机、安装升级与长稳仍不在已通过范围。
