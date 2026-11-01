const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arasn-settings-"));
  const env = { ...process.env, ARASN_DATA_DIR: directory, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      executablePath: path.resolve(
        __dirname,
        "../release/ArasnNotebook-win32-x64/ArasnNotebook.exe",
      ),
      args: [],
      env,
    });
  let application;
  try {
    application = await launch();
    let page = await application.firstWindow();
    // Verify the OS adapter without changing this computer's real startup registry.
    await application.evaluate(({ app }) => {
      globalThis.loginMock = { openAtLogin: false };
      app.getLoginItemSettings = () => globalThis.loginMock;
      app.setLoginItemSettings = (value) => {
        globalThis.loginMock = value;
      };
    });
    await page.getByRole("button", { name: "设置与快捷键" }).click();
    await page.getByLabel("外观主题").selectOption("dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.getByLabel("窗口始终置顶", { exact: true }).check();
    await expect
      .poll(() =>
        page.evaluate(() => window.desktop.info().then((i) => i.alwaysOnTop)),
      )
      .toBe(true);
    await page
      .getByLabel("录入全局快捷键")
      .dispatchEvent("keydown", {
        key: "F8",
        code: "F8",
        ctrlKey: true,
        altKey: true,
      });
    await page.getByRole("button", { name: "保存快捷键", exact: true }).click();
    await expect
      .poll(() =>
        application.evaluate(({ globalShortcut }) =>
          globalShortcut.isRegistered("Control+Alt+F8"),
        ),
      )
      .toBe(true);
    await application.evaluate(({ globalShortcut }) =>
      globalShortcut.register("Control+Alt+F9", () => {}),
    );
    await page
      .getByLabel("录入全局快捷键")
      .dispatchEvent("keydown", {
        key: "F9",
        code: "F9",
        ctrlKey: true,
        altKey: true,
      });
    await page.getByRole("button", { name: "保存快捷键", exact: true }).click();
    await expect(page.getByText(/快捷键已被占用/)).toBeVisible();
    expect((await page.evaluate(() => window.desktop.info())).shortcut).toBe(
      "Control+Alt+F8",
    );
    await expect(
      page.evaluate(() => window.desktop.settings({ theme: "invalid" })),
    ).rejects.toThrow();
    await page.getByLabel("开机自启动", { exact: true }).check();
    await expect
      .poll(() =>
        page.evaluate(() => window.desktop.info().then((i) => i.openAtLogin)),
      )
      .toBe(true);
    const login = await application.evaluate(() => globalThis.loginMock);
    expect(login.args).toEqual(["--autostart"]);
    expect(login.path).toMatch(/ArasnNotebook.exe$/);
    await page.getByLabel("开机自启动", { exact: true }).uncheck();
    await expect
      .poll(() =>
        page.evaluate(() => window.desktop.info().then((i) => i.openAtLogin)),
      )
      .toBe(false);
    await page.getByLabel("开机启动时隐藏到托盘", { exact: true }).uncheck();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.desktop.info().then((i) => i.startMinimized),
        ),
      )
      .toBe(false);
    await page.screenshot({ path: "docs/screenshots/settings-dark.png" });
    await application.close();
    application = null;
    application = await launch();
    page = await application.firstWindow();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const restored = await page.evaluate(() => window.desktop.info());
    expect(restored.shortcut).toBe("Control+Alt+F8");
    expect(restored.alwaysOnTop).toBe(true);
    expect(restored.startMinimized).toBe(false);
    await page.getByRole("button", { name: "设置与快捷键" }).click();
    await page.getByLabel("外观主题").selectOption("system");
    await expect
      .poll(() =>
        application.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
      )
      .toBe("system");
    await page.getByLabel("外观主题").selectOption("light");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    console.log(
      "PASS: custom shortcut, conflict rollback, light/dark/system theme, pin, restart persistence, mocked login adapter",
    );
  } finally {
    if (application) await application.close();
    if (path.dirname(directory) !== os.tmpdir())
      throw new Error("Unexpected test cleanup path");
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
