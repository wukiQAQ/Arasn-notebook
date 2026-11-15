# 0.6.0 本地核心架构

保留 Electron 45 + React + TypeScript + Vite。沿用已有文字/笔迹对象及局域网协议，不重建产品。工作区预先存在的界面改版、Base UI 组件与用户文件保留。

## 修改模块与边界

| 模块 | 文件 | 职责 |
| --- | --- | --- |
| WindowManager | desktop/engines/window-manager.cjs + main.cjs | 已有全局快捷键、托盘与单实例；新增位置/大小保存和启动隐藏 |
| StorageEngine | storage-engine.cjs / storage-worker.cjs | 独立 Worker、SQLite 事务、WAL、FULL 同步、版本迁移和旧 JSON 导入 |
| FileEngine | file-engine.cjs | 流式复制、SHA-256、唯一 ID、分页、搜索、分类、重命名与导出 |
| PanelEngine | panel-engine.cjs | 原有对象版本控制与共享；文件引用独立于文件原件，事务清空 |
| ClipboardService | clipboard-service.cjs | 仅主动粘贴时读取；文本、PNG、本地 URI/系统文件引用，互斥防重复 |
| RecoveryService | recovery-service.cjs | 软删除、恢复、备份、校验、孤立对象检测和清理中断恢复 |
| ThumbnailService | thumbnail-service.cjs | 仅按需生成并缓存 PNG/JPEG 缩略图；不预览可执行或活动内容 |
| 窄接口安装器 | install-services.cjs / preload.cjs | IPC 发起者校验，系统文件选择和导出确认；不向前端暴露通用文件读写 |

## 数据目录与迁移

均位于 Electron userData（通常 `%APPDATA%/arasn-notebook`），不在桌面或源码中存储导入内容。

```text
workspace.sqlite (+ -wal / -shm)
objects/{UUID}.bin       文件原件，名称只存元数据
staging/{UUID}.part      导入中间文件
thumbnails/             按需缩略图缓存
backups/                清空回收站 / 恢复前的安全备份
```

`PRAGMA user_version=1`，迁移事务建表。数据库版本高于程序支持时拒绝降级。首次将原 board.json、settings.json、recovery.json 导入数据库，原文件保留，后续不再作为核心写入目标。请勿在迁移后用 0.5.0 继续编辑旧 JSON。

表：panels（面板快照及版本）、elements（文字/笔迹）、files（大小、SHA-256、分类、状态、软删除时间）、file_refs（面板与原件关系）、settings（设置和恢复队列）、operations（导入/清理日志）。数据库仅存元数据和小型面板内容，不存大型文件。

## 保存与恢复协议

- 导入：记录 running → 流式复制及哈希 → fsync → 原子移动 → 事务登记 files 与 done。源文件改变或导入失败不发布半成品；启动时处理 running 日志，保留错误供重试。
- 面板：沿用对象版本校验和幂等编号。Worker 事务提交后才返回确认；桌面队列写入 SQLite，不以 localStorage 作为核心存储。
- 清空：界面二次确认，先排空保存队列，再事务清空文字/笔迹及 file_refs；files 与 objects 不删除，并保存清空前面板快照。
- 文件删除：只设置 deleted_at，回收站可恢复；清空回收站先备份并验证，再按日志移除原件。备份默认不自动清理。
- 备份：SQLite 一致性备份 + 全部就绪文件 + 哈希校验与 manifest。恢复前先备份当前内容，合并文件、恢复面板，保留当前程序偏好；停止 LAN 服务以隔离旧参与者。
- 完整性检查由用户主动触发，检查 DB、丢失文件、哈希、孤立对象与失败日志。启动不扫描全部文件内容。

## 前后端接口

`desktop.files.list({query,kind,page,trash,panel})` 每页25条；`choose()` 原生多选；`drop(File[])` 由 preload 的 webUtils 提取真实来源路径；`action(rename/trash/reference/export/audit/backup/restoreBackup/purge/retryFailed)`；`paste()` 仅主动调用；`clearPanel()`；`progress()` 订阅任务进度。

文件引用在“文件 → 面板文件”视图中查看，尚不作为可拖动附件卡片画在绘图画布上。文件不通过现有 LAN 文本/笔迹接口暴露，浏览器参与者无法调用本地文件服务。

## 性能与安全

SQLite/哈希/流复制在 Worker 中，前端只收元数据和小缩略图。桌面白板采用变更事件通知和有待发任务时的重试，取消本机空闲轮询；LAN 浏览器仅可见时轮询。完整性检查和备份是显式耗时任务，有进度和错误反馈。

所有 SQL 值参数化，ID/文件名校验、系统对话框授权、固定内部对象路径；不执行导入内容。分类仅用于展示，不能作为安全依据；缩略图仅接受 PNG/JPEG 签名且大小受限。无后台剪贴板监控，无自动不可恢复删除。

## 当前验证边界

见 tests/storage*.test.cjs、tests/core-desktop.cjs、tests/performance.cjs。真实按键至画面完成、实体两机、系统断电及超大目录长期负载仍需现场验证。Electron 的包体和驻留内存仍较高，不将本轮模块化当作轻量化目标已经完成。
