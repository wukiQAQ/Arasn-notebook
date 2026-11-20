const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arasn-desktop-"));
  const shortcut = "Control+Alt+F20";
  fs.writeFileSync(path.join(directory, "settings.json"), JSON.stringify({ shortcut }));
  const env = { ...process.env, ARASN_DATA_DIR: directory, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  let application;
  const launch = () =>
    electron.launch({
      ...(process.argv.includes("--packaged")
        ? {
            executablePath: path.resolve(
              __dirname,
              "../release/ArasnNotebook-win32-x64/ArasnNotebook.exe",
            ),
            args: [],
          }
        : { args: ["."] }),
      cwd: path.resolve(__dirname, ".."),
      env,
    });
  try {
    application = await launch();
    let page = await application.firstWindow();
    await expect(page.getByRole("region", { name: "便签工作区" })).toBeVisible();
    await page
      .getByRole("textbox", { name: "便笺文字" })
      .fill("桌面重启恢复测试");
    await expect(page.locator(".save-state:visible")).toHaveText("已保存");
    const info = await page.evaluate(() => window.desktop.info());
    const native = await application.evaluate(
      ({ BrowserWindow, globalShortcut }, shortcut) => ({
        windows: BrowserWindow.getAllWindows().length,
        registered: process.platform === "win32"
          ? BrowserWindow.getAllWindows()[0].isWindowMessageHooked(0x312)
          : globalShortcut.isRegistered(shortcut),
      }),
      shortcut,
    );
    expect(native.windows).toBe(1);
    expect(native.registered).toBe(info.shortcutOk);
    expect(info.shortcutOk).toBe(true);
    const openWorkspace = async page => {
      await page.getByRole("button", { name: "我的随手页", exact: true }).click();
      await page.getByRole("button", { name: "打开 默认工作页", exact: true }).click();
    };
    await openWorkspace(page);
    const note = page.locator(".spatial-note").filter({ hasText: "桌面重启恢复测试" });
    await expect(note).toBeVisible();
    const shared = await page.evaluate(async () => {
      const catalog = await window.desktop.canvas.catalog("list");
      const entry = catalog.boards.find(x => x.type === "workspace");
      const info = await window.desktop.info();
      return window.desktop.canvas.share("start", { id: entry.id, host: info.networks[0].address, mode: "edit" });
    });
    const link = new URL(shared.link);
    const remote = link.origin;
    const headers = {
      Authorization: `Bearer ${link.hash.slice(1)}`,
      "Content-Type": "application/json",
    };
    const view = await fetch(`${remote}/api/board`, { headers }).then(r => r.json());
    expect(view.objects).toHaveLength(1);
    const item = view.objects[0];
    const response = await fetch(`${remote}/api/ops`, {
      method: "POST",
      headers,
      body: JSON.stringify({ id: item.id, opId: randomUUID(), expected: item.version, x: item.x + 100, y: item.y }),
    });
    expect(response.status).toBe(200);
    await expect(note).toHaveCSS("left", `${item.x + 100}px`);
    await page.evaluate(() => window.desktop.hide());
    await expect.poll(() => application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isVisible(),
    )).toBe(false);
    await page.evaluate(id => window.desktop.canvas.share("stop", { id }), shared.id);
    await expect(fetch(`${remote}/api/board`, { headers })).rejects.toThrow();
    await application.close();
    application = null;
    application = await launch();
    page = await application.firstWindow();
    await expect(page.getByRole("textbox", { name: "便笺文字" })).toHaveValue("桌面重启恢复测试");
    await openWorkspace(page);
    await expect(page.locator(".spatial-note")).toHaveCount(1);
    await expect(page.locator(".spatial-note")).toHaveCSS("left", `${item.x + 100}px`);
    console.log(
      JSON.stringify({
        desktopLaunch: true,
        shortcutRegistered: true,
        hideToTray: true,
        lanWriteVisible: true,
        stopSharing: true,
        restartPersistence: true,
      }),
    );
  } finally {
    if (application) await application.close();
    const target = fs.realpathSync(directory);
    if (path.dirname(target) === fs.realpathSync(os.tmpdir()) && path.basename(target).startsWith("arasn-desktop-"))
      fs.rmSync(target, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
