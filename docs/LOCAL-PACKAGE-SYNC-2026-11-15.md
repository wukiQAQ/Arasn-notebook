# 本机成品同步 · 2026-11-15

用户授权执行下一步打包同步，已将包含主题第二批、配色第三批及此前交互更新的当前源码构建同步到0.6.0成品。未运行安装向导、未覆盖外部安装目录或个人数据。历史0.5.0及lagoon目录保持原状。

## 成品

- 根目录 `Arasn-0.6.0-Portable.exe`、`Arasn-0.6.0-Setup.exe`。
- `release/distribution/` 中同名EXE和win-unpacked应用本体。
- `release/ArasnNotebook-win32-x64/`、`release/ArasnNotebook-0.6.0-win32-x64/`。

| 成品 | 字节数 | SHA-256 |
| --- | --- | --- |
| Portable | 113400744 | `eef55f8053f97ee98bd53dab8f5483e79f8a92d2ed9bf1d24328d59e7cc7c829` |
| Setup | 132523968 | `7bf3d685313517d044f13531ccdd5dc4980e624d8eb1060c222f5b34d72912b3` |

## 本轮验证

证据：`docs/screenshots/package-sync-2026-11-15/`。

| 检查 | 实际结果 |
| --- | --- |
| 沙箱外npm run pack:exe | 退出0，构建并生成两个EXE，发布脚本同步根目录，pack-exe.log |
| 两个文件夹打包 | 均退出0，pack-folder.log/pack-versioned.log |
| 载荷校验 | 三个应用目录当前dist/desktop和koffi两依赖共131文件逐项SHA-256一致，主入口与版本正确；sync-verification.json。核对当前来源集合，不声称排除所有历史多余资产 |
| EXE哈希 | 根目录与distribution分别一致，artifacts.json |
| 真实版本化文件夹EXE配色专项 | 第二次完整退出0，packaged-color-retry.log；四页亮暗、设置、紧凑、1440/820/390、指定色对、hover/焦点/禁用和完整board不变通过；实际查看新深色文件页与390关系截图 |
| 真实distribution EXE核心专项 | 最终退出0，core-packaged-final.log；文件拖入、清空保留原记录与文件、取消/撤销、回收恢复、文本/图片/本地文件剪贴板、导出取消、完整性审计及SQLite重启通过 |
| 实际根目录Portable启动器 | 退出0，portable.log；自解压后的SQLite保存、独立文件页及唯一导航通过。额外核实报告中的临时绝对路径位于项目.runtime且名称符合测试前缀，清理后portable-check.json标记temporaryDataRemoved=true |
| 两个EXE内嵌归档 | 7-Zip t均退出0并报告Everything is Ok；仍有There are data after the end of archive提示，不能称无警告 |

首轮文件夹配色验收在截图阶段超时；按其他桌面专项惯例显式show/focus测试窗口后完整通过，原失败日志保留，不将其认定为生产输入问题根因修复。tests/color-batch3-desktop.cjs增加ARASN_TEST_EXE支持与测试窗口显示。核心旧脚本直接查找“放入面板”和“粘贴”按钮，在窄文件容器里对应动作已存在于行/工具栏更多菜单；保留两次失败后适配实际入口，最终完整通过，未改生产布局或削弱文件/引用保护断言。脚本语法与git diff --check通过，既存LF/CRLF提示保留。

本轮没有改生产源码或模型，仅打包和适配成品验收脚本。新打包版内容与当前源码构建匹配；源码此前88/88单测和主题/配色专项证据见两批报告，本轮未重复全部源码单测。原构建与打包配置警告保留。

## 使用与剩余边界

退出旧实例后启动新Portable或当前文件夹EXE。此处不代表已经安装Setup或验证原地升级。物理键鼠/系统前台、真实登录自启、混合DPI、双机/防火墙、安装便携全流程及长稳仍待独立环境验收；旧偶发输入根因结论不变。

本轮同步完成后，历史“EXE未打包”只描述对应时点，以本报告与HANDOFF最新节为准。本聊天已有多轮验证输出，下一话题建议开新聊天先读HANDOFF。
