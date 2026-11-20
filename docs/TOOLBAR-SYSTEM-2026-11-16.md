# 工具栏交互与全局 UI 统一

## 范围与方向

四阶段完成：工具参数融合、顶部操作整理、共享按钮/字体规范、真实窗口验收。用户已明确选择“优先整合现有参数；缺少的能力明确记录，另轮扩展”。本轮未新增字体选择、文字对齐、图形填充、自由画布吸附或多选策略配置，也未添加无效选项或修改存储格式。

比较常驻侧栏、独立属性抽屉和工具锚定弹层后，选择工具锚定弹层：保持绘图空间与现有状态，参数靠近触发工具、无需独立入口。沿用现有亮暗主题和品牌紫色，主按钮实心，次级按钮低对比度细描边，工具默认透明，保存状态为独立文字徽标。

## 交互与实现

- 非当前工具第一次点击只激活；再次点击当前工具打开参数，再次点击关闭；切换工具关闭旧面板。选择、平移、画笔、橡皮擦、文字、图形均使用同一触发流程。
- 复用 Base UI Popover/ControlTooltip/BrushProperties；弹层位于工具旁，通过Portal浮动与边界避让，不参与画布布局，支持外部点击和Esc关闭，关闭按钮在面板滚动时保持可见。
- 删除独立工具属性按钮及“更多”中的同类入口。图形保留直接入口，即使工具栏为极简模式也能二次点击设置。
- 画笔默认颜色/宽度/笔刷、不透明度和平滑；图形默认描边/宽度/不透明度和最后使用类型；文字默认颜色/字号/字重；橡皮擦范围和整条/局部模式分别保留。参数在关闭面板和切换工具后保留；自定义笔刷预设继续按原方式持久化，不额外承诺默认参数跨重启持久化。
- 文字工具修改的是下一张便签的默认参数，不再意外修改已选中的便签。选择工具内保留明确标注的“对象属性”分区，复用已有坐标/尺寸/透明度、笔迹样式和文字样式编辑；不将对象编辑与工具默认参数混为一谈。
- 选择设置说明已有Shift框选、多选与平移行为；没有伪造尚未实现的对齐/吸附开关。
- 核实短横线调用desktop.hide/app:hide，语义为隐藏到托盘，并非Windows最小化。按用户“不要误删独立业务作用”要求保留该功能，将Minus图标换为PanelBottomClose，配完整Tooltip；未修改原生窗口frame、最小化/最大化/关闭或Esc/全局触发器行为。

## 共享规范

Button提供primary/secondary/danger及iconOnly，支持Tooltip、原生属性和ref。两处ViewSwitch继续共用同一组件，只改变目的文案。

- 常规按钮44px高、10px圆角、15px/500、18px图标、8px图文间距、16px水平内边距；窄窗口14px内边距，不缩小字号。操作组间距10px，密集工具组按既有结构收纳。
- 统一Default/Hover/Pressed/Disabled/Focus-visible；Hover轻微提亮底/边框与次级图标，Pressed加深底色，Disabled降低透明度，键盘焦点1px，无字重或尺寸切换。调色板色点是32px专用输入控件，保留色板语义；导航项、内容列表/画布对象手柄不是常规操作按钮，保留其布局。
- 字体栈Segoe UI / Microsoft YaHei UI / Microsoft YaHei / sans-serif；页面标题22px/600、模块18px/600、正文15px/400、按钮15px/500、说明13px/400、状态12px/500。已有画布对象自身的字号、颜色和字重属于内容数据，继续按原值渲染。
- ui-system.css为新Button及字体token的统一来源；删除旧button.css，旧通用状态规则排除已迁移Button，清理速记与紧凑工具栏的冲突覆盖。不是仅改截图中的几个按钮：工作站/便签顶栏、文件操作/视图/分类、关系工具/缩放、设置与触发管理、自由工具/缩放、便签正文操作、工具参数与共享AppSelect已接入。

## 修改文件清单

| 文件 | 修改 |
| --- | --- |
| src/Button.tsx | 扩展已有共享Button，主次危险、图标与Tooltip |
| src/ui-system.css | 新增共享设计tokens、状态、字体及弹层布局 |
| src/button.css | 删除，被ui-system.css取代 |
| src/FreeToolbar.tsx | 工具二次点击弹层；移除属性入口；保留极简模式图形入口 |
| src/BrushProperties.tsx | 复用参数编辑、按钮迁移、图形选择独立于自由画笔 |
| src/main.tsx | 参数状态分离、弹层内容、顶部/设置/视图控件、托盘图标 |
| src/QuickPanel.tsx | 顶部与底部操作迁移共享Button |
| src/FileStation.tsx | 操作与视图Button，图标Tooltip，分类/更多触发器 |
| src/useAdaptiveLayout.ts | 浮动工具参数不再扣除画布可用宽度 |
| src/adaptive-layout.css | 去除旧38px工具尺寸，适配44px点击区域 |
| src/control-states.css | 避免旧状态规则覆盖共享Button |
| src/quick-recorder.css | 移除/限定旧按钮尺寸、字重覆盖 |
| src/visual-order.css | 关系主按钮使用统一字重token |
| src/xigra/graphite.css | 旧速记主按钮规则仅用于未迁移组件 |
| src/xigra/visuals.tsx | 共用模式按钮18px图标 |
| src/xigra/AppSelect.tsx | 共享Button作为选择器触发器 |
| src/xigra/TriggerSettings.tsx | 设置/触发管理操作Button迁移 |
| src/xigra/TopologyWorkspace.tsx | 关系工具栏与视图按钮迁移 |
| src/xigra/records/RecordWorkspace.tsx | 正文/分区操作与更多按钮统一 |
| tests/toolbar-system-desktop.cjs | 新增工具交互、真实绘制和跨页面按钮验收 |
| tests/mode-switch-desktop.cjs | 模式按钮断言更新为本轮44/10/15/500/18规范 |
| HANDOFF.md、本报告 | 最新决策、证据与扩展范围 |

源码/dist已更新；保留其他既有未提交工作，未打包EXE、提交或推送。

## 验收结果

- npm run build：通过。仍有既有bundle体积、use-client、inlineDynamicImports警告。
- tests/toolbar-system-desktop.cjs：通过。首点激活、再次打开/关闭、切换关闭；画笔/图形颜色和粗细互不覆盖，图形类型保留，文字字号/字重保留，橡皮擦大小/模式保留；外部关闭/Esc不隐藏窗口，对象属性可编辑。打开面板前后画布DOM、宽度、相机transform一致。
- 真实鼠标绘制：画笔写入朱红12px，图形写入松绿2px；撤销两次后笔迹数据正确恢复。测试只使用隔离临时数据目录。
- 跨页面抽查所有可见已迁移Button的height/font-size/font-weight/radius，均符合44/15/500/10；截图宽度实际测量为1440/820/720，不以请求尺寸冒充截图尺寸。两轮以上代表截图已实际查看，修复完整工具栏历史行的横向溢出，并断言重做按钮不被裁切。
- tests/mode-switch-desktop.cjs：通过。亮暗×1440/820/390×双模式，共12组；Default/Hover/Pressed/Focus、相同几何和图标、Tab/Enter切换、草稿保留通过。
- tests/page-header-desktop.cjs（phase=toolbar-system）：通过。四主页面×亮暗×普通1440/真实最大化/720/390，共32组，设备弹窗8组；无标题与操作重叠、无按钮裁切或页面横向溢出；原数据、画布根实例与响应式分支内纸面保留。返回、搜索状态、新建/撤销、导出入口通过。
- node --test tests/brush-properties.test.cjs tests/drawing-tools.test.cjs tests/free-canvas.test.cjs tests/erase-path.test.cjs：12项全部通过，覆盖旧坐标兼容、缩放锚点、绘制与擦除相关规则。
- 自动审批服务曾返回一次Bad Request，同一请求重试后通过，最终无审批阻塞。没有运行全量业务、物理跨屏DPI、完整读屏和长时间性能套件。

## 实际截图

| 页面/状态 | 亮色 | 深色 |
| --- | --- | --- |
| 自由画布工具设置，1440px | [亮色](screenshots/toolbar-system/final/canvas-light-1440.png) | [深色](screenshots/toolbar-system/final/canvas-dark-1440.png) |
| 自由画布工具设置，720px | [亮色](screenshots/toolbar-system/final/canvas-light-720.png) | [深色](screenshots/toolbar-system/final/canvas-dark-720.png) |
| 便签区 | [亮色](screenshots/toolbar-system/final/quick-light.png) | [深色](screenshots/toolbar-system/final/quick-dark.png) |
| 文件，820px | [亮色](screenshots/toolbar-system/final/files-light-820.png) | [深色](screenshots/toolbar-system/final/files-dark-820.png) |
| 设置，720px | [亮色](screenshots/toolbar-system/final/settings-light-720.png) | [深色](screenshots/toolbar-system/final/settings-dark-720.png) |
| 关系画布，最大化 | [亮色](screenshots/page-header/toolbar-system/relations-light-maximized.png) | [深色](screenshots/page-header/toolbar-system/relations-dark-maximized.png) |

工具专项28张最终PNG与verification.json：screenshots/toolbar-system/final/。
全页面40张最终PNG与verification.json：screenshots/page-header/toolbar-system/。
模式切换48张状态PNG与metrics.json：screenshots/mode-switch/toolbar-system/。

后续能力清单：文字字体选择/对齐、图形填充、自由画布吸附与可配置多选策略；需要同时设计数据字段、绘制、导出与兼容验证，按用户本轮选择另轮扩展。
