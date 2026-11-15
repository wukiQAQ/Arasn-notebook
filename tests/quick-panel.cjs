const { selectOption } = require("./helpers/select-option.cjs");
const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { StorageEngine } = require("../desktop/engines/storage-engine.cjs");

const root = path.resolve(__dirname, "..");
const output = process.env.ARASN_TEST_SCREENSHOTS || path.join(root, "docs/screenshots/xigra-view-switch");

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "xigra-simple-"));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({
    ...(process.env.ARASN_TEST_EXE ? { executablePath: process.env.ARASN_TEST_EXE, args: [] } : { args: ["."] }),
    cwd: root, env,
  });
  let app;
  try {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({ theme: "light", shortcut: "Control+Alt+F13" }));
    const storage = new StorageEngine(data);
    try {
      await storage.call("init");
      await storage.call("setSetting", { key: "window-bounds", value: { x: 50, y: 50, width: 400, height: 460 } });
    } finally { await storage.close(); }

    app = await launch();
    let page = await app.firstWindow();
    let win = await app.browserWindow(page);
    await win.evaluate(window => { window.show(); window.focus(); });
    const editor = () => page.locator(".quick-input");
    const workbench = () => page.getByRole("button", { name: "打开工作区", exact: true });
    const collapse = () => page.getByRole("button", { name: "切换到便签区", exact: true });
    const sizes = () => win.evaluate(window => ({ outer: window.getSize(), content: window.getContentSize() }));
    async function capture(file) {
      let png;
      await expect.poll(async () => {
        const { content } = await sizes();
        if (content.some(size => size === 0)) return false;
        png = await page.screenshot({ scale: "css", animations: "disabled" });
        return png.readUInt32BE(16) === content[0] && png.readUInt32BE(20) === content[1];
      }).toBe(true);
      await fs.writeFile(path.join(output, file), png);
    }
    const defaults = await sizes();
    assert.deepEqual(defaults.outer, [620, 700]);
    const minimumRequest = await win.evaluate(window => window.getMinimumSize());
    assert.deepEqual(minimumRequest, [500, 540]);
    await expect(page.locator(".quick-header h1")).toHaveText("速记");
    await expect(page.locator(".quick-header .xigra-brand")).toHaveCount(0);
    await expect(editor()).toBeFocused();
    await expect(page.locator(".xigra-save-state")).toHaveText("等待输入");
    await expect(page.getByRole("tablist")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "设置与快捷键" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "添加文件", exact: true })).toBeVisible();
    await capture("quick-light.png");

    const first = "先记下临时想到的一句话。";
    const second = "评审后整理文件，更新交接记录。\n明早核对交付清单。";
    await editor().fill(first);
    await expect(page.locator(".xigra-save-state")).toHaveText("已保存");
    await page.getByRole("button", { name: "新建便笺", exact: true }).click();
    await expect(editor()).toBeFocused();
    await expect(editor()).toHaveValue("");
    await editor().fill(second);
    await expect(page.locator(".xigra-save-state")).toHaveText("已保存");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => {
      window.viewEntries = [];
      document.addEventListener("animationstart", (event) => {
        if (event.animationName === "xigra-view-enter") window.viewEntries.push(event.target.tagName);
      });
    });
    await workbench().click();
    await expect.poll(() => page.evaluate(() => window.viewEntries)).toContain("MAIN");
    await expect(page.locator(".xigra-workbench-title")).toHaveText("速记");
    await expect(page.locator(".topbar")).not.toContainText(/我的(办公|随手)页/);
    await page.getByRole("button", { name: "我的随手页", exact: true }).click();
    await page.getByRole("button", { name: "工具属性", exact: true }).click();
    await expect(page.locator(".free-properties")).toBeVisible();
    await page.getByRole("button", { name: "关闭工具属性", exact: true }).click();
    await expect(page.locator(".sidebar").getByRole("button", { name: "设备互传", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "文件", exact: true })).toBeVisible();
    await expect(page.locator("textarea").filter({ hasText: first })).toHaveCount(1);
    await capture("workbench-light.png");
    await page.locator(".sidebar").getByRole("button", { name: "设置与快捷键" }).click();
    await selectOption(page, "外观主题", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "设置", exact: true })).toBeHidden();
    await collapse().click();
    await expect(editor()).toHaveValue(second);
    await expect.poll(() => page.evaluate(() => window.viewEntries)).toContain("SECTION");
    assert.deepEqual((await sizes()).outer, [620, 700]);

    await workbench().click();
    await page.getByRole("button", { name: "我的随手页", exact: true }).click();
    await page.locator("textarea").filter({ hasText: first }).focus();
    await collapse().press("Enter");
    await expect(editor()).toBeFocused();
    await expect(editor()).toHaveValue(first);
    await workbench().click();
    await page.getByRole("button", { name: "我的随手页", exact: true }).click();
    await page.locator("textarea").filter({ hasText: second }).focus();
    await collapse().click();
    await expect(editor()).toHaveValue(second);

    await win.evaluate((window, size) => window.setSize(...size), minimumRequest);
    const minimum = await sizes();
    await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, minimum.content);
    // Windows can round the physical minimum slightly above Electron's DIP request.
    assert.ok(minimum.outer.every((size, i) => size >= minimumRequest[i] && size <= minimumRequest[i] + 2), JSON.stringify(minimum));
    const layout = await page.evaluate(() => ({
      noOverflow: document.documentElement.scrollWidth <= innerWidth,
      noteHeight: document.querySelector(".quick-input").getBoundingClientRect().height,
      footerFits: document.querySelector(".quick-footer").getBoundingClientRect().bottom <= innerHeight,
    }));
    assert.ok(layout.noOverflow && layout.footerFits && layout.noteHeight >= 250, JSON.stringify(layout));
    await page.locator(".toast").waitFor({ state: "hidden" });
    await capture("quick-dark-min.png");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("combobox", { name: "搜索命令", exact: true })).toBeVisible();
    await expect(page.locator(".app-shell > main")).toHaveCSS("animation-name", "none");
    await page.keyboard.press("Escape");
    await expect(collapse()).toBeVisible();
    await collapse().click();
    await expect(page.locator(".xigra-shell")).toHaveCSS("animation-name", "none");
    assert.deepEqual((await sizes()).outer, minimum.outer);
    await app.close();

    app = await launch();
    page = await app.firstWindow();
    win = await app.browserWindow(page);
    assert.deepEqual((await sizes()).outer, minimum.outer);
    await expect(editor()).toHaveValue("");
    await page.getByRole("region", { name: "最近便笺", exact: true }).getByRole("button", { name: "评审后整理文件，更新交接记录。", exact: true }).click();
    await expect(editor()).toHaveValue(second);
    await fs.writeFile(path.join(output, "checks.json"), JSON.stringify({ defaults, minimum, layout, selectedNoteFollowsSwitch: true, oldBoundsMigrated: true, resizeAndNoteSurvivedRestart: true }, null, 2));
    console.log("PASS: both view transitions, reduced motion, keyboard switching, note, focus and window size");
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith("xigra-simple-")) {
      await fs.rm(target, { recursive: true, force: true });
    }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
