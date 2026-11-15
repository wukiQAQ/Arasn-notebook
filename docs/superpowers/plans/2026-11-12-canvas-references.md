# 关系画布批次 1 实施清单

**Goal:** 在现有 BoardClient/SQLite 中提供不复制正文的引用模型与可预览、可备份、幂等的旧节点迁移。
**Architecture:** text/node 仍是内容来源；canvas-node/canvas-edge/content-link 为本机引用项，以独立 item version 更新。迁移按 roomId 和原 ID 派生稳定 ID，完整备份后事务写入，不自动改动实际用户数据。
**Tech Stack:** TypeScript、CommonJS、Node SQLite、Electron、既有恢复队列。
**Spec:** docs/RELATION-CANVAS-INTEGRATION.md，第 4、7、9 节。

## 约束与风险

- 保留旧正文、ID、版号、坐标、hidden、回执，不自动把 node 转成 text。
- 新类型及墓碑不得泄漏给白板访客；仅本机新记录也必须隔离。
- 文件索引按 owner 精确管理，清理不能忽略活跃或可恢复引用。
- 恢复队列/冲突未处理、版本过期、容量不足或备份失败时拒绝迁移。
- 新类型写入后数据库升至版本 2，旧版本应拒绝打开；恢复兼容 v1/v2。

## 执行步骤

- [x] 写模型与共享隔离失败测试：新类型校验、不可跨 room、不可跨类型、失效目标保留、同正文/布局独立版本。
- [x] 实现 server 校验与本机边界、TS 类型和引用选择器，扩展恢复队列识别。
- [x] 写迁移/文件所有权失败测试：预览无修改、队列阻止、备份校验、重复迁移、重启、旧对象不变、容量、故障恢复、备份还原。
- [x] 实现迁移规划器和 StorageEngine 事务；维护文件 owner 索引；同步 clear/backup/restore/purge。
- [x] 提供受限本机 IPC 与 BoardClient 迁移方法，仅显式调用，默认预览。
- [x] 构建、完整单测、隔离 Electron 迁移/画布/文件/白板回归；更新 HANDOFF。

## 验证记录

构建通过；41/41 单测；tests/canvas-migration-desktop.cjs、tests/topology-desktop.cjs、tests/core-desktop.cjs 和 Playwright 双客户端白板 1/1 通过。文件测试在获准执行环境使用隔离临时目录，沙箱 realpath EPERM 未用业务补丁绕过。

## 本轮边界

本清单是已确认总方案的第一数据批次。原画布暂继续读取旧布局，迁移写入能力仅在隔离测试中验收；页面改用引用模型是批次 2，必须同时消除旧布局双写后才向用户启用迁移。
