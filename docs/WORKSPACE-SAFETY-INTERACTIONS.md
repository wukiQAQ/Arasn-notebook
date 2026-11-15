# 工作区数据安全、窗口与画布交互 · 2026-11-13

## 根因与方案

1. 文件区“清空面板”经BoardClient.clearPanel→panel:clear→PanelEngine.clear→worker.clearPanel调用全局工作页清空：所有items置空，elements与canvas_file_refs连带删除。现文件区走独立的fileAreaPreview/clearFileArea/undoFileAreaClear，只操作default面板file_refs；旧clearPanel收窄为相同安全行为并返回原画板快照。
2. 便签与工作区沿用一个BrowserWindow切换模式，创建和设置直接使用全局alwaysOnTop，WindowManager切模式未应用独立策略。现alwaysOnTop只表示便签偏好（新用户默认true，尊重既有false）；工作区固定false。模式、设置、呼出都应用策略。显式快捷键/托盘呼出可以聚焦，热区等被动呼出走showInactive，最小化恢复也不主动抢焦点。未新增可同时显示的双原生窗口。
3. 画布仅标题区可拖动，普通滚轮被映射到横移，单节点布局历史未涵盖关系/批量操作，指针更新未按帧合并。现节点本体可拖动、4px阈值、中键/Space平移、明确Shift框选，镜头与拖动预览通过rAF合并，指针结束以最终坐标提交。原SVG语义色、粗线、流动箭头和浮动属性面板保留。

## 清空文件区保护

- 入口移到“恢复与数据检查”，名称改为清空文件区。文件区指“面板文件”的引用，不是中转站全部应用副本；确认显示精确去重条目数，明确不会删除关系画布节点和连接。数量覆盖此默认面板的全部引用（含回收站引用），不受当前搜索/分页影响。取消不发清空请求。
- IPC不再使用全局清空。事务内严格比较预览ref ID集合，新增/移除引用后旧确认会被拒绝；只DELETE default file_refs，不改panels、elements、canvas_file_refs、files、正文或物理文件。
- 使用已有settings保存上一批引用，和删除同一IMMEDIATE事务提交；失败完整回滚。撤销跨重启有效，保留清空后的新引用并避免重复。空清空不覆盖有效撤销。
- 如文件被用户另行清理或已缺失，撤销失败并保留引用备份，提示使用恢复备份，不伪装恢复成功。回收站中仍ready的实体允许恢复引用。画布owner仍阻止清理其文件实体。
- 未新增全拓扑清空入口。节点移除继续为hidden引用，不删除正文；关联线停显并随引用恢复。

## 画布交互

- 左键单击选中；整张节点左拖移动，4屏幕像素阈值；不因单击打开编辑。双击节点编辑。
- 中键拖动或画布/节点获得焦点后Space+左拖平移；普通空白左拖不移动节点或镜头；Shift+空白拖框选（追加），Shift+点击切换多选，Ctrl+A全选。按钮Space仍可原生激活，不被平移拦截。
- 选中多个节点后拖任一选中节点批量移动；取消/失焦不提交节点位置，平移取消回到起始镜头。
- 自动滚轮：整格鼠标滚轮以指针位置缩放，细小/双轴滚动平移，Ctrl/Meta/捏合缩放。浏览器无法可靠识别所有物理设备，提供“滚轮缩放/触控板平移”显式模式；真实触控板硬件另需验收。
- 双击空白显示靠近指针的快捷创建浮层，可选类别并填写正文；右键提供节点/空白上下文菜单。
- Ctrl+C/V为应用内画布复制粘贴，复制选中节点及内部连线。记录副本用新正文ID，单个正文+引用原子创建；文件节点复用文件ID，不复制文件实体。批次失败保留已创建项并提示，可用历史移除，不宣称整个多节点批次是数据库原子事务。
- Ctrl+Z、Ctrl+Y/Ctrl+Shift+Z支持布局、批量移动/整理、节点移除/恢复、连接创建/删除/端点/类型修改；冲突保留新修改并停止旧历史，不覆盖新数据。历史只在当前会话。删除墓碑不可复活，恢复关系使用新ID并重映射会话历史，反复撤销重做不放松原协议。
- 搜索标题/正文并定位，类别沿用已有标识；整理以规则网格摆放选中组（多选）或全部节点，不重写关系含义。
- 关系可拖锚点建立、点击/键盘选择编辑，起点/终点/类型/方向可改，拒绝自连接和重复连接。删除关系不删除节点。命中线保持18屏幕像素，端点32屏幕像素。
- 网格、32px吸附、小地图、滚轮模式按当前roomId保存在既有桌面settings；镜头沿用topologyViewport保存。无新数据库schema。详情与菜单保持浮动，不新增侧栏。

## 文件清单

应用：desktop/main.cjs、desktop/engines/{storage-worker,install-services,window-manager}.cjs；src/{FileStation.tsx,main.tsx,board.ts,topology.ts}；src/xigra/{TopologyWorkspace.tsx,topology.css}；package.json。

测试：新增tests/{file-area-safety.test,window-policy-desktop,workspace-interactions-desktop}.cjs；更新tests/{canvas-storage.test,storage.test,window-manager.test,core-desktop,topology-desktop,relation-motion-desktop,settings-smoke}.cjs。

文档：本文件、docs/superpowers/plans/2026-11-12-workspace-safety-interactions.md、HANDOFF.md。截图：docs/screenshots/workspace-safety/；原回归新增输出目录单独注明。

## 验证记录

- P0：真实SQLite事务、DELETE/INSERT故障注入回滚、过期确认、其他面板隔离、对象字节/owner/全画板不变、重启撤销、已清理/缺失实体撤销拒绝。
- P1：真实Electron原生isAlwaysOnTop、显式focus/被动无focus、旧true偏好、开关切模式、重启、canvasOptions有效/无效校验。单元WindowManager 2/2；原生专项通过。
- npm test最终50/50通过。构建通过，保留现有use-client与包体提示。
- P0真实UI --safety通过：精确数量、取消/确认、库副本和对象字节/画板/owner完整、重启撤销。实际检查桌面及真实390px截图；不是只读代码推断。
- 最终完整组合回归通过：实时连线跟随、松开前节点不落盘、两节点同位移批量拖动、三轮复制带边撤销/重做、旧边墓碑保留/新ID恢复、端点更改/自连接拒绝、搜索/整理/快捷创建/右键菜单、Space原生按钮激活、节点/平移pointercancel、设置和图结构重启一致。
- 原tests/core-desktop.cjs通过（文件导入、剪贴板、回收站、清空保护、恢复及重启）；topology-desktop、relation-canvas-desktop、relation-motion-desktop通过。
- settings-smoke.cjs --source通过主题、快捷键及占用回滚、便签置顶偏好、重启和启动隐藏偏好。源码自启动控件按设计禁用且断言禁用；仅打包环境才保留原模拟登录适配器检查，本轮未执行真实注册表自启动。
- 最终再次npm test 50/50及window-policy-desktop原生策略通过。截图检查1440px/390px，无额外侧栏或被裁切的清空确认按钮。原回归截图docs/screenshots/workspace-regression/。
- 最新动效/压力采样：300节点500边平移P95约14ms，114个间隔中1个>32ms；静态组P95约7.1ms。前台visible/focused，本机短时数据，多数压力节点在视口外，500条边仍存在。不是全设备性能保证。

仅改源码/dist；本次任务未要求重新打包或执行安装。原生IME、真实第三方办公软件、多显示器与触控板硬件未做专项，本机模拟事件和Electron原生状态不能替代这些硬件验收。


原测试适配说明：旧空白左拖平移断言改为新中键规则，旧空白双击直接生成改为快捷创建入口；设置测试名称更新为便签始终置顶，并支持--source。首次无保存镜头时的适配视图也加入保存，避免首次重开重新适配。未放宽真实断言来掩盖业务错误。

本轮修复的实际回归：撤销/重做试图复活边墓碑造成保存被阻塞；失败粘贴重复入历史；失焦取消平移遗留未保存镜头；Space拦截按钮原生激活。最终均有代码修正及实际回归验证。
