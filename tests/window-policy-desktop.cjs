const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-window-policy-"));
  const data = path.join(root, "data");
  await fs.mkdir(data);
  await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({
    alwaysOnTop: true, shortcut: "Control+Alt+F23",
  }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const launch = () => electron.launch({ args: ["."], cwd: path.resolve(__dirname, ".."), env });
  const nativeState = () => app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { top: w.isAlwaysOnTop(), visible: w.isVisible(), focused: w.isFocused() };
  });
  const exit = async () => {
    const exited = new Promise(resolve => app.process().once("exit", resolve));
    await app.evaluate(({ app }) => app.exit(0));
    await exited;
    app = null;
  };
  try {
    app = await launch();
    page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.desktop));
    await expect.poll(() => page.evaluate(() => window.desktop.info().then(info => info.alwaysOnTop))).toBe(false);
    expect((await nativeState()).top).toBe(false);
    await page.evaluate(() => window.desktop.layout(true));
    expect((await nativeState()).top).toBe(false);
    await expect(page.evaluate(() => window.desktop.settings({ alwaysOnTop: true }))).rejects.toThrow('未知设置');
    expect((await nativeState()).top).toBe(false);
    await app.evaluate(({ BrowserWindow, app }) => {
      BrowserWindow.getAllWindows()[0].hide();
      app.emit("second-instance");
    });
    await expect.poll(async () => (await nativeState()).visible).toBe(true);
    await expect.poll(async () => (await nativeState()).focused).toBe(true);
    expect((await nativeState()).top).toBe(false);
    await page.evaluate(() => window.desktop.layout(false));
    expect((await nativeState()).top).toBe(false);
    await page.evaluate(async () => {
      await window.desktop.layout(true);
      await window.desktop.layout(false);
    });
    expect((await nativeState()).top).toBe(false);

    const roomId = await page.evaluate(async () => {
      const response = await fetch("/api/board", { headers: { Authorization: `Bearer ${location.hash.slice(1) || sessionStorage.getItem("arasn-token")}` } });
      if (!response.ok) throw new Error(`Board request failed: ${response.status}`);
      return (await response.json()).roomId;
    });
    const options = { roomId, grid: false, snap: true, minimap: false, wheel: "pan" };
    expect((await page.evaluate(value => window.desktop.settings({ canvasOptions: value }), options)).canvasOptions).toEqual(options);
    for (const invalid of [{ ...options, grid: "yes" }, { ...options, roomId: "other" },
      { ...options, wheel: "invalid" }, { ...options, extra: true }, { roomId }]) {
      expect(await page.evaluate(async value => {
        try { await window.desktop.settings({ canvasOptions: value }); return false; }
        catch { return true; }
      }, invalid)).toBe(true);
    }

    // Exercise the same policy with native Electron windows while another window owns focus.
    const passive = await app.evaluate(async ({ BrowserWindow, screen }, managerPath) => {
      const { WindowManager } = process.mainModule.require(managerPath);
      const target = new BrowserWindow({ show: false });
      const foreground = new BrowserWindow({ show: true });
      foreground.focus();
      const manager = new WindowManager(target, { call: async () => undefined }, screen);
      await manager.restore();
      let focusEvents = 0;
      target.on("focus", () => focusEvents++);
      manager.reveal({ focus: false });
      await new Promise(resolve => setTimeout(resolve, 150));
      const visible = target.isVisible(), focused = target.isFocused();
      target.minimize();
      foreground.focus();
      await new Promise(resolve => setTimeout(resolve, 100));
      focusEvents = 0;
      manager.reveal({ focus: false });
      await new Promise(resolve => setTimeout(resolve, 150));
      const passiveMinimized = { minimized: target.isMinimized(), focused: target.isFocused(), focusEvents };
      manager.setLayout(true);
      const workbenchTop = target.isAlwaysOnTop();
      manager.setLayout(false);
      const quickTop = target.isAlwaysOnTop();
      target.hide();
      foreground.focus();
      manager.reveal({ focus: false });
      await new Promise(resolve => setTimeout(resolve, 100));
      const passiveFocus = target.isFocused();
      target.destroy();
      foreground.destroy();
      return { visible, focused, focusEvents, passiveMinimized, workbenchTop, quickTop, passiveFocus };
    }, path.resolve(__dirname, "../desktop/engines/window-manager.cjs"));
    expect(passive).toEqual({ visible: true, focused: false, focusEvents: 0,
      passiveMinimized: { minimized: false, focused: false, focusEvents: 0 }, workbenchTop: false, quickTop: false, passiveFocus: false });
    await exit();
    app = await launch();
    page = await app.firstWindow();
    await page.waitForFunction(() => Boolean(window.desktop));
    const restored = await page.evaluate(() => window.desktop.info());
    expect(restored.alwaysOnTop).toBe(false);
    expect(restored.canvasOptions).toEqual(options);
    await page.evaluate(() => window.desktop.layout(false));
    expect((await nativeState()).top).toBe(false);
    await page.evaluate(() => window.desktop.layout(true));
    expect((await nativeState()).top).toBe(false);
    await exit();
    console.log("PASS normal native window levels, legacy settings, focused and passive reveal, canvas options and restart");
  } finally {
    if (app) await app.close().catch(() => {});
    const cleanupTarget=await fs.realpath(root);
    if(path.dirname(cleanupTarget)!==await fs.realpath(os.tmpdir()))throw new Error("Unexpected window test cleanup path");
    await fs.rm(cleanupTarget, { recursive: true, force: true, maxRetries:20, retryDelay:100 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
