# Arasn Design Lab

最新融合版：打开 `/studio.html`（同一布局可切换浅/深主题），评审响应见 [STUDIO-UI-2026-11-03.md](../docs/STUDIO-UI-2026-11-03.md)。本轮已启动 `http://127.0.0.1:5180/studio.html`，重启仍用下面的默认dev命令。

2026-11-03：新增 C 的三个圆润方向，打开 `/round.html`，通过顶部切换 Mellow / Cove / Afterglow。设计与验证说明见 [ROUND-DESIGN.md](./ROUND-DESIGN.md)，原 A/B/C 仍在 `/`。

第一阶段的独立 React 原型；不导入正式业务入口，不调用桌面 IPC 或后端 API。

从项目根目录运行：

```powershell
npm --prefix prototypes run dev
```

打开 http://127.0.0.1:5174 ，顶部切换 A / B / C。三个直达地址分别使用 `?direction=A`、`?direction=B`、`?direction=C`。

可操作：Ctrl/Cmd+K 搜索命令、上下键选择、Enter 执行、Escape 关闭；便签编辑、拖柄拖动、拖柄方向键移动；画笔；空格拖动平移、Ctrl/Cmd+滚轮缩放；文件选择/拖入、搜索分类和预览；模拟收起/呼出。

数据仅在当前浏览器会话中。切换方向与收起保留便签、草图和各方向视角；刷新会重置。单文件限制 20MB，浏览器读取完成才加入列表。图片使用真实图片、音频使用原生播放器、PDF 使用浏览器阅读器（依浏览器能力），Office 只展示元数据并下载原件，不解析内容。共享与设置入口提供功能边界说明；没有模拟网络成功或桌面权限。

```powershell
npm --prefix prototypes run build
# 若本机浏览器缓存不在 Playwright 默认目录，设置 PLAYWRIGHT_BROWSERS_PATH 后运行：
node prototypes/qa.cjs
```

设计说明见 [DESIGN.md](./DESIGN.md)，验证结果见 `review/checks.json`，实际截图见 `review/screenshots/`。原型复用根目录 React、Base UI、Lucide 和 TypeScript/Vite；首次设置须先安装根目录依赖，再在本目录 `npm ci`。Motion 14.9.0 仅在此原型中，MIT 许可证，声明兼容 React 18/19；不增加重复动效库。
