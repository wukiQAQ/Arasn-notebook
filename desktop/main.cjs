const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  globalShortcut,
  ipcMain,
  screen,
  dialog,
  nativeTheme,
  clipboard,
  safeStorage,
  Notification,
} = require("electron");
const { StorageEngine } = require("./engines/storage-engine.cjs");
const { PanelEngine } = require("./engines/panel-engine.cjs");
const { WindowManager, QUICK_WINDOW } = require("./engines/window-manager.cjs");
const { installServices } = require("./engines/install-services.cjs");
const { LanNotes } = require("./engines/lan-notes.cjs");
const { listNetworks } = require("./engines/network-interfaces.cjs");
const { StartupSettings } = require("./engines/startup-settings.cjs");
const { ACTIONS, DEFAULT_KEY, defaultConfig, TriggerRegistry } = require("./engines/trigger-registry.cjs");
const { windowsEdges } = require("./engines/edge-trigger.cjs");
const { triggerFeedback } = require("./engines/trigger-feedback.cjs");
let storage;
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { validBrushPresets } = require('./engines/brush-presets.cjs');
const { startServer, validFreeViewport, validTopologyViewport } = require("./server.cjs");

// Stable across portable and installed product names; preserve the existing notebook.
app.setPath("userData", process.env.ARASN_DATA_DIR
  ? path.resolve(process.env.ARASN_DATA_DIR)
  : path.join(app.getPath("appData"), "arasn-notebook"));
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
let window,
  windowManager,
  tray,
  local,
  shared,
  lanNotes,
  lanNotification,
  store,
  exiting = false;
let triggers, edgeFeedback, links = [], shareHost = null;
const token = crypto.randomBytes(24).toString("hex");
const staticDir = path.join(__dirname, "../dist");
const appIcon = path.join(staticDir, "arasn-icon.png");
let expanded = false;
let readyToReveal = false;
let revealRequested = false;
let windowIntent;
let nextWindowIntent = 0;
const validCanvasOptions = value => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).length === 5 &&
  Object.keys(value).every(key => ["roomId", "grid", "snap", "minimap", "wheel"].includes(key)) &&
  typeof value.roomId === "string" && value.roomId.length > 0 &&
  ["grid", "snap", "minimap"].every(key => typeof value[key] === "boolean") &&
  ["auto", "zoom", "pan"].includes(value.wheel);
function setLayout(value) {
  if (typeof value !== "boolean") throw new Error("布局参数无效");
  windowManager.setLayout(value);
  expanded = value;
  window.webContents.send("app:layout", expanded);
  return info();
}
let preferences = {
  theme: "system",
  alwaysOnTop: true,
  startMinimized: true,
  startHidden: false,
};
const startup = new StartupSettings(app);

function show() {
  revealWindow(true);
}
function revealWindow(focus) {
  if (exiting || window?.isDestroyed() || windowIntent?.action === "quit") return;
  if (!readyToReveal) {
    revealRequested = true;
    return;
  }
  if (windowIntent?.action === "hide") {
    clearTimeout(windowIntent.timeout);
    windowIntent = undefined;
  }
  windowManager.reveal({ focus });
  if (focus) {
    window.focus();
    window.webContents.send("app:focus");
  }
}
function requestWindowIntent(action) {
  if (windowIntent || exiting || window.webContents.isDestroyed()) return;
  const id = ++nextWindowIntent;
  const timeout = setTimeout(() => { windowIntent = undefined; }, 2500);
  windowIntent = { id, action, timeout };
  window.webContents.send("app:windowIntent", id, action);
}
function dispatchTrigger(action, region) {
  if (!readyToReveal || windowIntent || exiting || window.isDestroyed() || window.webContents.isDestroyed()) return;
  if (action === "toggle" && !window.isMinimized() && window.isVisible()) {
    requestWindowIntent("hide");
    return;
  }
  const arriving = region && triggers.config.feedback !== false && (!window.isVisible() || window.isMinimized());
  revealWindow(!region);
  if (arriving) window.webContents.send("app:trigger-arrival", region);
  if (action !== "toggle") window.webContents.send("app:trigger-action", action);
}
const legacyShortcut = () => triggers?.config.bindings.find(binding =>
  binding.enabled && binding.action === "toggle" && binding.input.device === "keyboard")?.input.accelerator;
const info = () => {
  const networks = listNetworks();
  const shareAddressAvailable = !shared || networks.some(entry => entry.address === shareHost);
  return ({
  expanded,
  shortcut: legacyShortcut() ?? DEFAULT_KEY,
  shortcutOk: Object.keys(triggers?.failures ?? {}).length === 0,
  triggers: triggers?.config ?? defaultConfig(),
  triggerActions: ACTIONS,
  triggerFailures: triggers?.failures ?? {},
  triggerWarning: triggers?.warning,
  mouseTriggersSupported: Boolean(triggers?.mouse),
  edgeTriggersSupported: Boolean(triggers?.mouse?.supportsEdges),
  sharing: !!shared,
  links: shareAddressAvailable ? links : [],
  networks,
  shareHost,
  shareAddressAvailable,
  dataPath: app.getPath("userData"),
  ...preferences,
  ...startup.view(),
});
};

app.on("second-instance", show);
app.on("before-quit", (event) => {
  if (exiting || !window || window.isDestroyed()) return;
  if (window.webContents.isCrashed()) {
    exiting = true;
    return;
  }
  event.preventDefault();
  requestWindowIntent("quit");
});
app.on("will-quit", () => {
  triggers?.dispose();
  edgeFeedback?.dispose();
  local?.server.close();
  shared?.server.close();
  void lanNotes?.stop().catch(() => {});
});

if (lock)
  app
    .whenReady()
    .then(async () => {
      if (process.platform === "win32") app.setAppUserModelId("com.arasn.notebook");
      let legacy, triggerConfig;
      const configFile = path.join(app.getPath("userData"), "settings.json");
      if (fs.existsSync(configFile)) {
        try {
          const saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
          legacy = saved.shortcut;
          triggerConfig = saved.triggers;
          if (["system", "light", "dark"].includes(saved.theme))
            preferences.theme = saved.theme;
          for (const key of ["alwaysOnTop", "startMinimized", "startHidden"])
            if (typeof saved[key] === "boolean") preferences[key] = saved[key];
        } catch {
          /* Keep default when only preferences are invalid. */
        }
      }
      storage = new StorageEngine(app.getPath("userData"), (progress) =>
        window?.webContents.send("files:progress", progress),
      );
      const migrated = await storage.call("init");
      if (migrated.settings) {
        legacy = migrated.settings.shortcut ?? legacy;
        triggerConfig = migrated.settings.triggers ?? triggerConfig;
        if (validFreeViewport(migrated.settings.freeViewport))
          preferences.freeViewport = migrated.settings.freeViewport;
        if (validTopologyViewport(migrated.settings.topologyViewport))
          preferences.topologyViewport = migrated.settings.topologyViewport;
        if (validBrushPresets(migrated.settings.brushPresets)) preferences.brushPresets = migrated.settings.brushPresets;
        if (validCanvasOptions(migrated.settings.canvasOptions))
          preferences.canvasOptions = migrated.settings.canvasOptions;
        for (const key of [
          "theme",
          "alwaysOnTop",
          "startMinimized",
          "startHidden",
        ])
          if (migrated.settings[key] !== undefined)
            preferences[key] = migrated.settings[key];
      }
      nativeTheme.themeSource = preferences.theme;
      store = await new PanelEngine(storage, () =>
        window?.webContents.send("board:changed"),
      ).init();
      local = await startServer({ store, token, staticDir });
      const origin = `http://127.0.0.1:${local.port}`;
      // Pending edits also have a main-process recovery file because the HTTP origin changes on restart.
      const session =
        require("electron").session.fromPartition("persist:arasn");
      session.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      const showOnStartup = !process.env.ARASN_SMOKE && !preferences.startHidden &&
        !(process.argv.includes("--autostart") && preferences.startMinimized);
      window = new BrowserWindow({
        ...QUICK_WINDOW,
        title: "Arasn",
        icon: appIcon,
        backgroundColor: nativeTheme.shouldUseDarkColors ? "#1b1e24" : "#f3f4f6",
        autoHideMenuBar: true,
        show: false,
        alwaysOnTop: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          session,
        },
      });
      windowManager = new WindowManager(window, storage, screen, preferences.alwaysOnTop);
      const updateBackground = () => {
        if (!window.isDestroyed()) window.setBackgroundColor(nativeTheme.shouldUseDarkColors ? "#1b1e24" : "#f3f4f6");
      };
      nativeTheme.on("updated", updateBackground);
      window.on("closed", () => nativeTheme.removeListener("updated", updateBackground));
      await windowManager.restore();
      window.on("close", (event) => {
        if (!exiting) {
          event.preventDefault();
          requestWindowIntent("hide");
        }
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== origin) event.preventDefault();
      });
      tray = new Tray(nativeImage.createFromPath(appIcon).resize({ width: 32 }));
      tray.setToolTip("Arasn · 办公随手页");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "打开随手页", click: show },
          { type: "separator" },
          { label: "退出 Arasn", click: () => app.quit() },
        ]),
      );
      tray.on("click", show);
      let keyboard = globalShortcut;
      if (process.platform === "win32") {
        edgeFeedback = triggerFeedback(BrowserWindow, screen);
        try { keyboard = require("./engines/windows-shortcut.cjs").windowsShortcuts(window); }
        catch { /* Keep Electron keyboard registration available if native initialization fails. */ }
      }
      triggers = new TriggerRegistry(keyboard, dispatchTrigger, input =>
        window.webContents.send("app:trigger-captured", input), binding =>
        window.webContents.send("app:trigger-detected", binding));
      if (process.platform === "win32") {
        const suspended = () => triggers.capturing || exiting;
        let edges;
        let feedbackFailed = false;
        try { edges = windowsEdges(screen, (binding, region) => triggers.fire(binding, region), suspended,
          (hit, release) => {
            if (feedbackFailed) return;
            try {
              if (release || triggers.config.feedback === false) edgeFeedback.dispose();
              else edgeFeedback.set(hit);
            } catch (error) {
              feedbackFailed = true;
              edgeFeedback.dispose();
              console.warn("无法显示热区提示", error.message);
            }
          }); }
        catch (error) { console.warn("屏幕热区初始化失败", error.message); }
        try {
          triggers.mouse = require("./engines/windows-mouse.cjs").windowsMouse(window,
            binding => triggers.fire(binding), suspended, () => screen.getCursorScreenPoint(), edges);
        } catch (error) { console.warn("鼠标触发初始化失败", error.message); }
      }
      triggers.load(triggerConfig, legacy);
      const endCapture = () => {
        if (!triggers.capturing) return;
        triggers.setCapturing(false);
        if (!window.webContents.isDestroyed()) window.webContents.send("app:trigger-capture-ended");
      };
      window.on("blur", endCapture);
      window.on("hide", endCapture);
      window.on("minimize", endCapture);
      window.webContents.on("did-start-loading", endCapture);
      window.webContents.on("did-start-loading", () => { triggers.testing = false; });
      window.on("closed", () => triggers.dispose());
      function secureHandle(name, handler) {
        ipcMain.handle(name, (event, ...args) => {
          if (
            event.sender !== window.webContents ||
            event.senderFrame !== window.webContents.mainFrame ||
            new URL(event.senderFrame.url).origin !== origin
          )
            throw new Error("访问被拒绝");
          return handler(...args);
        });
      }
      secureHandle("app:info", info);
      // A synchronous memory-only read prevents a different theme before React/async info loads.
      ipcMain.on("app:theme", event => {
        event.returnValue = event.sender === window.webContents &&
          event.senderFrame === window.webContents.mainFrame &&
          event.senderFrame?.url.startsWith(`${origin}/`) ? preferences.theme : null;
      });
      secureHandle("app:layout", setLayout);
      let shareTask = Promise.resolve();
      const changeNetworkMode = (action) => {
        shareTask = shareTask.catch(() => {}).then(action);
        return shareTask;
      };
      installServices(secureHandle, {
        storage,
        store,
        window,
        dialog,
        clipboard,
        root: app.getPath("userData"),
        nativeImage,
        beforeRestore: () => changeNetworkMode(async () => {
          await lanNotes?.stop();
          if (shared) {
            await shared.close();
            shared = null;
            links = [];
            shareHost = null;
          }
        }),
      });
      function getLanNotes() {
        lanNotes ??= new LanNotes({
          directory: app.getPath("userData"), storage, store, safeStorage,
          network: require(path.join(staticDir, "lan-network.cjs")),
          changed: () => {
            if (window && !window.isDestroyed()) window.webContents.send("lan:changed");
          },
          onOffer: () => {
            if (window.isFocused() || !Notification.isSupported()) return;
            lanNotification?.close();
            lanNotification = new Notification({ title: "Arasn · 收到便签请求", body: "打开 Arasn 选择接收或拒绝。" });
            lanNotification.on("click", () => {
              if (window.isDestroyed()) return;
              show();
              window.webContents.send("lan:open");
            });
            lanNotification.show();
          },
        });
        return lanNotes;
      }
      secureHandle("lan:view", () => getLanNotes().view());
      secureHandle("lan:start", (host) => changeNetworkMode(() => {
        if (shared) throw new Error("请先关闭旧白板共享，再启用便签传送");
        return getLanNotes().start(host);
      }));
      secureHandle("lan:stop", () => changeNetworkMode(() => getLanNotes().stop()));
      secureHandle("lan:invite", () => getLanNotes().invite());
      secureHandle("lan:pair", (code, fingerprint) => getLanNotes().pair(code, fingerprint));
      secureHandle("lan:revoke", (fingerprint) => getLanNotes().revoke(fingerprint));
      secureHandle("lan:send", (recordId, fingerprint) => getLanNotes().send(recordId, fingerprint));
      secureHandle("lan:respond", (id, accept) => getLanNotes().respond(id, accept));
      secureHandle("lan:retry", (id) => getLanNotes().retry(id));
      secureHandle("app:hide", () => requestWindowIntent("hide"));
      secureHandle("app:confirmWindowIntent", async (id, allowed) => {
        if (!windowIntent || windowIntent.id !== id) return;
        const { action, timeout } = windowIntent;
        clearTimeout(timeout);
        windowIntent = undefined;
        if (allowed !== true) return;
        if (action === "hide") window.hide();
        else {
          exiting = true;
          await windowManager.saveQuickBounds();
          app.quit();
        }
      });
      async function applySettings(patch) {
        if (!patch || typeof patch !== "object" || Array.isArray(patch))
          throw new Error("设置无效");
        const allowed = [
          "shortcut",
          "triggers",
          "theme",
          "alwaysOnTop",
          "startMinimized",
          "startHidden",
          "openAtLogin",
          "freeViewport",
          "topologyViewport",
          "canvasOptions",
          "brushPresets",
        ];
        if (Object.keys(patch).some((key) => !allowed.includes(key)))
          throw new Error("未知设置");
        if (patch.freeViewport !== undefined &&
            (!validFreeViewport(patch.freeViewport) || patch.freeViewport.roomId !== store.snapshot().roomId))
          throw new Error("自由页视图无效或工作页已更换");
        if (patch.topologyViewport !== undefined &&
            (!validTopologyViewport(patch.topologyViewport) || patch.topologyViewport.roomId !== store.snapshot().roomId))
          throw new Error("拓扑视图无效或工作页已更换");
        if (patch.canvasOptions !== undefined &&
            (!validCanvasOptions(patch.canvasOptions) || patch.canvasOptions.roomId !== store.snapshot().roomId))
          throw new Error("画布选项无效或工作页已更换");
        if (
          patch.theme !== undefined &&
          !["system", "light", "dark"].includes(patch.theme)
        )
          throw new Error("主题无效");
        for (const key of [
          "alwaysOnTop",
          "startMinimized",
          "startHidden",
          "openAtLogin",
        ])
          if (patch[key] !== undefined && typeof patch[key] !== "boolean")
            throw new Error("设置值无效");
        if (patch.openAtLogin !== undefined && !info().autoStartSupported)
          throw new Error(info().autoStartReason);
        if (patch.shortcut !== undefined && patch.triggers !== undefined) throw new Error("触发器设置重复");
        let config = patch.triggers;
        if (patch.shortcut !== undefined) {
          const bindings = triggers.config.bindings;
          const current = bindings.find(binding => binding.id === "default-toggle");
          const [replacement] = defaultConfig(patch.shortcut).bindings;
          config = { ...triggers.config, bindings: current
            ? bindings.map(binding => binding === current ? replacement : binding)
            : [...bindings, replacement] };
        }
        const next = { ...preferences };
        if(patch.brushPresets !== undefined) {
          if(!validBrushPresets(patch.brushPresets))throw new Error('画笔方案无效');
          next.brushPresets=patch.brushPresets.map(v=>({...v}));
        }
        if (patch.freeViewport !== undefined) next.freeViewport = patch.freeViewport;
        if (patch.topologyViewport !== undefined) next.topologyViewport = patch.topologyViewport;
        if (patch.canvasOptions !== undefined) next.canvasOptions = patch.canvasOptions;
        const staged = config === undefined ? undefined : triggers.stage(config);
        let restoreLogin;
        try {
          if (patch.openAtLogin !== undefined)
            restoreLogin = startup.apply(patch.openAtLogin);
          for (const key of [
            "theme",
            "alwaysOnTop",
            "startMinimized",
            "startHidden",
          ])
            if (patch[key] !== undefined) next[key] = patch[key];
          await storage.call("setSetting", {
            key: "settings",
            value: { ...next, triggers: staged?.config ?? triggers.config },
          });
        } catch (error) {
          staged?.rollback();
          try { restoreLogin?.(); }
          catch (restoreError) { throw new Error(`${error.message}；恢复失败：${restoreError.message}`); }
          throw error;
        }
        staged?.commit();
        if (staged && triggers.config.feedback === false) edgeFeedback?.dispose();
        preferences = next;
        if (patch.theme !== undefined) nativeTheme.themeSource = preferences.theme;
        if (patch.alwaysOnTop !== undefined) windowManager.setQuickAlwaysOnTop(preferences.alwaysOnTop);
        return info();
      }
      let settingsTask = Promise.resolve();
      const withSettings = (operation) => {
        const task = settingsTask.then(operation);
        settingsTask = task.catch(() => {});
        return task;
      };
      const updateSettings = patch => withSettings(() => applySettings(patch));
      secureHandle("app:shortcut", value => updateSettings({ shortcut: value }));
      secureHandle("app:settings", updateSettings);
      secureHandle("app:trigger-probe", config => withSettings(() => {
        const staged = triggers.stage(config, { probe: true });
        staged.rollback();
        return staged.failures;
      }));
      secureHandle("app:trigger-defaults", () => updateSettings({ triggers: defaultConfig() }));
      secureHandle("app:trigger-test", active => {
        if (typeof active !== "boolean") throw new Error("测试状态无效");
        if (active && (!window.isFocused() || triggers.config.paused)) return false;
        triggers.testing = active;
        return true;
      });
      secureHandle("app:trigger-local", id => {
        if (typeof id === "string" && window.isFocused()) triggers.localGesture(id);
      });
      secureHandle("app:trigger-palette", color => edgeFeedback?.palette(color));
      secureHandle("app:trigger-capture", active => {
        if (typeof active !== "boolean") throw new Error("录制状态无效");
        if (active && (!window.isFocused() || windowIntent || exiting)) return false;
        triggers.setCapturing(active);
        return true;
      });
      secureHandle("app:share", (enabled, host) => {
        if (typeof enabled !== "boolean") throw new Error("参数无效");
        if (host !== undefined && typeof host !== "string") throw new Error("网卡参数无效");
        return changeNetworkMode(async () => {
          if (enabled && shared && host !== undefined && host !== shareHost)
            throw new Error("请先停止共享，再切换网卡");
          if (enabled && !shared) {
            if (lanNotes?.view().active) throw new Error("请先关闭便签传送，再启用旧白板共享");
            const networks = listNetworks();
            const selected = host ?? networks[0]?.address;
            if (!networks.some(entry => entry.address === selected)) throw new Error("请选择可用的私有 IPv4 网卡，刷新后重试");
            const shareToken = crypto.randomBytes(24).toString("hex");
            shared = await startServer({
              store,
              token: shareToken,
              staticDir,
              host: selected,
              legacyOnly: true,
            });
            shareHost = selected;
            links = [`http://${selected}:${shared.port}/#${shareToken}`];
          } else if (!enabled && shared) {
            await shared.close();
            shared = null;
            links = [];
            shareHost = null;
          }
          return info();
        });
      });
      await window.loadURL(`${origin}/#${token}`);
      readyToReveal = true;
      if (showOnStartup || revealRequested) show();
    })
    .catch((error) => {
      dialog.showErrorBox("Arasn 无法启动", error.message);
      exiting = true;
      app.quit();
    });
