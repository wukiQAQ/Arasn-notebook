# 便签系统与基础控件 · 第一批交付

## 范围与审查结论

已完成代码审查和真实Electron界面审查，只实施第一批；第二/三批未实施。沿用Graphite深色、现有品牌蓝与亮色适配，选择“文档编辑区 / 关系摘要卡 / 空间纸片”方向，通过结构、密度、操作入口区分角色。未新增依赖、未迁移或批量重写数据、未打包EXE。

| 对象 | 数据模型 | 本批展示与交互 |
|---|---|---|
| 便签页 | RecordSession读取原text/node记录，正文只有一份 | 左索引+大正文；去除页眉重复正文首行；搜索、最近、关联分类筛选；字符数和真实保存状态；查看/加入关系画布；文件管理、复制、更多管理 |
| 关系节点 | canvas-node.contentRef引用原记录，layout独立 | 类型色标/图标、状态、标题、两行摘要、原记录摘要来源、真实保存状态、连接锚点；正文仍从原记录读取；卡片不直接承担大段输入，属性面板与原记录继续可编辑 |
| 工作页便签 | 同一text原记录，保留原x/y/width/height/opacity | 可拖动的短条、色签、纸片边角、直接编辑；与绘图共存，没有关系锚点、类型状态或关系摘要页脚；长正文仍可滚动，不擅自放大旧对象 |

补充审查：笔迹级橡皮擦已有范围圈、大小、Undo及非绘图保护，应在第二批整理工具逻辑，无需重复实现。画笔尚缺预设/高级参数，留第三批；当前StrokeValue不能直接宣称支持软边或压力。

## 已完成的控件整理

- 统一18px复选框、居中勾选、品牌选中底色、未选边框、hover、focus-visible、disabled和标签间距；保留原生checkbox语义与键盘行为，高对比模式回退原生外观。
- 新建共享AppSelect，复用已安装Base UI，统一36px高度、箭头、边框、浮层间距/阴影、选中勾号、高亮项和焦点。设置主题、触发器动作/修饰键/中键手势及三处节点类型入口使用该菜单。
- 便签/问题/灵感/待办有轻量色点，亮暗主题分别定义语义色。其他原生select统一外观；其他工具参数菜单留第三批重构。
- 菜单按键留在控件内部，Escape关闭菜单并将焦点还给触发器，不误关属性面板或触发画布快捷键。
- 修复原移动端CSS隐藏关系画布入口的问题，390px底部导航保留三种场景入口。

## 修改文件清单

生产文件：

- `src/main.tsx`：主题菜单接入、文件管理回调、空间便签标识和新样式导入。
- `src/xigra/records/RecordWorkspace.tsx`：文档结构、关联筛选、字符数、原记录管理操作。
- `src/xigra/TopologyWorkspace.tsx`：节点类型菜单、卡片层级、正文与布局保存状态合并展示。
- `src/xigra/TriggerSettings.tsx`：设置选择菜单统一。
- 新增`src/xigra/AppSelect.tsx`、`src/xigra/controls.css`、`src/xigra/note-roles.css`：共享选择器、控件状态、三类展示与响应式样式。

验证文件：

- 新增`tests/note-roles-desktop.cjs`、`tests/note-roles-checks.cjs`、`tests/helpers/select-option.cjs`。公共选择测试同时支持当前自定义菜单和旧EXE中的原生select，不伪造隐藏控件。
- 调整当前菜单和按钮交互：`tests/{topology-desktop,relation-canvas-desktop,settings-smoke,quick-panel,visual-review,trigger-visuals,trigger-desktop,xigra-batch1,xigra-batch2,xigra-p0b,xigra-p1,xigra-theme}.cjs`。这些历史脚本并非全部重跑，实际执行范围见下表。
- 交付文档：本报告、`docs/superpowers/plans/2026-11-14-note-roles-batch1.md`、`HANDOFF.md`。
- 构建产物`dist/`已更新；截图与验证日志见下方，不同步旧release/EXE。

## 实际验证结果

| 验证 | 结果 |
|---|---|
| `npm run build` | 通过，含TypeScript；仍有既有大包/依赖指令打包警告 |
| `npm test` | 64/64通过，沙箱外运行避开已知EPERM限制 |
| `node tests/note-roles-desktop.cjs` | 最终版本通过：1440/820/390；搜索/关联筛选；文件库入口；复选框真实保存与disabled；亮暗切换；菜单选中项/色点/键盘/Escape焦点；同一正文跨三场景更新；笔迹与其他便签未变，未复制正文 |
| `node tests/topology-desktop.cjs` | 最终版本通过：旧便签、类型/状态、负坐标、拖动历史、缩放、小地图、重启/恢复、窄屏返回、双击创建、减少动态 |
| `node tests/relation-canvas-desktop.cjs` | 通过：连接/编辑/删除/重启、原记录双向编辑、引用添加去重、布局持久化与隐藏恢复 |
| `node tests/settings-smoke.cjs --source` | 通过：设置/快捷键冲突回滚、主题、置顶偏好、重启、mock登录适配器。不是原生置顶有效性的专项验收 |

截图前后均来自独立临时数据；没有打开个人库。设置脚本默认指向旧打包EXE，本次明确使用`--source`。拓扑旧测试在窄屏访问关系页的失败揭示隐藏入口，已修复生产CSS并完整复跑通过；未放宽可访问性断言。新增截图脚本显式取消最大化，等待目标宽度/正文边界稳定。

## 实际截图与两轮复查

- 修改前：`docs/screenshots/note-roles-before/`，已查看四个页面。
- 第一轮：`docs/screenshots/note-roles-pass1/`，已检查文档页/390px、关系节点、空间便签、深色菜单、复选框焦点。修正纸片边角、窄屏按钮细节，并补上菜单按键隔离和窄屏导航缺陷。
- 最终轮：`docs/screenshots/note-roles-final/roles-final/`，已检查1440/820/390代表截图、类型菜单、亮色设置、窄屏设置菜单与导航。最终结果`result.json`；拓扑完整回归图位于同级`topology-final/`。

可直接打开：

- [便签主编辑区](screenshots/note-roles-final/roles-final/records-verified-1440.png)
- [紧凑关系节点与类型菜单](screenshots/note-roles-final/roles-final/node-type-menu.png)
- [自由工作页纸片对象](screenshots/note-roles-final/roles-final/free-verified-1440.png)
- [深色复选框与键盘焦点](screenshots/note-roles-final/roles-final/checkbox-focus-dark.png)
- [390px便签页](screenshots/note-roles-final/roles-final/records-390.png)
- [390px设置菜单](screenshots/note-roles-final/roles-final/settings-menu-390.png)

## 尚未解决与下一批建议

- 本批分类为“所有/已加入/未加入关系画布”，直接从已有引用计算；未新增独立标签或把关系节点类型写成便签本身的分类。
- 文件管理按钮打开现有文件库。**本批没有新增单条便签的附件绑定**，也未把文件库导入提示为附件已绑定；如需附件，要沿既有content-link另做保存失败/删除保护验收。
- 第二批：整理导航/创作/历史分组，明确选择和手掌的实际行为及提示，保留真实笔迹级橡皮擦，严格区分“删除选中对象”和“擦除笔迹”，复核非绘图保护与Undo。
- 第三批：按工具拆分属性面板，增加色板/预设/高级颜色与画笔参数；先定义兼容旧StrokeValue的存储/渲染默认，再考虑自定义预设、软边和压力接口。
- 未重跑原生Win32输入/窗口置顶/物理混合DPI/触控/长稳；先前偶发输入中断根因和原生前台问题仍未确认。视觉、单测和本机CDP专项通过不替代这些结论。

本批结束。下一批建议新聊天先读HANDOFF与本报告，不重新讨论已定数据模型或重做本批视觉。
