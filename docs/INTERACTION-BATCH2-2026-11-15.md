# 全局交互专项第2批

范围：#1关系紧凑提示、#3输出端连接、#5选择/平移、#6双模式橡皮擦。源码/dist更新，EXE未打包；第3/4批未实施。本轮使用systematic-debugging定位、frontend-design延续Graphite、visual-qa检查实际截图，没有读取到用户原始14张截图。

## 根因与交付

| 编号 | 根因/原实现 | 现在的行为 | 数据/API及回退 |
| --- | --- | --- | --- |
| 5 | main.down中select空白直接清选择，hand才启动视口手势 | 默认选择：空白拖动平移、点击/拖动笔迹选中和移动，便签手柄/正文与附件沿用原编辑路径。移除工具栏独立手掌入口，保留中键临时平移及原全局中键绑定保护。Shift拖空白框选多个对象，Delete/删除按钮整批删除与撤销；点击对象单独调整，不引入分组移动 | 没有数据迁移。框选是会话状态；删除附件仅移除引用。回退手势/工具栏代码，既有数据可继续读 |
| 6 | useDrawingTools只用strokeHit记录整条ID，结束后删除；原模型已是矢量点列 | 属性里选择“整条笔迹/局部擦除”，12–96屏幕px范围和圆形光标。局部按圆或扫掠胶囊解析求交，保留真实边界点和连续片段；手势过程中只预览，结束后原笔迹删除+新片段创建一次提交到历史，取消不写入；外部修改冲突则保留外部数据 | 沿用StrokeValue及保存API，无schema变更。平滑笔迹先取实际渲染折线，片段smoothing=0避免二次平滑，颜色/笔宽/透明度/端点/笔刷继承。长片段按3000点上限连续拆分。回退模式入口即可，已生成合法片段仍可被旧版读取 |
| 3 | 输出端早已有pointer capture拖连和实时预览，并非完全缺失；目标合法性反馈不足 | 目标节点和输入端显示克制描边；松开后forward箭头指向目标。空白、自己、重复边、Escape、取消/失焦不生成错误边，原有类型/方向属性编辑保留 | 无新边结构或默认双向箭头。回退目标反馈及取消状态处理，不影响既有边 |
| 1 | SVG title原生提示不可控制尺寸/避让，详情由FloatingInspector展示 | 自定义最大200px紧凑tooltip，显示类型与可选说明；按视口夹取并避开节点，鼠标离开消失；键盘focus等价、Enter/Space才编辑，Escape关闭。保留18px命中区和文字标签，aria-label包含完整说明 | 无存储/API变更。特别拥挤且找不到安全区域时不覆盖节点，保留完整可访问名称。回退tooltip渲染，详情功能不变 |

局部擦除不是白色遮盖，也不是隐藏原笔迹冒充擦除；保存的是实际保留的点列。对虚线笔刷，分割后各片段按各自起点重启虚线相位；没有新增相位字段或栅格像素蒙版。一次撤销恢复原始完整笔迹及原样式。

## 设计与两轮检查

采用默认智能选择+现有属性面板+邻近紧凑提示。保留系统字体、Graphite表面/文字/边界tokens及现有节点几何、关系曲线结构；不扩展全局配色。

真实截图在 `docs/screenshots/interaction-batch2/{before,after}/`，均为隔离测试fixture。第一轮实际查看擦除设置、真实断开片段、输出拖连预览、关系键盘提示。第二轮修正框选状态提示与底部工具提示重叠、tooltip说明行数与安全高度，以及窄视口边缘避让搜索范围；重新捕获并查看浅色框选、浅暗关系提示、1440/820/390关系画布。工具/绘图既有专项另覆盖390px属性面板和深色。

前后重点图：
- `before/free-light-1440.png` → `after/free-light-1440.png`：独立手掌入口移除。
- `before/eraser-properties.png` → `after/eraser-properties.png`：整条/局部模式选择。
- `after/partial-result.png`：真实断开的两个片段及范围光标。
- `after/shift-selection.png`：多对象框选反馈。
- `after/connection-preview.png`：实时曲线及合法目标反馈。
- `after/relation-focus.png`、`after/relation-dark-focus.png`：紧凑提示与键盘访问。

## 文件清单

新增 `src/erase-path.ts`、`src/relation-tooltip.ts`、`tests/erase-path.test.cjs`、`tests/interaction-batch2-desktop.cjs`。
修改 `src/{main.tsx,useDrawingTools.ts,FreeToolbar.tsx,free-canvas.css}`、`src/xigra/{TopologyWorkspace.tsx,topology.css}`、`package.json`。
测试适配：`tests/{tool-logic,free-canvas,drawing-tools,brush-properties,free-native-input,free-quality}-desktop.cjs`（旧手掌按钮改默认选择；工具测试补齐现有附件选择器导入/添加步骤；旧主题切换按钮改现有设置API）。`tests/topology-desktop.cjs`补失败时记录中键平移事件/绑定前提，未删除原断言。
文档：本报告、实施计划、全局审查表、HANDOFF；没有提交或重置工作区原有改动。

## 实际验证

| 命令 | 结果与范围 |
| --- | --- |
| `npm run build` | 通过；保留已有依赖指令与包体积警告 |
| `npm test` | 沙箱外80/80。覆盖圆/扫掠胶囊稀疏线段交点、多次穿越、无命中保持、边缘tooltip避让及既有存储/边界/触发器 |
| `node tests/interaction-batch2-desktop.cjs` | 通过：默认平移、两种擦除、一次撤销重做、正文保护、Shift框选批量删除撤销、约48%/207%缩放擦除及取消不写入、拖连forward/预览/目标/无效/重复/Escape、浅暗键盘提示、1440/820/390、片段/边重启恢复 |
| `node tests/tool-logic-desktop.cjs` | 通过：智能选择、临时中键平移、便签移动、附件与正文保护、整条擦除与历史、选中删除、窄屏属性 |
| `node tests/free-content-desktop.cjs` | 通过：托管文件、图片/附件位置尺寸历史、PNG全图/视口、重启和1440/820/390 |
| `node tests/free-canvas-desktop.cjs` | 通过：无限平移/取消、指针缩放锚点、负坐标绘画保存、稳定属性布局、PNG、重启与窄屏 |
| `node tests/drawing-tools-desktop.cjs` | 通过：连续扫掠擦除/取消/撤销重做、正文保护、笔迹移动缩放样式、图形、重启与窄屏 |
| `node tests/topology-desktop.cjs` | 最终单独运行通过：节点类型/状态、负坐标、拖动历史、缩放、小地图、恢复、窄窗与减少动态 |

中间结果同样记录：构建曾检出把viewport回调ref误当对象ref（已修）；旧测试依赖已移除的手掌/主题按钮和过时附件流程（已适配）；tooltip边缘单测发现原160px搜索范围不足（已扩大并通过）。一次关系回归中键平移停在x=260，单独复核通过，未确认偶发原因，**不据此宣称原生中键或输入中断缺陷已解决**。最终测试日志及摘要保存在截图目录旁。

## 验收边界与后续

仍未验证：物理鼠标/触控笔/输入法、混合显示器DPI、长稳、真实双机、安装升级。390px为抗压测试，原生最小窗策略未改。本批未重新执行brush-properties、free-native-input、free-quality三项完整专项；只适配其工具名称，不计通过。第1批白底导出/长正文展开限制继续有效。

自由页框选用于多对象批量删除和撤销，随后点击单对象编辑；没有新增持久化分组或整组拖动。悬停提示以避开节点为优先，极密布局可不显示视觉浮层，但关系可访问名称保留完整说明。全局焦点/组件一致性仍属第3批，不将本批称为全面视觉审计。

按用户要求停在第2批。独立验收后建议第3批：先复验已有亮暗语义色，再修原图预览、导航/禁用反馈及通用控件；最后才做第4批网络接口、共享与真实自启。
