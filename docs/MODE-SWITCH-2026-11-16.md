# 模式切换按钮统一

- 用户任务：速记便签区与完整工作区之间切换，两个入口属于同一组件家族，优先级低于新建便签。
- 方向：考虑纯文字、实心填色和细描边三种处理；选择中性细描边，既能辨识切换入口，也避免与主按钮争夺注意。沿用应用字体和主题，不新增视觉品牌。
- 组件：两处均使用 ViewSwitch → Button（Secondary）；双向箭头图标，完整名称“切换到工作区 / 切换到便签区”。原回调和输入法组合时禁用规则保留。
- 参数：44px 高、13px 圆角、17px 图标、15px/600 字体、左右16px、间隔8px。540px及以下左右12px、文案缩为目的区域名，aria-label/title仍保留完整名称。
- 深色：底色#242830、白色16%描边；hover #2d323c/白色24%描边，pressed #353c48。亮色使用浅灰底与深色细描边。Focus-visible为1px外线，不叠加内阴影、不切换字重或缩放。
- 便签区新建按钮沿用现有主动作强调色，以保持主次层级。通用状态规则排除模式按钮，由共享Button统一控制。
- 验证：npm run build通过；node tests/mode-switch-desktop.cjs通过。真实Electron亮/暗×1440/820/390×两个模式，共12组，默认/hover/pressed/focus截图48张，尺寸、字重、图标、无越界、Tab/Enter真实切换、草稿保留、renderer无错误均通过。已查看两轮代表截图。
- 证据：docs/screenshots/mode-switch/final/及metrics.json。390px为测试时临时降低原生最小尺寸，不修改产品窗口限制；物理跨屏DPI、全量业务回归和完整读屏未测试。旧测试中以“打开工作区”定位按钮的断言需要改用新名称或组件选择器。
- 构建仍有既有bundle体积、use-client与inlineDynamicImports警告；未打包EXE、提交或推送。
