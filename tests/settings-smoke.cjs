const { selectOption } = require("./helpers/select-option.cjs");
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
      ...(process.argv.includes("--source") ? { args: ["."], cwd: path.resolve(__dirname, "..") } : { executablePath:
        process.env.ARASN_TEST_EXE ||
        path.resolve(
          __dirname,
        `../release/ArasnNotebook-${require('../package.json').version}-win32-x64/ArasnNotebook.exe`,
        ),
      args: [] }),
      env,
    });
  let application;
  try {
    application = await launch();
    let page = await application.firstWindow();
    await (await application.browserWindow(page)).evaluate(window => { window.show(); window.focus(); });
    // Verify the OS adapter without changing this computer's real startup registry.
    await application.evaluate(({ app }) => {
      globalThis.loginMock = { openAtLogin: false };
      app.getLoginItemSettings = () => globalThis.loginMock;
      app.setLoginItemSettings = (value) => {
        globalThis.loginMock = value;
      };
    });
    await page.getByRole("button", { name: "打开工作区", exact: true }).click();
    await page.locator(".sidebar").getByRole("button", { name: "设置与快捷键" }).click();
    await selectOption(page, "外观主题", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByLabel("便签始终置顶", { exact: true })).toHaveCount(0);
    const toggleGroup = () => page.getByRole("region", { name: "显示或隐藏主面板" });
    const record = async (key) => {
      await toggleGroup().getByRole("button", { name: "修改", exact: true }).click();
      const capture = page.getByRole("group", { name: "正在录制快捷键" });
      await expect(capture).toBeFocused();
      await capture.press(key);
    };
    const save = () => page.getByRole("button", { name: "确认保存", exact: true }).click();
    await record("Control+Alt+F8");
    await save();
    await expect.poll(() => page.evaluate(async () => {
      const { shortcut, shortcutOk } = await window.desktop.info();
      return shortcutOk ? shortcut : "";
    })).toBe("Control+Alt+F8");
    if (process.platform === "win32")
      expect(await application.evaluate(({ globalShortcut }) =>
        globalShortcut.register("Control+Alt+F8", () => {}),
      )).toBe(false);
    await application.evaluate(({ globalShortcut }) =>
      globalShortcut.register("Control+Alt+F9", () => {}),
    );
    await record("Control+Alt+F9");
    await expect(page.getByText(/快捷键已被占用/)).toBeVisible();
    await expect(page.getByRole("button", { name: "确认保存", exact: true })).toBeDisabled();
    await page.getByRole("group", { name: "正在录制快捷键" }).press("Escape");
    expect((await page.evaluate(() => window.desktop.info())).shortcut).toBe(
      "Control+Alt+F8",
    );
    await expect(
      page.evaluate(() => window.desktop.settings({ theme: "invalid" })),
    ).rejects.toThrow();
    for (const [shortcut, key] of [
      ["F8", "F8"],
      ["Shift+F8", "Shift+F8"],
      ["Shift+Super+F8", "Shift+Meta+F8"],
    ]) {
      await record(key);
      await save();
      await expect
        .poll(() =>
          page.evaluate(() => window.desktop.info().then((i) => i.shortcut)),
        )
        .toBe(shortcut);
    }
    await page.evaluate(() =>
      window.desktop.settings({ shortcut: "Control+Alt+F8" }),
    );
    if (process.argv.includes("--source")) {
      await expect(page.getByLabel("开机自启动", { exact: true })).toBeDisabled();
    } else {
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
    }
    await page.getByLabel("开机启动时隐藏到托盘", { exact: true }).uncheck();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.desktop.info().then((i) => i.startMinimized),
        ),
      )
      .toBe(false);
    await page.screenshot({ path: path.join(process.env.ARASN_TEST_SCREENSHOTS || "docs/screenshots", "settings-dark.png") });
    await application.close();
    application = null;
    application = await launch();
    page = await application.firstWindow();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    const restored = await page.evaluate(() => window.desktop.info());
    expect(restored.shortcut).toBe("Control+Alt+F8");
    expect(restored.alwaysOnTop).toBe(false);
    expect(restored.startMinimized).toBe(false);
    await page.getByRole("button", { name: "打开工作区", exact: true }).click();
    await page.locator(".sidebar").getByRole("button", { name: "设置与快捷键" }).click();
    await selectOption(page, "外观主题", "system");
    await expect
      .poll(() =>
        application.evaluate(({ nativeTheme }) => nativeTheme.themeSource),
      )
      .toBe("system");
    await selectOption(page, "外观主题", "light");
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
