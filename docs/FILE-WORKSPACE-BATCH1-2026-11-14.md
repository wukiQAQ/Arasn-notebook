# 文件工作区第一批验收

范围：独立文件页面、轻量附件选择、一级导航状态。第二批主题设置结构/Design Tokens、第三批全工作区配色尚未实施；完成第一批后停止。

## 审查与设计

已读取 AGENTS.md、HANDOFF.md、CORE-ARCHITECTURE.md、WORKSPACE-SAFETY-INTERACTIONS.md、上一轮侧栏设计与实际文件/存储代码；延续 frontend-design、visual-qa 方法检查真实截图。

目标用户在工作页、便签与文件资料间切换。主任务为整理本机应用副本，次任务为不离开编辑内容选择附件。比较：继续大弹窗（空间不足）、文件页增加另一条侧栏（压缩中屏内容）、单工作页内顶部分类+工具区+列表/网格（采用）。沿用现有字体和语义色，不在第一批引入全局配色重构。

布局使用26px页标题、36px文件控件、20px桌面/12px手机内边距、16px区块间距；文件页随现有主区伸缩，内部滚动，390px保持底部导航。选择器最大600px，保留原页作为背景，只有搜索、选择、导入和确认添加。

## 已实现

- workbenchPage增加files，侧栏/命令菜单/文件触发器均进入正式文件页；返回按钮和Escape回到进入前的页面。
- 页面保留中转站、面板文件、回收站、导入、原生拖入、主动粘贴、搜索分类、预览、重命名/导出、回收恢复、文件区清空与撤销、备份恢复和完整性检查。
- 新增列表/网格切换、本页全选、批量加入工作页/当前便签，以及现有批量软删除。工作页附件复用free-file，便签附件复用content-link，均引用原文件ID。
- “放入面板/移出面板”仍操作原file_refs；“加入工作页”创建空间附件卡片。“移除引用”只解除便签附件关联，不删除应用副本。
- 文件页保留设备互传入口，明确当前仅便签互传，未声称支持文件网络发送。
- 便签和自由工作页的添加文件打开FilePicker，不再打开文件管理；QuickPanel仍使用原生系统文件选择与原拖入流程，不承载管理功能。
- FilePicker错误时保留选择，可重试；便签附件在重新进入页面时刷新元数据，副本重命名能同步显示，支持图片缩略预览及移除引用。
- 文件页隐藏原工作页并禁止其绘画Delete/Undo/Redo快捷键响应，保留画布和便签会话；切换到速记也不把隐藏画布的选择强行设为当前便签。

## 根因与安全边界

原双高亮来自sidebar.css把active与aria-expanded=true共用强选中样式。现在只有页面active强高亮：三个内容页与files互斥；文件选择/设置/设备弹层不参与一级选中态。保留focus-visible与hover。

没有数据库schema或数据迁移，没有新文件存储，没有自动启用关系画布。附件验收发现旧board写入门槛会把content-link也要求先迁移关系画布；现仅对targetRef.kind=file的便签附件放行，同时检查所属记录存在。canvas-node/edge及其他关系迁移门槛不变，共享legacyOnly仍拒绝本机引用。

新增只读files.action(metadata)经现有窄IPC返回白名单字段（id/name/category/size/sha256/deleted_at/status），UUID验证沿用原函数，不暴露源路径或对象路径。文件所有权仍由syncFileOwner在原事务同步，移除引用不清理副本，回收/清理/备份边界沿用已有实现。

## 修改文件清单

应用：

- src/main.tsx：文件页面状态、返回、选择器调用、附件写入、隐藏画布快捷键隔离。
- src/sidebar.css：删除弹层展开状态的页面选中样式。
- src/FileStation.tsx：保留管理业务、新显示方式与批量引用入口、导出FileMedia。
- src/FilePicker.tsx：选择器与便签附件显示。
- src/file-workspace.css：页面/选择器/便签附件布局与响应式样式。
- src/xigra/file-station.css：原仅限弹窗的基础控件样式应用到文件组件。
- src/xigra/records/RecordWorkspace.tsx：添加文件入口及附件区。
- desktop/engines/install-services.cjs：只读元数据操作白名单。
- desktop/engines/storage-worker.cjs：白名单元数据返回、便签文件引用独立于画布启用状态。

验收：tests/file-workspace-desktop.cjs、tests/canvas-storage.test.cjs；适配tests/{core-desktop,navigation-consolidation-desktop,sidebar-desktop,free-content-desktop}.cjs的正式页面返回、附件选择流程与既有主题入口。

文档：本文、HANDOFF.md。产物：dist已构建，docs/screenshots/file-workspace/{pass1,final}/保留两轮截图。Portable/Setup EXE没有重新打包或同步。

## 测试结果

- npm run build通过（TypeScript、Vite与LAN bundle）；原有依赖指令/体积/bundler选项警告仍在。
- npm test：69/69通过，包括新增未迁移画布时便签附件写入、UUID校验、元数据字段白名单、共享隔离、重启、引用解除与原文件保留。
- file-workspace-desktop通过：独立页无管理弹窗、只一个一级选中项、原生导入、分类搜索、列表网格、图片预览、批量工作页附件、便签附件、重命名刷新、回收恢复、原文件字节保留、返回与键盘Enter/Escape、设置/设备弹层不增加选中项、真实文件页拖入、390px选择器、跨重启数据保留。
- core-desktop通过：文件拖入、主动文本/图片/本地文件剪贴板、引用清空/取消/撤销、原正文不变、回收恢复、导出取消、完整性检查及重启。
- navigation-consolidation-desktop、sidebar-desktop通过：唯一入口、文件三视图、设备子流程、原草稿保留、hover/selected区分与键盘导航。
- free-content-desktop通过：选择与拖入、预览、附件位置/尺寸/透明度与撤销重做、移除卡片不删副本、PNG导出、重启及多宽度。
- 本轮主题仅为回归：设置内真实亮暗切换立即生效，深色偏好重启保留。跟随系统事件、无闪烁与完整WCAG对比度审核留给第二/三批，不声称已完成。

测试均使用临时数据，Electron在沙箱外运行，finally核验临时目录后清理。单测与所有专项均退出0。

首次文件分类测试误用另一组件的data-value约定，改用文件组件实际option可访问名称；首次便签附件测试揭示旧画布启用门槛，修复并补存储安全测试后通过。没有用绕过持久化的方式让测试通过。

## 视觉验收与限制

第一轮检查桌面网格、820、390和选择器：压缩手机工具条，未选中文件时隐藏无效批量动作，缩短重复安全说明；第二轮检查最终桌面列表/网格、深色、820/390、桌面/手机选择器和便签附件。截图使用测试生成的资料与图片，非用户数据。

final包含files-list-1440.png、files-grid-1440.png、files-dark.png、files-820.png、files-390.png、attachment-picker.png、attachment-picker-390.png、record-attachment.png。

已知边界：预览沿用现有安全图片缩略预览，不新增PDF/Office/音视频内嵌预览；设备文件发送协议未接入；加入工作页指自由工作页附件，未新增关系画布文件节点预览。未做本轮真实双机、原生物理输入、全量历史截图脚本或安装升级验收。第二/三批按用户要求未开始。
