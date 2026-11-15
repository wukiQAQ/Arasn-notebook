const { selectOption } = require("./helpers/select-option.cjs");
const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const edge = (region, width) => ({ device: "edge", region, width, dwellMs: 400, cooldownMs: 1000,
  modifier: null, desktopOnly: true, pauseFullscreen: true });
const fixture = { version: 1, bindings: [
  { id: "left-zone", action: "workbench", enabled: true, input: edge("left", 8) },
  { id: "right-zone", action: "files", enabled: false, input: edge("right", 16) },
  { id: "middle-button", action: "quick-note", enabled: true,
    input: { device: "mouse", button: "Middle", modifiers: ["Control"], gesture: "press" } },
  { id: "l-gesture", action: "commands", enabled: true, name: "L 形命令",
    input: { device: "gesture", button: "Right", modifiers: ["Control"], path: ["E", "S"],
      minDistance: 48, timeoutMs: 900, tolerance: 20, global: false } },
] };

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-visuals-"));
  let app;
  try {
    await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({ theme: "light", triggers: fixture }));
    const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
    delete env.ELECTRON_RUN_AS_NODE;
    const executablePath = process.env.ARASN_TEST_EXE;
    app = await electron.launch({ executablePath, args: executablePath ? [] : ["."],
      cwd: path.resolve(__dirname, ".."), env });
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const button = name => page.getByRole("button", { name, exact: true });
    const shot = async name => {
      if (process.env.ARASN_VISUAL_SHOTS) await page.screenshot({
        path: path.join(process.env.ARASN_VISUAL_SHOTS, name + ".png"), animations: "disabled", scale: "css",
      });
    };
    await win.evaluate(window => { window.show(); window.focus(); });
    await button("打开工作区").click();
    await button("设置与快捷键").first().click();
    await button("屏幕边缘").click();
    const monitor = page.getByRole("group", { name: "屏幕热区示意图" });
    const left = monitor.getByRole("button", { name: "左侧", exact: true });
    const right = monitor.getByRole("button", { name: "右侧", exact: true });
    const leftBand = monitor.locator('[data-zone="left"]');
    const rightBand = monitor.locator('[data-zone="right"]');
    const summary = page.locator(".hotzone-detail");
    const editor = page.locator(".trigger-editor");
    await expect(monitor.getByRole("button")).toHaveCount(8);
    await expect(leftBand).toHaveAttribute("data-active", "true");
    await expect(rightBand).toHaveAttribute("data-active", "false");
    await right.hover();
    await expect(rightBand).toHaveAttribute("data-highlighted", "true");
    await left.press("Enter");
    await expect(left).toBeFocused();
    await expect(left).toHaveAttribute("aria-pressed", "true");
    await expect(summary).toContainText("展开工作站");
    const width = summary.getByLabel("宽度（DIP）", { exact: true });
    await expect(width).toHaveValue("8");
    await expect(summary).toContainText("已启用");
    const oldWidth = Number(await leftBand.getAttribute("width"));
    await width.fill("12");
    await expect(width).toHaveValue("12");
    await expect(summary).toContainText("待保存");
    assert.ok(Number(await leftBand.getAttribute("width")) > oldWidth);
    await right.click();
    await expect(page.getByRole("status").filter({ hasText: "请先保存或取消" })).toBeVisible();
    await expect(left).toHaveAttribute("aria-pressed", "true");
    await button("演示停留").click();
    await expect(summary.getByRole("status")).toHaveText("模拟停留中");
    await expect(summary.getByRole("status")).toHaveText("模拟冷却中");
    await expect(summary.getByRole("status")).toHaveText("演示结束");
    await expect(page.getByRole("dialog", { name: "设置", exact: true })).toBeVisible();
    assert.deepEqual(await page.evaluate(async () => (await window.desktop.info()).triggers), fixture);
    await shot("trigger-visuals-hotzone-light");
    await button("确认保存").click();
    await expect.poll(() => page.evaluate(async () => (await window.desktop.info()).triggers.bindings[0].input.width)).toBe(12);

    await right.press("Space");
    await expect(right).toHaveAttribute("aria-pressed", "true");
    await expect(summary).toContainText("打开文件中转站");
    await expect(width).toHaveValue("16");
    await selectOption(page, "外观主题", "dark");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await button("演示停留").click();
    await expect(summary.locator(".hotzone-meter span")).toHaveCSS("animation-name", "none");
    await win.evaluate(window => { window.setMinimumSize(350, 460); window.setContentSize(390, 560); });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(390);
    await expect(button("关闭弹窗")).toBeInViewport();
    assert.equal(await page.locator(".settings-scroll").evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await monitor.scrollIntoViewIfNeeded();
    await shot("trigger-visuals-hotzone-dark-narrow");
    await editor.getByRole("button", { name: "取消", exact: true }).click();
    await win.evaluate(window => window.setContentSize(1100, 750));
    await button("鼠标按键").click();
    const mouse = page.locator(".mouse-visual");
    await expect(mouse.locator("[data-part]")).toHaveCount(5);
    await expect(mouse.locator('[data-part="Middle"]')).toHaveAttribute("data-active", "true");
    await expect(mouse).toContainText("自动滚动");
    await shot("trigger-visuals-mouse-dark");
    await button("鼠标手势").click();
    const gesture = page.getByRole("region", { name: "打开快捷命令面板", exact: true });
    await expect(gesture.locator(".trigger-gesture-preview polyline")).toHaveAttribute("points", "25,15 43,15 43,33");
    await expect(gesture).toContainText("L 形命令");
    await expect(gesture).toContainText("Ctrl + 右键 拖动 → ↓");
    await expect(gesture).toContainText("已启用");
    await gesture.scrollIntoViewIfNeeded();
    await shot("trigger-visuals-gesture-dark");
    console.log("PASS hotzone selection, draft protection, live width, demo isolation, persistence, reduced motion, 390px, mouse positions and saved gesture path");
  } finally {
    if (app) {
      const child = app.process();
      if (child.exitCode === null && child.signalCode === null) {
        const exited = new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("隔离 Electron 未退出")), 8000);
          child.once("exit", () => { clearTimeout(timer); resolve(); });
        });
        await app.evaluate(({ app }) => setTimeout(() => app.exit(0), 25)).catch(() => {});
        await exited;
      }
    }
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith("arasn-visuals-"))
      await fs.rm(target, { recursive: true, force: true });
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
