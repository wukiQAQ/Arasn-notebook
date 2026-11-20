# 关系画布交互升级

使用画布整理资料时，点选节点即可从上、右、下、左任一端口拖出关系。拖向另一张卡片，目标轮廓和吸附端口会高亮。卡片主体也能接收连线，靠近端口时优先采用明确指向的端口，卡片中心区域参考起点所在方向。松手建立关系并打开属性。空白、原节点、已有同向连接和取消手势都不会写入新关系。键盘可在选中节点后聚焦端口、按 Enter，再聚焦目标节点按 Enter。

「整理」按钮旁的确认浮层淡入 180 ms、淡出 140 ms，水平移动 6 px。确认后用现有关系布局算法计算位置，节点与曲线共用 320 ms 的逐帧坐标。锁定节点和多选范围沿用原有规则，整理会生成一条撤销记录，完成时显示 Toast。系统启用减少动态效果时立即应用布局。

「节点」菜单与节点详情的类型下拉均可进入自定义类型管理。类型支持名称、九种图标、预设或自定义颜色、可选描述和排序。删除前显示使用数量，并可迁移到其他类型。迁移覆盖已隐藏但可恢复的节点，可随同类型删除一起撤销或重做。卡片沿用现有字体与中性底色，类型颜色用于页脚图标和轻量标签。长标签使用省略号。

## 数据兼容

- 新拖拽关系可保存一对可选字段 `fromPort` 和 `toPort`，取值为 `top | right | bottom | left`。字段缺省时沿用旧的自动路由。关系编辑、复制粘贴和导出使用同一份端点数据。关系内容及其源、目标 ID 无需迁移。
- 本机画布选项增加有序的 `nodeTypes` 列表。每条记录为 `{ id, name, icon, color, description? }`，排列顺序即菜单顺序。支持最多 100 个自定义类型。
- 节点布局使用可选的 `customTypeId` 引用定义。`layout.kind` 保留内置类型兼容字段，定义缺失时显示该内置类型。应用仍从原便签读取标题和正文。

## Electron 实拍

| 验证内容 | 截图 |
| --- | --- |
| 默认与选中 | [默认](screenshots/relation-ports-types/01-idle.png) · [选中四向端口](screenshots/relation-ports-types/02-selected.png) |
| 拖线关键帧 | [拖出](screenshots/relation-ports-types/03-drag-start.png) · [吸附](screenshots/relation-ports-types/04-drag-snap.png) |
| 整理关键帧 | [确认浮层](screenshots/relation-ports-types/05-arrange-popup.png) · [移动中](screenshots/relation-ports-types/06-arrange-in-motion.png) · [整理后](screenshots/relation-ports-types/07-arranged.png) |
| 类型编辑 | [新建](screenshots/relation-ports-types/08-type-create.png) · [删除迁移](screenshots/relation-ports-types/12-type-migration.png) |
| 主题与窄窗 | [浅色](screenshots/relation-ports-types/09-type-light.png) · [深色](screenshots/relation-ports-types/10-type-dark.png) · [520 px 窄窗](screenshots/relation-ports-types/11-narrow.png) |

## 修改文件

- 画布与类型编辑。 `src/xigra/TopologyWorkspace.tsx`、`src/xigra/NodeTypeDialog.tsx`、`src/xigra/NodeColorDialog.tsx`。
- 样式。 `src/xigra/topology.css`、`src/visual-order.css`、`src/five-fixes.css`。
- 端点、导出、保存与校验。 `src/topology.ts`、`src/render-export.ts`、`src/board.ts`、`desktop/main.cjs`、`desktop/server.cjs`。
- Electron 回归。新增 `tests/relation-ports-types-desktop.cjs`。更新已有 `relation-canvas`、`relation-motion`、`canvas-nav-actions`、`integrated-navigation`、`interaction-batch2`、`network-canvas-details` 和 `workspace-interactions` 桌面脚本的连接入口。

## 复验命令

- `npm run build`
- `npm test`
- `node tests/relation-ports-types-desktop.cjs`
- PowerShell 密集场景。先设置 `$env:ARASN_RELATION_DENSE = '1'`，再运行 `node tests/relation-ports-types-desktop.cjs`。

构建与全量 92 项自动化测试通过。Windows Electron 专项覆盖四向拖线、吸附、重复连接拦截、减少动态效果、布局撤销、类型重启恢复和删除迁移。整理动画采样中，节点和端点逐帧贴合，锁定位置保持原值。密集场景使用 120 个节点和 227 条无端点字段的旧关系，采样帧间隔中位数为 20.7 ms。

既有 `relation-motion-desktop.cjs` 的 390/820 px 视口、关系方向、深浅主题和 300 节点/500 关系平移验证通过。当前的 `unified-notes-desktop.cjs` 也通过。旧 `relation-canvas-desktop.cjs` 已跑过关系编辑、节点恢复、重启持久化和删除验证，最后的旧快捷便签段因仍寻找「切换到便签区」而超时。

固定端点在整理后随卡片移动。方向与布局层级相冲突时，部分曲线仍可能绕行或交叉。自定义类型目录通过本机画布设置保存，实体触屏和跨设备共享目录未验证。
