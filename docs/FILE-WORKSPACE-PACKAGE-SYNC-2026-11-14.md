# 文件工作区第一批 · 本机同步

用户要求“同步一下更新”，已将当前第一批文件工作区与侧栏修复同步到本机0.6.0成品。第二、三批未执行，版本号不变；未运行安装向导、未改动外部安装目录或个人数据。

## 已同步

- 根目录 Arasn-0.6.0-Portable.exe、Arasn-0.6.0-Setup.exe。
- release/distribution 下相同成品、win-unpacked应用本体。
- release/ArasnNotebook-win32-x64、release/ArasnNotebook-0.6.0-win32-x64。
- 桌面Arasn.lnk只读确认仍通过本项目npm start启动，无需改快捷方式。退出旧实例后重新启动加载新版。

| 成品 | 字节数 | SHA256 |
| --- | --- | --- |
| Portable | 113354674 | cac220df9e1c702488b4f9a83fccd27c4da7d8ae17bc31e31ad8c62cbb92d1a7 |
| Setup | 132328775 | 52ee35f58a8a7bea34c39ddafcf4e53f5ec78b0629e58fd2e15412d490657d58 |

## 验收

1. 沙箱外npm run pack:exe、两个文件夹打包均退出0。
2. 根目录/发布目录EXE哈希分别一致；三个应用目录的当前dist、desktop及两项原生依赖共127个文件逐项SHA256匹配，主入口/版本正确。只核对当前来源集合，不声称排除历史多余资产。
3. 使用真实版本化文件夹EXE运行file-workspace-desktop，退出0：独立页/轻量选择器分离、单一选中态、导入/拖入、搜索/筛选/网格、预览、批量附件、便签引用、重命名刷新、回收/恢复、原文件保护、键盘返回、主题回归、重启与1440/820/390px。实际查看打包版桌面截图。
4. 实际启动根目录Portable自解压包，SQLite保存、正式文件页无管理弹窗、文件为唯一导航选中项通过，最终脚本退出0。临时数据目录已核验在本项目.runtime内并清理，portable-check记录temporaryDataRemoved=true。
5. 两个EXE内嵌归档7-Zip t均退出0，显示Everything is Ok；仍有There are data after the end of archive提示，不能称无警告。

首轮Portable已通过功能断言，但额外截图步骤在字体加载后超时。移除非必要截图，补失败清理，再跑单文件启动通过；最终Portable验收不声称有单文件截图。截图证据来自真实文件夹版EXE。

证据：docs/screenshots/file-package-sync-2026-11-14/（打包、归档、启动日志与哈希报告）；docs/screenshots/file-workspace/packaged/（真实EXE截图）。release/distribution/{artifacts,sync-verification,portable-check}.json为当前记录。

验收脚本调整：tests/file-workspace-desktop.cjs支持ARASN_TEST_EXE；tests/portable-exe.cjs增加独立文件页/唯一导航断言与临时目录清理。一次性载荷校验脚本和.runtime临时日志已移除，正式证据保留。

本轮不重复源码全套测试，源码第一批69/69及五项Electron专项证据见FILE-WORKSPACE-BATCH1-2026-11-14.md。本轮不含安装升级、真实双机、物理输入或主题系统第二批验收。此前历史文档“EXE未打包”描述其当时状态，由本同步记录覆盖。
