# 本机运行版本同步 · 2026-11-13

已将画布交互、关系线精修及工作区更新同步到0.6.0构建；用户澄清后又补充实施并同步了导航与按钮去重，详见 `NAVIGATION-CONSOLIDATION-2026-11-13.md`。

- 项目根目录 `Arasn-0.6.0-Portable.exe`、`Arasn-0.6.0-Setup.exe` 已由本次构建覆盖。
- `release/ArasnNotebook-win32-x64/`、`release/ArasnNotebook-0.6.0-win32-x64/` 文件夹版已更新；历史0.5.0和lagoon目录不改动。
- `release/distribution/` 中的便携包、安装包和win-unpacked应用本体同步更新。
- 桌面 `Arasn.lnk` 的工作目录为本项目，调用npm start；无需修改快捷方式，关闭旧进程后重新启动即可加载当前源码构建。
- 未运行安装向导、未覆盖外部安装目录、未修改个人数据；运行检查全部使用隔离数据。

验证：

1. npm run pack:exe成功，随后两个当前文件夹版打包成功。
2. 根目录与distribution两份EXE的SHA-256各自一致；三个应用目录的34个dist/desktop载荷文件与源码构建逐一一致，报告 `release/distribution/sync-verification.json`。
3. `node tests/core-desktop.cjs --packaged` 通过：真实文件夹版启动、文件拖入、剪贴板、清空保留文件、回收恢复和重启。
4. `node tests/portable-exe.cjs` 通过：真实单文件启动器、SQLite保存、文件页面。安装向导与真实原地升级未验收，不将生成安装包等同于已安装升级。

最新EXE校验以 `release/distribution/artifacts.json` 为准，已再次核对根目录副本一致；`sync-verification.json` 已刷新。最新导航构建已在真实文件夹EXE验收；上文core --packaged与单文件启动验证属于本日较早构建，不能当作最新版单文件已重复启动的证明。安装向导未运行。
