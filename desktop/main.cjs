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
    !/^(Control\+Alt|Control\+Shift|Alt\+Shift)\+[A-Z]$/.test(value)
  )
    throw new Error("请使用 Ctrl+Alt、Ctrl+Shift 或 Alt+Shift 加一个英文字母");
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
          shortcut =
            JSON.parse(fs.readFileSync(configFile, "utf8")).shortcut ||
            shortcut;
        } catch {
          /* Keep default when only preferences are invalid. */
        }
      }
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
        show: !process.env.ARASN_SMOKE,
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
        fs.writeFileSync(configFile, JSON.stringify({ shortcut }));
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
