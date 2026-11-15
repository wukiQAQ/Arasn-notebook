# Arasn 全局触发器

旧版把一个快捷键字符串存进设置，原生回调固定调用面板显隐。新版让多个独立绑定指向同一动作，统一从主进程接入窗口管理。设置位于工作站的「设置 → 全局触发器」。

## 配置与执行

```json
{
  "version": 1,
  "bindings": [
    {
      "id": "default-toggle",
      "action": "toggle",
      "enabled": true,
      "input": { "device": "keyboard", "accelerator": "Control+Alt+N" }
    },
    {
      "id": "example-mouse",
      "action": "toggle",
      "enabled": true,
      "input": {
        "device": "mouse",
        "button": "Middle",
        "modifiers": ["Control"],
        "gesture": "press"
      }
    }
  ]
}
```

支持 `toggle`、`quick-note`、`files`、`workbench`、`commands` 五个动作。配置存入本地 SQLite 设置，旧版 `shortcut` 读取时迁移成第一个绑定。默认只启用 Ctrl + Alt + N。按下并松开目标组合后，界面显示候选项和检查结果。确认前可取消，已注册的键盘绑定在录制期间只填入候选项。可以修改、禁用、删除绑定，或确认恢复默认。

主进程先检查已启用绑定的重复组合，再保留旧键并尝试注册新键。成功落盘后切换动作映射，再释放移除项。注册失败或落盘失败会释放本次新增资源，旧配置继续生效。启动时单项注册失败会显示在设置中，其他可用绑定继续工作。显隐依据窗口可见性，最小化视为待呼出。快速便签与工作站动作提供直接激活入口，窗口保持已有位置、正文与选区。

## Windows 输入

- 键盘使用 Windows `RegisterHotKey` 和 `MOD_NOREPEAT`。常用字母、数字、功能键及特殊键可配合修饰键。普通文字键需要修饰键，部分系统组合会被保留或占用，F12 为 Windows 调试保留键。录制使用键盘布局产生的字母和顶排数字，忽略 IME 组合与 AltGr 文本输入。其他平台的键盘绑定由 Electron 注册。
- 鼠标使用 Windows Raw Input 的 `RIDEV_INPUTSINK`，以消息接收后台输入。低级钩子 `WH_MOUSE_LL` 需要在系统超时前返回，超时后 Windows 可能静默移除钩子。Raw Input 适合本项目的被动监听。启用后按下目标按钮时读取修饰键状态，松开后派发动作。支持中键、Mouse4、Mouse5 及修饰键组合。中键可选双击，使用系统双击时间与距离。相同按钮及修饰键只能绑定一种手势，长按没有独立动作。 [Windows 低级鼠标钩子](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelmouseproc)
- 鼠标监听只在有启用的鼠标绑定时注册，系统点击仍会送达原应用。裸中键录制需要确认此行为。浏览器新标签、自动滚动和侧键导航可能与 Arasn 动作同时发生。鼠标录制在设置的录制区域内完成。
- Raw Input 每个进程只有一个鼠标注册目标。如果已有其他使用者，Arasn 会报告失败并保留键盘。最后一条鼠标绑定禁用或删除、恢复默认及退出时会移除监听。实现不轮询鼠标位置，不监听全局键盘内容，也不保留输入记录。

Windows API 参考 [RegisterHotKey](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerhotkey) · [Raw Input](https://learn.microsoft.com/en-us/windows/win32/inputdev/about-raw-input) · [RegisterRawInputDevices](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-registerrawinputdevices)

## 验收与复测

构建后在 Windows 运行 `node tests/trigger-desktop.cjs --mouse`。测试使用独立 WinForms 前台窗口及临时数据目录。键盘批次可省略 `--mouse`。原有窗口、草稿与微软拼音回归使用 `node tests/xigra-p0c.cjs --windows-input`。

已通过构建、23 项 Node 测试、双客户端浏览器回归和打包版设置回归。Windows 实测覆盖两个组合键指向同一动作、五种动作、冲突后保留旧键、已绑定键录制保护、重启与恢复默认。鼠标实测覆盖 Ctrl + 中键、两枚侧键、双击、原窗口收到中键按下和松开、原生焦点、20 次监听启停及重启恢复。设置界面在 390 px 内容宽度下可滚动和关闭。输入由 Windows API 发出，物理鼠标和长时负载另行验收。

物理环境待测：

1. 在浏览器链接、空白区和文件管理器分别验证裸中键、Ctrl + 中键、侧键及双击。核对原应用点击行为、Arasn 的前台焦点与关闭后窗口位置。
2. 用 100% 与 150%／200% 的双屏，在副屏移动窗口、切换前台应用、最小化和拔屏后呼出。检查内容、选区及任务栏可用区。
3. 用物理鼠标、驱动重映射侧键及远程桌面验证不同输入来源。用其他中文输入法和非美式布局复核录制及候选期间切换。
4. 启用鼠标绑定后连续工作数小时，观察后台 CPU、内存及设备重插。禁用最后一项后确认原应用中键功能和 Arasn 键盘入口正常。

后续可优先评估按前台应用限制触发范围，便于针对浏览器、文件管理器和绘图软件设置例外。
