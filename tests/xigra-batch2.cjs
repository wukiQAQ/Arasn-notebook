const { selectOption } = require("./helpers/select-option.cjs");
const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "docs/screenshots/xigra-batch2");

async function review() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "xigra-batch2-"));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({ theme: "light", shortcut: "Control+Alt+F13" }));
    app = await electron.launch({ args: ["."], cwd: root, env, timeout: 20000 });
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const show = () => win.evaluate(window => {
      window.show();
      window.focus();
      window.webContents.send("app:focus");
    });
    const visible = () => win.evaluate(window => window.isVisible());
    await show();
    const editor = page.getByRole("textbox", { name: "便笺文字", exact: true });
    await expect(editor).toBeFocused();
    const note = "窗口收起后，继续保留这条工作记录。";
    await editor.fill(note);
    await expect(page.locator(".quick-footer .save-state")).toHaveText("已保存");

    const bounds = () => win.evaluate(window => ({ outer: window.getSize(), content: window.getContentSize() }));
    const defaultWindow = await bounds();
    const minimum = await win.evaluate(window => {
      const size = window.getMinimumSize();
      window.setSize(...size);
      return size;
    });
    const minimumWindow = await bounds();
    assert.deepEqual(minimumWindow.outer, minimum);

    async function layoutCheck([width, height]) {
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
      const measured = await page.evaluate(() => {
        const selectors = [".quick-header", ".quick-tabs", ".quick-content", ".quick-footer"];
        return { width: document.documentElement.scrollWidth, areas: selectors.map(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 && rect.height > 0;
        }) };
      });
      assert.ok(measured.width <= width && measured.areas.every(Boolean), JSON.stringify({ width, height, measured }));
    }
    await layoutCheck(minimumWindow.content);
    const settings = page.getByRole("button", { name: "设置与快捷键", exact: true });
    const screenshots = [];
    for (const theme of ["light", "dark"]) {
      await settings.click();
      await selectOption(page, "外观主题", theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name: "设置", exact: true })).toBeHidden();
      assert.equal(await visible(), true);
      await page.locator(".toast").waitFor({ state: "hidden" });
      await editor.focus();
      for (const dimensions of [[400, 460], [480, 560]]) {
        await win.evaluate((window, size) => window.setContentSize(...size), dimensions);
        await layoutCheck(dimensions);
        const file = `${dimensions.join("x")}-${theme}.png`;
        await page.screenshot({ path: path.join(output, file), scale: "css", animations: "disabled" });
        screenshots.push(file);
      }
    }

    const commands = page.getByRole("button", { name: "搜索与快捷操作", exact: true });
    await commands.click();
    const search = page.getByRole("combobox", { name: "搜索命令", exact: true });
    await expect(search).toBeFocused();
    await page.screenshot({ path: path.join(output, "commands-dark.png"), scale: "css", animations: "disabled" });
    await search.dispatchEvent("keydown", { key: "Enter", isComposing: true });
    await expect(search).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(search).toBeHidden();
    await expect(commands).toBeFocused();
    assert.equal(await visible(), true);

    for (const open of [
      () => page.getByRole("tab", { name: "文件", exact: true }).click(),
      async () => {
        await page.getByRole("tab", { name: "打字", exact: true }).click();
        await page.keyboard.press("Control+k");
        await search.fill("文件");
        await search.press("Enter");
        await expect(page.getByRole("dialog", { name: "文件" })).toBeVisible();
      },
    ]) {
      await open();
      const clear = page.getByRole("button", { name: "清空面板", exact: true });
      await clear.click();
      const confirm = page.getByRole("alertdialog", { name: "确认操作" });
      await confirm.getByRole("button", { name: "取消", exact: true }).focus();
      await page.keyboard.press("Escape");
      await expect(confirm).toBeHidden();
      await expect(clear).toBeFocused();
      assert.equal(await visible(), true);
    }
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "文件" })).toBeHidden();
    await expect(editor).toHaveValue(note);
    await editor.dispatchEvent("keydown", { key: "Escape", isComposing: true });
    assert.equal(await visible(), true);
    await page.keyboard.press("Escape");
    await expect.poll(visible).toBe(false);
    await show();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue(note);
    await win.evaluate(window => window.close());
    await expect.poll(visible).toBe(false);
    await show();
    await page.getByRole("button", { name: "展开完整页面", exact: true }).click();
    await page.getByRole("button", { name: "收回小窗", exact: true }).click();
    await expect(editor).toHaveValue(note);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, "checks.json"), JSON.stringify({
      defaultWindow, minimumWindow, screenshots, keyboardAndWindowLifecycle: true, errors,
    }, null, 2));
    console.log(`PASS native shell, Escape priority and four sizes/themes: ${JSON.stringify({ defaultWindow, minimumWindow })}`);
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith("xigra-batch2-")) {
      await fs.rm(target, { recursive: true, force: true });
    }
  }
}

review().catch(error => { console.error(error); process.exitCode = 1; });
