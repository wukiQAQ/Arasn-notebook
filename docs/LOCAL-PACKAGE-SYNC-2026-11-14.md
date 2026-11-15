# 本机成品同步 · 2026-11-14

根据用户“同步更新”的指令，将当前源码构建同步到本机 0.6.0 成品，包含便签分工、工具栏行为、画笔属性/预设及既有修复。未运行安装向导、未覆盖外部安装目录、未迁移个人数据；历史 0.5.0 与 lagoon 目录未改动。

## 已更新

- 根目录 `Arasn-0.6.0-Portable.exe`、`Arasn-0.6.0-Setup.exe`。
- `release/ArasnNotebook-win32-x64/` 与 `release/ArasnNotebook-0.6.0-win32-x64/`。
- `release/distribution/` 的便携包、安装包与 `win-unpacked` 应用本体。
- 桌面 `Arasn.lnk` 已只读核对：工作目录为本项目，通过 `npm start` 启动，无需改动快捷方式。

| 成品 | 字节数 | SHA-256 |
| --- | --- | --- |
| Portable | 113339953 | `89dd56fc24ca8a2e085f26f1ec7786db66a22e69ca83ba3019897e9476aeff6a` |
| Setup | 132146072 | `cf3f351480ffbbd4729684b4dcde303476acf6d5db91d6bd9b08b0df105748c2` |

## 实际验证

1. `npm run pack:exe` 在沙箱内因无法启动 NSIS 编译器失败；沙箱外重试完整退出 0，生成并同步两个 EXE。两个文件夹版打包分别退出 0。
2. 根目录与发布目录两份 EXE 的 SHA-256 分别一致。三个应用目录的当前 `dist/desktop` 与两个原生快捷键依赖共 127 项文件逐项 SHA-256 全部匹配；主入口和版本亦正确。此项核对当前源文件集合，不声称排除了目录中所有旧资产。
3. `node tests/core-desktop.cjs --packaged` 退出 0：真实版本化文件夹 EXE 的文件投递、剪贴板、清空保留文件、回收恢复及 SQLite 重启通过，全部使用隔离数据。
4. `node tests/portable-exe.cjs` 退出 0：本次实际单文件启动器自解压启动、SQLite 保存、文件页通过。测试退出后，本次 `.runtime/arasn-single-exe-*` 临时目录已验证路径并删除，`portable-check.json` 标记 `temporaryDataRemoved=true`。沙箱内额外 CIM 进程枚举不可用，不据此声称进行了独立进程枚举确认。
5. 两个 EXE 的内嵌归档经缓存中 7-Zip `t` 检查退出 0，报告 `Everything is Ok`；均保留 `There are data after the end of archive` 提示，不能称为无警告。

证据：`docs/screenshots/package-sync-2026-11-14/`。载荷清单在 `release/distribution/sync-verification.json`；成品哈希在 `artifacts.json`；单文件结果在 `portable-check.json`，该三份记录也已复制进本轮证据目录。

本次只做本机成品同步。没有重新做 UI 视觉审查，没有运行安装向导或真实原地升级，没有重跑硬件/混合 DPI/长稳/真实双机专项。此前原生前台保护失败与偶发输入中断根因未明的结论继续有效，详见 `NATIVE-QUALITY-RECHECK-2026-11-14.md`。

使用时退出旧实例，再启动新版；不要用旧版本覆盖新增画笔参数。当前同步无剩余必做项，下一项质量工作仍为普通 Windows 桌面的受保护原生输入及物理硬件验收。
