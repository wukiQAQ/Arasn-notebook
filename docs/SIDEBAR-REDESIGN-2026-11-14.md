# 侧边栏导航重设计

## 设计简报与信息架构

用户：在本地工作页、关系画布、便签与文件间切换的 Arasn 用户。首要任务是快速定位当前空间；协作入口为次级，应用偏好为低频。

| 层级 | 内容 | 布局与目的 |
| --- | --- | --- |
| 顶部 | 原品牌 Logo、Arasn | 32px 标记与20px名称横排，距主导航36px |
| 主导航 | 工作页、关系画布、便签、文件 | 同组纵向排列，不添加重复分组标题 |
| 协作 | 设备互传 | 距主导航28px，细分隔线、12px协作标签 |
| 底部系统 | 设置 | 自动贴底，弱分隔；主题位于设置内的“外观主题” |

文件、设备、设置仍打开现有弹层；工作页、关系画布、便签仍使用原路由状态。网页共享访客保留原有能力范围，仅显示工作页、便签与共享。

## 方向与样式

考虑三种方向：窄图标栏、彩色功能分区、展开式文字导航。选第三种，以横向图标文字、充分留白和单个强选中态响应用户要求。窄图标栏的标签布局不够舒展，彩色分区会让普通项与选中项竞争。

参考 [Heptabase 信息架构](https://wiki.heptabase.com/user-interface-logic) 的导航层级思路，以及 [Figma 语义色角色](https://developers.figma.com/docs/plugins/css-variables/) 的背景、品牌色区分；本方案的具体颜色与尺寸为 Arasn 本轮设计选择，不声称复刻参考产品。

桌面208px，640–1000px窗口184px；统一44px行高、6px行间距、14px文字、20px图标、12px图文间距、8px圆角。沿用项目 Segoe UI / Microsoft YaHei UI 字体链，不引入依赖或额外动画。

| 局部 token | 浅色 | 深色 |
| --- | --- | --- |
| 背景 | #f7f8fa | #20232b |
| 普通文字 | #555d6b | #bac0ce |
| 分组标签 | #737b89 | #949dad |
| 分隔线 | #e4e7ed | #343944 |
| hover | #eceef3 | #2d323e |
| selected | #5945ed | #6652f0 |

选中项为实底白字；hover不改变图标位置；键盘focus有独立外轮廓。页面入口使用aria-current，弹层入口使用aria-haspopup与aria-expanded。系统项普通字重400，其余500、选中600。待收件数量保留强调徽标。当前页面与打开的弹层可同时有状态提示：前者表示所属页面，后者表示临时入口展开。

主题属于应用偏好，已有设置选择器且支持浅色、深色、跟随系统，移除常驻快捷切换避免重复入口。导航结构按组组织、局部token集中，方便后续折叠；本轮不新增桌面折叠交互。639px以下沿用底部导航，保留全部桌面入口与协作弱分隔。

## 文件清单

- src/main.tsx：品牌名称、语义分组、主题入口收敛、弹层展开属性、引入局部样式。
- src/sidebar.css：侧栏专属布局、颜色、交互、深色与窄屏适配。
- tests/sidebar-desktop.cjs：真实Electron导航、分组、主题与响应式验收。
- docs/screenshots/sidebar-redesign/{pass1,final}/：两轮真实截图。
- 本文与 HANDOFF.md：设计决策、验证与后续范围。
- dist：生产构建更新；本轮没有重新打包或同步Portable/Setup EXE。

## 验证与边界

- npm run build通过（TypeScript、Vite、LAN bundle）；构建有依赖use-client指令、体积与旧bundler选项警告，无构建错误。
- node tests/sidebar-desktop.cjs通过：四个主导航/一个协作入口、键盘Enter切换、hover与selected区分、文件/设备/设置弹层、设置内主题切换、1440/820/390px边界与无页面异常。
- node tests/navigation-consolidation-desktop.cjs通过：唯一入口、两个设备子流程、文件三视图、草稿保留及1440/390px。
- Electron需沙箱外启动；所有测试使用临时数据目录并在finally清理，没有使用个人数据。首次断言尝试通过可访问角色查找弹层后的背景按钮，被模态隐藏；改为DOM属性断言后通过，未降低弹层验证。
- 第一轮查看浅/深桌面、820、390及键盘焦点截图，微调品牌与底部字重；主题保存提示一度遮住窄屏导航，最终截图等待真实提示消失后捕获。第二轮查看最终桌面、侧栏细节、深色、820与390截图。
- 未进行EXE打包、全套绘画/原生输入/双机传输回归；本轮不据此声称这些能力的新验证结果。

最终截图：final/desktop-light.png、desktop-dark.png、sidebar-light.png、sidebar-hover.png、relations-focus.png、workspace-820.png、workspace-390.png。
