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
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { createStore, startServer } = require("./server.cjs");

if (process.env.ARASN_DATA_DIR)
  app.setPath("userData", path.resolve(process.env.ARASN_DATA_DIR));
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
let window,
  tray,
  local,
  shared,
  store,
  exiting = false;
let shortcut = "Control+Alt+N",
  shortcutOk = false,
  links = [];
const token = crypto.randomBytes(24).toString("hex");
const staticDir = path.join(__dirname, "../dist");
let preferences = { theme: "system", alwaysOnTop: false, startMinimized: true };
const loginOptions = () => ({ path: process.execPath, args: ["--autostart"] });

function show() {
  const { workArea } = screen.getDisplayNearestPoint(
    screen.getCursorScreenPoint(),
  );
  const bounds = window.getBounds();
  window.setBounds({
    width: Math.min(bounds.width, workArea.width),
    height: Math.min(bounds.height, workArea.height),
    x: Math.round(
      workArea.x + Math.max(0, (workArea.width - bounds.width) / 2),
    ),
    y: Math.round(
      workArea.y + Math.max(0, (workArea.height - bounds.height) / 2),
    ),
  });
  window.show();
  window.focus();
}
function registerShortcut(value) {
  if (
    typeof value !== "string" ||
    !/^(?:(?:Control|Alt|Shift|Super)\+)+(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Enter|Home|End|PageUp|PageDown|Up|Down|Left|Right)$/.test(
      value,
    ) ||
    !/(Control|Alt|Super)\+/.test(value)
  )
    throw new Error("请使用 Ctrl、Alt 或 Win 搭配字母、数字、方向键或功能键");
  if (value === shortcut && shortcutOk) return;
  if (
    !globalShortcut.register(value, () =>
      window.isVisible() && window.isFocused() ? window.hide() : show(),
    )
  )
    throw new Error("快捷键已被占用，请换一个组合");
  if (value !== shortcut) globalShortcut.unregister(shortcut);
  shortcut = value;
  shortcutOk = true;
}
const info = () => ({
  shortcut,
  shortcutOk,
  sharing: !!shared,
  links,
  dataPath: app.getPath("userData"),
  ...preferences,
  openAtLogin:
    app.isPackaged && app.getLoginItemSettings(loginOptions()).openAtLogin,
  autoStartSupported: app.isPackaged && process.platform === "win32",
});

app.on("second-instance", () => window && show());
app.on("before-quit", () => {
  exiting = true;
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  local?.server.close();
  shared?.server.close();
});

if (lock)
  app
    .whenReady()
    .then(async () => {
      const configFile = path.join(app.getPath("userData"), "settings.json");
      if (fs.existsSync(configFile)) {
        try {
          const saved = JSON.parse(fs.readFileSync(configFile, "utf8"));
          shortcut = saved.shortcut || shortcut;
          if (["system", "light", "dark"].includes(saved.theme))
            preferences.theme = saved.theme;
          for (const key of ["alwaysOnTop", "startMinimized"])
            if (typeof saved[key] === "boolean") preferences[key] = saved[key];
        } catch {
          /* Keep default when only preferences are invalid. */
        }
      }
      nativeTheme.themeSource = preferences.theme;
      store = createStore(path.join(app.getPath("userData"), "board.json"));
      local = await startServer({ store, token, staticDir });
      const origin = `http://127.0.0.1:${local.port}`;
      // Pending edits also have a main-process recovery file because the HTTP origin changes on restart.
      const session =
        require("electron").session.fromPartition("persist:arasn");
      session.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      window = new BrowserWindow({
        width: 1160,
        height: 820,
        minWidth: 720,
        minHeight: 520,
        title: "Arasn · 办公随手页",
        backgroundColor: "#f5f7fa",
        autoHideMenuBar: true,
        show:
          !process.env.ARASN_SMOKE &&
          !(process.argv.includes("--autostart") && preferences.startMinimized),
        alwaysOnTop: preferences.alwaysOnTop,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          session,
        },
      });
      window.on("close", (event) => {
        if (!exiting) {
          event.preventDefault();
          window.hide();
        }
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event, url) => {
        if (new URL(url).origin !== origin) event.preventDefault();
      });
      const pixels = Buffer.alloc(32 * 32 * 4);
      for (let y = 0; y < 32; y++)
        for (let x = 0; x < 32; x++) {
          const offset = (y * 32 + x) * 4;
          const mark =
            y > 6 &&
            y < 26 &&
            (Math.abs(x - (16 - (y - 7) * 0.45)) < 2 ||
              Math.abs(x - (16 + (y - 7) * 0.45)) < 2 ||
              (y > 18 && y < 22 && x > 10 && x < 22));
          pixels.set(mark ? [255, 255, 255, 255] : [107, 121, 57, 255], offset);
        }
      tray = new Tray(
        nativeImage.createFromBitmap(pixels, { width: 32, height: 32 }),
      );
      tray.setToolTip("Arasn · 办公随手页");
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: "打开随手页", click: show },
          { type: "separator" },
          { label: "退出 Arasn", click: () => app.quit() },
        ]),
      );
      tray.on("click", show);
      try {
        registerShortcut(shortcut);
      } catch {
        shortcutOk = false;
      }
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
      const recoveryFile = path.join(app.getPath("userData"), "recovery.json");
      secureHandle("app:recovery", () =>
        fs.existsSync(recoveryFile)
          ? JSON.parse(fs.readFileSync(recoveryFile, "utf8"))
          : null,
      );
      secureHandle("app:saveRecovery", (value) => {
        if (
          typeof value !== "string" ||
          Buffer.byteLength(value) > 24 * 1024 * 1024
        )
          throw new Error("恢复副本超出限制");
        const data = JSON.parse(value);
        if (
          data.roomId !== store.snapshot().roomId ||
          !Array.isArray(data.pending) ||
          !Array.isArray(data.conflicts)
        )
          throw new Error("恢复副本无效");
        fs.writeFileSync(`${recoveryFile}.tmp`, value, {
          encoding: "utf8",
          mode: 0o600,
        });
        fs.renameSync(`${recoveryFile}.tmp`, recoveryFile);
      });
      secureHandle("app:hide", () => window.hide());
      secureHandle("app:shortcut", (value) => {
        registerShortcut(value);
        fs.writeFileSync(
          configFile,
          JSON.stringify({ shortcut, ...preferences }),
        );
        return info();
      });
      secureHandle("app:settings", (patch) => {
        if (!patch || typeof patch !== "object" || Array.isArray(patch))
          throw new Error("设置无效");
        const allowed = [
          "shortcut",
          "theme",
          "alwaysOnTop",
          "startMinimized",
          "openAtLogin",
        ];
        if (Object.keys(patch).some((key) => !allowed.includes(key)))
          throw new Error("未知设置");
        if (
          patch.theme !== undefined &&
          !["system", "light", "dark"].includes(patch.theme)
        )
          throw new Error("主题无效");
        for (const key of ["alwaysOnTop", "startMinimized", "openAtLogin"])
          if (patch[key] !== undefined && typeof patch[key] !== "boolean")
            throw new Error("设置值无效");
        if (patch.openAtLogin !== undefined && !info().autoStartSupported)
          throw new Error("请在打包后的 Windows 程序中设置开机自启动");
        const previous = { ...preferences },
          previousShortcut = shortcut;
        const previousLogin = info().openAtLogin;
        try {
          if (patch.shortcut !== undefined) registerShortcut(patch.shortcut);
          if (patch.openAtLogin !== undefined)
            app.setLoginItemSettings({
              ...loginOptions(),
              openAtLogin: patch.openAtLogin,
            });
          for (const key of ["theme", "alwaysOnTop", "startMinimized"])
            if (patch[key] !== undefined) preferences[key] = patch[key];
          fs.writeFileSync(
            `${configFile}.tmp`,
            JSON.stringify({ shortcut, ...preferences }),
          );
          fs.renameSync(`${configFile}.tmp`, configFile);
        } catch (error) {
          preferences = previous;
          if (shortcut !== previousShortcut) registerShortcut(previousShortcut);
          if (patch.openAtLogin !== undefined)
            app.setLoginItemSettings({
              ...loginOptions(),
              openAtLogin: previousLogin,
            });
          throw error;
        }
        nativeTheme.themeSource = preferences.theme;
        window.setAlwaysOnTop(preferences.alwaysOnTop);
        return info();
      });
      let shareTask = Promise.resolve();
      secureHandle("app:share", (enabled) => {
        if (typeof enabled !== "boolean") throw new Error("参数无效");
        shareTask = shareTask
          .catch(() => {})
          .then(async () => {
            if (enabled && !shared) {
              const shareToken = crypto.randomBytes(24).toString("hex");
              shared = await startServer({
                store,
                token: shareToken,
                staticDir,
                host: "0.0.0.0",
              });
              links = Object.values(os.networkInterfaces())
                .flat()
                .filter((n) => n && n.family === "IPv4" && !n.internal)
                .map(
                  (n) => `http://${n.address}:${shared.port}/#${shareToken}`,
                );
            } else if (!enabled && shared) {
              await shared.close();
              shared = null;
              links = [];
            }
            return info();
          });
        return shareTask;
      });
      await window.loadURL(`${origin}/#${token}`);
    })
    .catch((error) => {
      dialog.showErrorBox("Arasn 无法启动", error.message);
      app.quit();
    });
