# 全局交互专项第4批

范围：原审查 #12 网络接口、#13 共享访问说明、#14 系统自启回读。源码/dist更新；未提交、未打包EXE、未修改本机真实启动注册。已有工作区修改原地保留。

## 设计与行为

延续 Graphite 深浅主题与 Base UI/AppSelect。采用现有弹窗分区增强：网卡、状态及操作、访问说明；没有整页设置重构或多步向导。系统字体、正文14px/提示12px、8/12/16px间距、既有语义色与控件。设计依据与实施清单见 `superpowers/plans/2026-11-15-interaction-batch4.md`。

- **网卡**：系统名称+私有IPv4；疑似虚拟仅按名称匹配，优先尝试仅指首个非疑似虚拟地址，不声称物理网卡、默认路由或外部连通。过滤内部/IPv6/公网/链路本地地址，保留旧addresses字段并新增interfaces/addressAvailable。便签和白板共用NetworkPicker与AppSelect；接收设备也沿用AppSelect。
- **切换/断开**：活动服务锁定网卡，明确先停止再切换；刷新或重新打开读取新网卡信息。监听地址消失保留真实活动状态、显示异常，白板隐藏失效地址的链接；不自动重启或迁移服务。没有后台持续监控网卡。
- **白板**：share(boolean, host?)兼容旧布尔调用，默认选择列表首项；从监听0.0.0.0改为单个所选私有地址，链接只含该地址。运行中请求不同网卡被拒绝，仍与便签传送互斥。共享只包含既有legacy文字/笔迹；本机文件、附件、节点/关系隔离；没有新增按设备批准/撤销协议。
- **访问说明**：区分监听成功与外部连通未验证；明确持链接者可读写共享内容、HTTP未加密、便签配对不约束白板、主机及防火墙要求、停服断开与新会话换凭证。保留随机Bearer与timingSafeEqual。
- **停止失败**：HTTP close回调原先忽略error，现传播拒绝；主进程仅成功后清理共享状态。LanNotes仅监听器关闭成功后清理活动状态及待传任务。测试保留失败后的活动状态，不虚报关闭。
- **自启**：StartupSettings统一path/--autostart读写。区分未注册、已注册且获准、Windows禁用、读取失败、不支持；优先按匹配path/args的用户launchItem判断批准，避免另一组args的全局executableWillLaunchAtLogin掩盖禁用。开发/非Windows/便携环境变量/临时目录禁用。设置后立即回读比对；静默无效或后续存储失败恢复原注册及批准状态，恢复失败单独报告。自启勾选不提前乐观提交，弹窗内显示失败；可刷新系统状态，重新打开设置也回读。

## 实际验证

| 命令/检查 | 结果与范围 |
| --- | --- |
| npm run build | 通过，源码/dist更新；保留已有Base UI模块指令、chunk大小及inlineDynamicImports警告 |
| npm test | 沙箱外最终87/87通过；新增7项已接入默认命令 |
| node tests/interaction-batch4-desktop.cjs | 第二轮完整通过；最终轮在HTTP close回调修复后再通过；隔离真实Electron，回环网卡夹具 |
| node tests/lan-notes-desktop.cjs | 双Electron进程配对/确认后收正文/持久保存回执通过，使用本机回环；不等于真实双机 |
| node tests/settings-smoke.cjs --source | 快捷键/冲突回退/主题/置顶偏好/重启恢复/开发自启禁用通过；置顶为既有设置回归，不是原生窗口层级专项 |
| 视觉 | 实际查看pass1/pass2及final的真实界面截图；1440/820/390，深浅共享、便签与设置、网卡下拉及错误状态 |

最终一次只读审查未发现确定问题，范围为本批网络、自启、关闭失败、UI状态及访问说明；审查者未独立重跑测试，不冒充额外测试证据。

专项断言：网卡排序、虚拟提示、AppSelect键盘/Escape焦点；监听中不可切换、地址消失/恢复、无可用地址禁用；选中127.0.0.2实际监听/HTTP读取及修改；无凭证/错凭证401，本机节点读写隔离403；便签与共享互斥；停止回调失败仍活动、成功后不可连接、新凭证轮换与旧凭证失效；绑定不存在地址失败后仍关闭；模拟自启写入回读、系统外部禁用、静默无效、存储失败恢复、便携禁用及重新打开设置刷新；无页面运行错误与窄屏横向溢出。

新增单测先以缺少模块失败，再实现通过；HTTP关闭回调新增测试先复现Missing expected rejection，再修复通过。首轮沙箱临时文件rename EPERM改为沙箱外执行；测试最初误期望无凭证403，依据现有服务器改为401；故意自启失败应不勾选，脚本改为click+错误/最终状态断言；Electron注入模块路径由相对改绝对。没有降低业务断言。

首轮截图发现网卡标签继承22px上下margin，修正为0及6px组内间距；禁用当前网卡过淡，保留disabled语义并使用muted/rail可读样式；长网卡增加完整title，宽度约束复用已有AppSelect。第二轮复看后未见遮挡或横向溢出。

## 文件及回退

新增 `desktop/engines/{network-interfaces,startup-settings}.cjs`、`src/xigra/NetworkPicker.tsx`、`tests/interaction-batch4{.test,-desktop}.cjs`、本报告及计划。修改 `desktop/{main,preload,server}.cjs`、`desktop/engines/lan-notes.cjs`、`src/{board.ts,main.tsx}`、`src/xigra/{LanNotesDialog.tsx,lan-notes.css}`、`package.json`、README、全局审查与HANDOFF。

截图：`docs/screenshots/interaction-batch4/{pass1,pass2,final}/`。夹具网卡名称/IP明确用于隔离验收，不作为宿主真实网卡或外部连通证明。
回退：移除本批UI/元数据和可选host参数、自启适配器及接入；无数据库迁移。若回退单网卡监听为0.0.0.0须同步恢复界面说明。HTTP关闭错误传播应保留。未执行任何真实启动注册，故本轮无宿主启动项需要恢复。

## 尚未实测

Windows退出登录/重启、真实任务管理器改动、安装版/便携成品、两台电脑与防火墙、物理网卡拔插/默认路由/VPN可达性、混合DPI、物理输入、长稳与安装升级未测。自启生产代码调用系统API，但自动验收使用模拟；“已回读注册”不等于已验证登录启动。便携检测覆盖已知环境变量和当前临时目录，未知启动器仍需单独评估。共享地址检测靠刷新/重开，不证明网络可达。前三批其他边界继续有效。

API依据：[Electron app.getLoginItemSettings/setLoginItemSettings](https://www.electronjs.org/docs/latest/api/app#appgetloginitemsettingsoptions-macos-windows)。当前文档明确相同path/args回读，并区分注册、启动批准与可执行文件任意参数启动状态。
