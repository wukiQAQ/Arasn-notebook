const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arasn-desktop-"));
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
    await page.getByRole("button", { name: "展开完整页面" }).click();
    await page.getByRole("button", { name: "写一张便笺" }).click();
    await page
      .getByRole("textbox", { name: "便笺文字" })
      .fill("桌面重启恢复测试");
    await expect(page.locator(".save-state")).toHaveText("已保存");
    const info = await page.evaluate(() => window.desktop.info());
    const native = await application.evaluate(
      ({ BrowserWindow, globalShortcut }) => ({
        windows: BrowserWindow.getAllWindows().length,
        registered: globalShortcut.isRegistered("Control+Alt+N"),
      }),
    );
    expect(native.windows).toBe(1);
    expect(native.registered).toBe(info.shortcutOk);
    expect(info.shortcutOk).toBe(true);
    const shared = await page.evaluate(() => window.desktop.share(true));
    expect(shared.sharing).toBe(true);
    expect(shared.links.length).toBeGreaterThan(0);
    const link = new URL(shared.links[0]);
    const remote = `http://127.0.0.1:${link.port}`;
    const headers = {
      Authorization: `Bearer ${link.hash.slice(1)}`,
      "Content-Type": "application/json",
    };
    const response = await fetch(`${remote}/api/ops`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: randomUUID(),
        opId: randomUUID(),
        expected: 0,
        value: {
          type: "text",
          text: "来自局域网参与者",
          color: "#39796b",
          x: 460,
          y: 200,
        },
      }),
    });
    expect(response.status).toBe(200);
    await expect(page.getByRole("textbox", { name: "便笺文字" })).toHaveCount(
      2,
    );
    await page.evaluate(() => window.desktop.hide());
    expect(
      await application.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0].isVisible(),
      ),
    ).toBe(false);
    await page.evaluate(() => window.desktop.share(false));
    await expect(fetch(`${remote}/api/board`, { headers })).rejects.toThrow();
    await application.close();
    application = null;
    application = await launch();
    page = await application.firstWindow();
    await page.getByRole("button", { name: "展开完整页面" }).click();
    await expect(page.getByRole("textbox", { name: "便笺文字" })).toHaveCount(
      2,
    );
    await expect(
      page.getByRole("textbox", { name: "便笺文字" }).first(),
    ).toHaveValue("桌面重启恢复测试");
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
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
