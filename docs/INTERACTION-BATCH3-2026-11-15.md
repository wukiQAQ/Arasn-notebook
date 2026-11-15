# 全局交互专项第3批

范围：#2亮暗语义色、#7原图预览、#9通用控件、#10禁用反馈、#11导航微交互。第2批构建及真实Electron专项已重新通过。工作区含大量既有改动，原地增量修改，不重置、不提交、不打包EXE。

## 设计与实施约定

用户是本机笔记与画布使用者，首要任务是辨认关系、检查图片细节和稳定操作。比较三种方向：全局重新排版（超出范围）；独立全屏图片工作台（增加导航层级）；现有弹窗增强（采用，保留上下文和返回焦点）。延续Graphite系统字体、原表面/文字/焦点tokens、8/12/16px间距；原图区域居中contain、工具左对齐，不引入新品牌色。导航保持500字重、180ms背景/文字同步，减少动态时取消过渡。

实施：按需加载受现有托管安全边界约束的PNG/JPEG原图；适应窗口、100%、25%–400%和真实尺寸；取消/切换时抑制陈旧异步结果；失败可重试，不用缩略图冒充原图。文件列表和自由页共用预览。关系相关原生下拉统一AppSelect，禁用仍保留原生disabled，加原因提示；语义色先复验，不改既有数据/API。

## 交付与验证

- #2：保留现有蓝/紫/橙/绿/青语义及来源紫；六种关系在亮暗主题、51/100/200%缩放、箭头、标签、选中和减少动态下通过关系结构专项。没有数据/API迁移。
- #7：新增ImagePreview与样式；文件列表保留轻量缩略图，点击按需读取原图。自由页图片也可点击进入同一预览。加载/错误/重试、自然尺寸、适应/100%/缩放、滚动查看、Escape及返回焦点齐备。弹窗阻断Delete/撤销向背景画布传播。
- #9：关系类型、起终点、方向、状态、连接目标及滚轮设置共7处原生select改用已有AppSelect。沿用数据值、修改处理、Base UI可访问键盘和焦点行为，无新依赖。
- #10：按钮/复选框/下拉/文件选择器统一default禁用光标，保留disabled与淡化。自由页与关系历史操作显示无可撤销/重做原因；整理、缩放极限和连接目标补原因提示。
- #11：复验沿用导航hover/active、500固定字重、180ms同步颜色背景、唯一aria-current、键盘进入、宽度稳定和reduced-motion，无布局重做。

| 实际执行 | 结果 |
| --- | --- |
| npm run build | 通过；源码/dist已更新，保留已有依赖指令及打包选项警告 |
| npm test | 最终80/80通过（沙箱外，隔离临时数据） |
| interaction-batch3-desktop | 首轮、第二轮、最终均通过；1600×1000原图/100%实际宽度/125%/适应、IPC失败与重试、自由页Delete/Ctrl+Z保护与焦点、两套语义色、统一下拉键盘、禁用、导航和1440/820/390 |
| interaction-batch2-desktop | 实施前和实施后均通过 |
| relation-structure-desktop | 六种关系/交叉和短连线、51/100/200%、亮暗颜色与对比、箭头、键盘/方向、减少动态和窄屏通过 |
| file-workspace-desktop | 导入/筛选/网格/原图预览/批量附件/便签引用/回收恢复/原文件保护/返回/重启/1440/820/390通过 |
| topology-desktop | 状态、节点类型、位置、拖动历史、缩放、小地图、恢复与重启等通过 |
| free-content-desktop | 图片及附件位置尺寸透明度历史、托管保护、PNG、重启和1440/820/390通过 |

## 两轮实际视觉检查与中间结果

截图在docs/screenshots/interaction-batch3/{pass1,pass2,final}/。实际查看首轮与第二轮的桌面原图、深色390、自由页预览、关系浅暗语义色、展开下拉；检查层级、文本、溢出、按钮对比和关系箭头。首轮发现深色按钮过亮，修为现有主题表面；另补键盘隔离。首轮截图有进场动画中间态透出背景，第二轮以关闭动画的真实截图验证稳定界面。

构建和80项单测通过。首次沙箱内测试被临时文件rename EPERM阻止，沙箱外通过。控件变更后旧测试的selectOption/toHaveValue不适用于按钮型combobox，改用已有选择辅助函数/显示标签断言；退出动画短暂保留两个listbox，辅助函数现在等待当前popup隐藏，不删除业务断言。文件专项曾在820窗口断言读到1144，复跑通过，偶发原生窗口原因未确定，不宣称已修复。

## 文件及边界

新增src/{ImagePreview.tsx,image-preview.css}、tests/interaction-batch3-desktop.cjs。修改src/{FileStation.tsx,FreeFileCard.tsx,FreeToolbar.tsx,style.css,sidebar.css,file-workspace.css}、src/xigra/{TopologyWorkspace.tsx,controls.css}；适配tests/helpers/select-option.cjs及relation-canvas/relation-motion/relation-structure/topology/workspace-interactions测试。后三者中的relation-motion、workspace-interactions和relation-canvas完整专项本轮未重跑，仅适配，不列为通过。

原图沿用本机有效PNG/JPEG≤20MB、≤3200万像素限制；其他格式/缺失文件显示失败，可导出原文件。100%指源图像素对应CSS像素，物理混合DPI与高DPI显示器细节未实测。关系文件节点仍保留原有引用展示，没有新增文件协议或远端原图读取。物理输入、长稳、双机、安装升级未验。EXE未打包，第4批网络/共享/自启未实施。

本批完成。下一步先由用户体验；明确继续后再进入第4批。
