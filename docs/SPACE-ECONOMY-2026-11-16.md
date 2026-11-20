# 便签状态、附件、浮动工具板与文件中心

## 本轮结果

选择悬浮状态胶囊、按需附件浮层和分层文件页，替代常驻横幅及多层同权按钮。复用Button、Popover、Notification、现有文件导入/引用/发送到工作页能力；不改变便签/画布/文件的既有存储格式，不新建数据库表。

- 便签区：已保存、字数和附件入口合并成轻量悬浮胶囊，不参与正文高度布局。正文底部留滚动安全内边距，最后一行可以滚至胶囊上方。导入/保存/加入关系画布改用短暂浮窗；支持悬停和键盘焦点保持，移开后继续倒计时，轻量淡出，减少动态偏好下关闭动画。失败提示保留至手动关闭。
- 附件：本地导入/粘贴结果实际关联当前便签；空白便签也可直接添加附件。入口显示N个附件，浮层列出文件名、真实来源、类型/大小及当前关联状态。支持发送到工作页、放入面板、文件中心引用、查看文件中心；有正文时可将便签加入关系画布，沿用原便签引用，未伪造单独文件节点功能。文件副本已经在文件中心、附件已保留当前便签时明确显示状态，不重复执行导入。工作区正文附件也补充来源和副本说明。
- 来源：新导入来源记录在已有operations.detail，便签引用来源存入已有settings；重启、备份/恢复沿用原存储机制。旧文件没有可靠来源时显示“来源未记录”。文件中心引用保留首次关联来源，重复引用不覆盖它。元数据不对UI暴露源路径。设备互传当前只支持便签，本轮没有实现文件互传或伪造设备来源；关系画布附件来源仅在实际有记录时显示。
- 工具板：导航拖动把手、靠左右边缘吸附、接近顶部/垂直中点吸附、双击复位、固定/自由切换、方向键微调/Home复位、位置偏好本机localStorage持久化。可用画布不足900px宽或520px高时自动固定左上，保留大窗口偏好。位置始终按可见画布及工具板尺寸夹紧；右侧停靠时缩放控件移至左侧，避免遮挡。拖动事件与画布对象隔离，不重新挂载纸面。不是关系节点吸附或坐标格式变更。
- 文件中心：头部仅返回、标题/数量、切换便签区；高频导入/粘贴/设备入口一组，视图范围和列表/网格一组，搜索/分类单独一行。轻列表左侧图标、中间名称/类型/大小/来源、右侧工作页/面板/更多，弱化行按钮和背景。低频恢复操作继续折叠，文件操作结果改用浮窗。保留原搜索、分页、选择、回收站、恢复和引用逻辑。

## 修改文件

| 文件 | 内容 |
| --- | --- |
| src/QuickPanel.tsx | 胶囊、附件关联、导入/保存浮窗及入口 |
| src/AttachmentPopover.tsx | 新增按需附件浮层、来源映射与可执行去向 |
| src/Notification.tsx / Notification.css | 复用通知，详情/快捷动作、角落定位、悬停/焦点暂停 |
| src/useToolbarDock.ts | 新增拖动/吸附/边界/偏好/键盘状态 |
| src/FreeToolbar.tsx | 导航区域拖动把手与固定按钮插槽 |
| src/space-economy.css | 胶囊、附件浮层、工具板和文件页分组样式 |
| src/main.tsx | 连接现有发送/引用回调、精简文件页头、工具板挂载 |
| src/FileStation.tsx | 分组重排、行来源、轻量消息 |
| src/FilePicker.tsx | 工作区便签附件来源和状态 |
| src/board.ts | 托管文件的可选来源元数据类型 |
| src/xigra/records/session.ts | 允许附件操作按需建立空白记录，普通写入规则不变 |
| desktop/engines/storage-worker.cjs | 来源读取与注记，重试保留来源 |
| desktop/engines/clipboard-service.cjs | 文件/图片粘贴标记真实来源 |
| desktop/engines/install-services.cjs | 允许经过校验的来源注记动作 |
| tests/space-economy-desktop.cjs | 真实导入、浮窗、附件去向、重载、拖动与截图 |
| tests/file-provenance.test.cjs | 来源、引用语境、重启与生命周期回归 |
| tests/toolbar-system-desktop.cjs | 状态胶囊控件独立于常规44px操作按钮的断言范围 |
| HANDOFF.md | 最新状态与续接说明 |

## 验证

- npm run build通过。保留其他既有修改；源码/dist更新，未打包EXE、提交或推送。
- tests/space-economy-desktop.cjs最终通过。真实文件导入三份、浮窗悬停超过原倒计时后仍可见、移开自动消失；提示消失前后正文容器高度相同。附件来源展示、发送后实际产生工作页文件引用、空白便签导入、便签正文与三条引用重载保留通过。
- 工具板右侧吸附、可视区域边界、纸面DOM实例保持、重载后位置记忆、双击左侧复位、固定/解锁，以及720px自动固定通过。
- 亮/暗主题×1440/720工作区检查，620px便签窗口状态和附件浮层检查；多轮实际截图已查看。修复右停靠遮挡缩放控件、工具板落入底部状态区的问题。
- node --test tests/file-provenance.test.cjs tests/storage.test.cjs tests/storage-boundaries.test.cjs tests/file-area-safety.test.cjs：真实文件系统环境7项全部通过，包含SQLite重启、备份、回收站、原文件保持、引用清理/恢复及异常原子性。初次隔离临时目录运行失败，实际环境同套测试通过。
- 曾有一次截图等待超时，重试完整专项通过。未跑全量业务、最大化专项、390px工作区、物理跨屏DPI、完整读屏或长期性能测试。

## 实际截图

| 验收内容 | 截图 |
| --- | --- |
| 导入完成信息卡与浮动状态胶囊 | [浮窗](screenshots/space-economy/final/quick-import.png) |
| 附件入口、来源和去向 | [亮色](screenshots/space-economy/final/attachments-light.png) / [深色](screenshots/space-economy/final/attachments-dark.png) |
| 状态胶囊 | [亮色](screenshots/space-economy/final/quick-status-light.png) / [深色](screenshots/space-economy/final/quick-status-dark.png) |
| 工具板拖动后右侧吸附与缩放控件避让 | [右停靠](screenshots/space-economy/final/tools-snapped-right.png) |
| 小窗口固定工具板 | [720px](screenshots/space-economy/final/tools-light-720.png) |
| 文件中心改前/后，深色1440px | [改前](screenshots/space-economy/before/files-dark-1440.png) / [改后](screenshots/space-economy/final/files-dark-1440.png) |
| 文件中心改前/后，亮色720px | [改前](screenshots/space-economy/before/files-light-720.png) / [改后](screenshots/space-economy/final/files-light-720.png) |

测量与renderer错误检查结果在screenshots/space-economy/final/verification.json。旧来源不做猜测；本轮不承诺尚未实现的设备文件互传或单文件关系节点创建。
