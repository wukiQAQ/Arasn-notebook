const { selectOption } = require("./helpers/select-option.cjs");
const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const baseline = process.argv.includes("--baseline");
const output = path.join(root, "docs/screenshots/xigra-batch1", baseline ? "before" : "after");
const sample = "把刚想到的两点写下来。\n会后核对日期，再归到项目里。";

async function review() {
  await fs.mkdir(output, { recursive: true });
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "xigra-batch1-"));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({ theme: "light", shortcut: "Control+Alt+F13" }));
    app = await electron.launch({ args: ["."], cwd: root, env, timeout: 20000 });
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    await win.evaluate(window => { window.show(); window.focus(); });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const editor = page.getByRole("textbox", { name: "便笺文字", exact: true });
    const settings = page.getByRole("button", { name: "设置与快捷键", exact: true });
    const expand = page.getByRole("button", { name: "展开完整页面", exact: true });
    const hide = page.getByRole("button", { name: "隐藏到托盘", exact: true });
    await expect(editor).toBeEnabled();
    await editor.fill(sample);
    await expect(page.locator(".quick-footer .save-state")).toHaveText("已保存");
    if (!baseline) await expect(page.locator(".quick-header")).toContainText("XIGRA");

    const screenshots = [];
    for (const theme of ["light", "dark"]) {
      await settings.click();
      await selectOption(page, "外观主题", theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await page.getByRole("button", { name: "关闭弹窗", exact: true }).click();
      await page.locator(".toast").waitFor({ state: "hidden" });
      for (const [width, height] of [[400, 460], [480, 560]]) {
        await win.evaluate((window, dimensions) => {
          window.setContentSize(...dimensions);
          window.center();
        }, [width, height]);
        await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height], { timeout: 5000 });
        const dimensions = await win.evaluate(window => ({ outer: window.getSize(), content: window.getContentSize() }));
        assert.deepEqual(dimensions.content, [width, height]);
        const bounds = await page.evaluate(() => {
          const inside = selector => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            return rect.x >= 0 && rect.y >= 0 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1;
          };
          return {
            scrollWidth: document.documentElement.scrollWidth,
            header: inside(".quick-header"),
            footer: inside(".quick-footer"),
            bottom: inside(".quick-bottom"),
          };
        });
        const contrast = await page.evaluate(() => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d");
          const luminance = color => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3)
              .map(value => value / 255)
              .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
              .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
          };
          const compare = (foreground, background) => {
            const a = luminance(getComputedStyle(document.querySelector(foreground)).color);
            const b = luminance(getComputedStyle(document.querySelector(background)).backgroundColor);
            return Number(((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(2));
          };
          return {
            editor: compare(".quick-input", ".quick-content"),
            brand: compare(".quick-header small", ".quick-panel"),
            status: compare(".quick-footer .save-state", ".quick-footer .save-state"),
          };
        });
        if (!baseline) {
          assert.ok(bounds.scrollWidth <= width, `${width}×${height} ${theme}: horizontal overflow`);
          assert.ok(bounds.header && bounds.footer && bounds.bottom, `${width}×${height} ${theme}: clipped controls`);
          assert.ok(Object.values(contrast).every(ratio => ratio >= 4.5), JSON.stringify(contrast));
          assert.equal(await editor.evaluate(input => getComputedStyle(input).filter), "none");
        }
        await editor.focus();
        const file = `${width}x${height}-${theme}.png`;
        const png = await page.screenshot({ path: path.join(output, file), scale: "css", animations: "disabled", timeout: 8000 });
        assert.equal(png.readUInt32BE(16), width);
        assert.equal(png.readUInt32BE(20), height);
        screenshots.push({ file, theme, ...dimensions, ...bounds, contrast });
      }
    }

    if (!baseline) {
      await settings.focus();
      await page.keyboard.press("Tab");
      await expect(expand).toBeFocused();
      assert.equal(await expand.evaluate(button => button.matches(":focus-visible")), true);
      assert.equal(await expand.evaluate(button => getComputedStyle(button).outlineWidth), "2px");
      await page.screenshot({ path: path.join(output, "keyboard-focus.png"), scale: "css", timeout: 8000 });
      await page.keyboard.press("Tab");
      await expect(hide).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("tab", { name: "打字", exact: true })).toBeFocused();
      await page.keyboard.press("ArrowRight");
      const drawing = page.getByRole("tab", { name: "画图", exact: true });
      await expect(drawing).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(drawing).toHaveAttribute("aria-selected", "true");
      await page.getByRole("tab", { name: "打字", exact: true }).click();
      await expect(editor).toHaveValue(sample);

      await page.emulateMedia({ reducedMotion: "reduce" });
      await settings.hover();
      assert.equal(await settings.evaluate(button => getComputedStyle(button).transitionDuration), "0s");
      assert.equal(await settings.locator("svg").evaluate(icon => icon.getAnimations().length), 0);

      await hide.click();
      await expect.poll(() => win.evaluate(window => window.isVisible())).toBe(false);
      await win.evaluate(window => { window.show(); window.focus(); });
      await expand.click();
      const collapse = page.getByRole("button", { name: "收回小窗", exact: true });
      await expect(collapse).toBeVisible();
      await collapse.click();
      await expect(editor).toHaveValue(sample);
    }
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, "checks.json"), JSON.stringify({
      source: "Real Electron window with an isolated SQLite workspace",
      screenshots,
      keyboardAndReducedMotion: !baseline,
      errors,
    }, null, 2));
    console.log(`Verified ${screenshots.length} native screenshots in ${output}`);
  } finally {
    if (app) await app.close();
    const resolved = await fs.realpath(data);
    const temp = await fs.realpath(os.tmpdir());
    if (path.dirname(resolved) === temp && path.basename(resolved).startsWith("xigra-batch1-")) {
      await fs.rm(resolved, { recursive: true, force: true });
    }
  }
}

review().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
