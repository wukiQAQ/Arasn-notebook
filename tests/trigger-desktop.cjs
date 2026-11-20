const { selectOption } = require("./helpers/select-option.cjs");
const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const root = path.resolve(__dirname, "..");
const action = (id, key, action, enabled = true) => ({
  id, action, enabled, input: { device: "keyboard", accelerator: `Control+Alt+F${key}` },
});
const rows = [
  action("main-1", 14, "toggle"), action("main-2", 15, "toggle"),
  action("note", 16, "quick-note"), action("files", 17, "files"),
  action("workbench", 18, "workbench"), action("commands", 19, "commands"),
];
const config = { version: 1, bindings: rows };
const mouseBinding = (id, button, action, modifiers = [], gesture = "press") => ({
  id, action, enabled: true, input: { device: "mouse", button, modifiers, gesture },
});

async function stopHelper(helper) {
  if (!helper || helper.exitCode !== null || helper.signalCode !== null) return;
  const exited = new Promise(resolve => helper.once("exit", resolve));
  helper.stdin.end();
  const timer = setTimeout(() => helper.kill(), 2000);
  try { await exited; } finally { clearTimeout(timer); }
}

async function stop(app) {
  if (!app) return;
  const child = app.process();
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("隔离 Electron 测试进程未退出")), 8000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
  await app.evaluate(({ app }) => setTimeout(() => app.exit(0), 25)).catch(() => {});
  await exited;
}

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-triggers-"));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ args: ["."], cwd: root, env });
  let app, helper;
  try {
    await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({ shortcut: "Control+Alt+F14" }));
    app = await launch();
    const page = await app.firstWindow();
    // Text is seeded with fill(). Unrelated physical typing must not edit the
    // foreground fixture while the native helper exercises function keys.
    await page.addInitScript(() => document.addEventListener('keydown', event => {
      if (!event.ctrlKey && !event.altKey && !event.metaKey &&
          (event.key.length === 1 || ['Backspace', 'Delete'].includes(event.key))) event.preventDefault();
    }, true));
    const win = await app.browserWindow(page);
    const visible = () => win.evaluate(window => window.isVisible());
    const getInfo = () => page.evaluate(() => window.desktop.info());
    const button = name => page.getByRole("button", { name, exact: true });
    await expect.poll(async () => (await getInfo()).shortcut).toBe("Control+Alt+F14");
    await page.evaluate(triggers => window.desktop.settings({ triggers }), config);
    assert.deepEqual((await getInfo()).triggers, config);
    await assert.rejects(page.evaluate(triggers => window.desktop.settings({ triggers }), {
      version: 1, bindings: [...rows, action("collision", 19, "quick-note")],
    }), /已绑定/);
    assert.deepEqual((await getInfo()).triggers, config);
    // The fixture seeds bindings through IPC. Reload the settings UI from that committed snapshot.
    await page.reload();
    helper = spawn("powershell.exe", ["-NoProfile", "-STA", "-File", path.join(__dirname, "xigra-p0c-windows.ps1")], {
      windowsHide: true, stdio: ["pipe", "pipe", "inherit"],
    });
    const replies = readline.createInterface({ input: helper.stdout })[Symbol.asyncIterator]();
    const source = Number((await replies.next()).value);
    assert.ok(source > 0);
    const panel = await win.evaluate(window => Number(window.getNativeWindowHandle().readBigUInt64LE()));
    const send = async (command, target) => {
      helper.stdin.write(`${command} ${target}\n`);
      assert.match((await replies.next()).value ?? "", /^\d+$/);
    };
    const fromOtherWindow = async key => {
      await send("activate", source);
      await send(`f${key}`, source);
      await expect.poll(visible, { message: `Windows Ctrl+Alt+F${key} must reveal the panel` }).toBe(true);
    };
    const hide = async () => {
      await page.evaluate(() => window.desktop.hide());
      await expect.poll(visible).toBe(false);
    };

    await fromOtherWindow(14);
    const editor = page.getByRole("textbox", { name: "便笺文字", exact: true });
    await expect(editor).toBeFocused();
    await editor.fill("不同全局动作共用这份草稿");
    await expect(page.locator(".xigra-save-state:visible")).toHaveText("已保存");
    await hide();
    await fromOtherWindow(15);
    await expect(editor).toHaveValue("不同全局动作共用这份草稿");
    await send("activate", source);
    await send("f15", source);
    await expect.poll(visible).toBe(false);
    await fromOtherWindow(17);
    await expect(page.locator(".file-workspace")).toBeVisible();
    await page.keyboard.press("Escape");
    await hide();
    await fromOtherWindow(16);
    await expect(button("打开工作区")).toBeVisible();
    await expect(editor).toHaveValue("不同全局动作共用这份草稿");
    await hide();
    await fromOtherWindow(18);
    await expect(button("切换到便签区")).toBeVisible();
    await hide();
    await fromOtherWindow(19);
    await expect(page.locator(".command-popup")).toBeVisible();
    await page.keyboard.press("Escape");

    await button("设置与快捷键").first().click();
    const toggle = page.getByRole("region", { name: "显示或隐藏主面板" });
    await expect(toggle.getByText("Ctrl + Alt + F15", { exact: true })).toBeVisible();
    await toggle.getByRole("button", { name: "录制快捷键", exact: false }).click();
    const capture = page.getByRole("group", { name: "正在录制快捷键" });
    await expect(capture).toBeFocused();
    await send("f14", panel);
    await expect(capture).toHaveText("Ctrl + Alt + F14");
    await expect(page.getByRole("status").filter({ hasText: "已绑定" })).toBeVisible();
    assert.equal(await visible(), true);
    await capture.press("Escape");
    await toggle.getByRole("button", { name: "禁用", exact: true }).first().click();
    await expect(toggle.getByText("已禁用", { exact: true })).toBeVisible();
    const screenshot = process.env.ARASN_TRIGGER_SCREENSHOT;
    if (screenshot) await page.screenshot({ path: screenshot, animations: "disabled" });
    const withMouse = process.argv.includes("--mouse");
    if (withMouse) {
      await button("鼠标按键").click();
      const listening = () => win.evaluate((window, koffiPath) => {
        const load = process.getBuiltinModule("node:module").createRequire(koffiPath);
        const native = load(koffiPath).load("user32.dll");
        const enumerate = native.func("uint __stdcall GetRegisteredRawInputDevices(void *devices, void *count, uint size)");
        const handle = window.getNativeWindowHandle();
        const deviceSize = 8 + handle.length;
        const count = Buffer.alloc(4);
        assertEnumeration(enumerate(null, count, deviceSize));
        const devices = Buffer.alloc(count.readUInt32LE() * deviceSize);
        let owned = false;
        if (devices.length) {
          assertEnumeration(enumerate(devices, count, deviceSize));
          for (let offset = 0; offset < devices.length; offset += deviceSize) {
            if (devices.readUInt16LE(offset) === 1 && devices.readUInt16LE(offset + 2) === 2 &&
                devices.subarray(offset + 8, offset + deviceSize).equals(handle)) owned = true;
          }
        }
        if (owned !== window.isWindowMessageHooked(0xff)) throw new Error("Raw Input 注册与窗口监听不一致");
        return owned;

        function assertEnumeration(result) {
          if (result === 0xffffffff) throw new Error("无法读取 Raw Input 注册");
        }
      }, require.resolve("koffi"));
      assert.equal(await listening(), false);
      await toggle.getByRole("button", { name: "录制快捷键", exact: false }).click();
      await expect(capture).toBeFocused();
      await capture.click({ button: "middle", modifiers: ["Control"] });
      await expect(capture).toHaveText("Ctrl + 鼠标中键");
      const confirm = page.getByRole("button", { name: "确认保存", exact: true });
      await confirm.click();
      await expect.poll(listening).toBe(true);
      await toggle.getByRole("button", { name: "录制快捷键", exact: false }).click();
      await expect(capture).toBeFocused();
      await capture.click({ button: "middle" });
      await expect(capture).toHaveText("鼠标中键");
      await selectOption(page, "中键手势", "double");
      await expect(capture).toHaveText("双击鼠标中键");
      await expect(confirm).toBeDisabled();
      await expect(page.getByRole("checkbox", { name: /我了解中键/ })).toBeVisible();
      const mouseScreenshot = process.env.ARASN_MOUSE_SCREENSHOT;
      if (mouseScreenshot) await page.screenshot({ path: mouseScreenshot, animations: "disabled" });
      const previousBounds = await win.evaluate(window => {
        const bounds = window.getBounds();
        window.setMinimumSize(350, 460);
        window.setContentSize(390, 560);
        return bounds;
      });
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(390);
      await expect(button("关闭弹窗")).toBeInViewport();
      assert.equal(await page.locator(".settings-scroll").evaluate(el => el.scrollWidth <= el.clientWidth), true);
      if (mouseScreenshot) await page.screenshot({ path: path.join(path.dirname(mouseScreenshot), "trigger-settings-narrow.png"), animations: "disabled" });
      await win.evaluate((window, bounds) => {
        window.setMinimumSize(720, 520);
        window.setBounds(bounds);
      }, previousBounds);
      await capture.press("Escape");
      await button("关闭弹窗").click();

      const keyboard = (await getInfo()).triggers.bindings.filter(row => row.input.device === "keyboard");
      const mixed = { version: 1, bindings: [...keyboard,
        mouseBinding("middle", "Middle", "toggle", ["Control"]),
        mouseBinding("back", "Mouse4", "files"),
        mouseBinding("forward", "Mouse5", "workbench"),
        mouseBinding("double", "Middle", "quick-note", [], "double"),
      ] };
      await page.evaluate(triggers => window.desktop.settings({ triggers }), mixed);
      const mouse = async (kind, shown = true) => {
        await send("activate", source);
        await send(kind, source);
        if (shown) await expect.poll(visible).toBe(true);
        else {
          await new Promise(resolve => setTimeout(resolve, 150));
          assert.equal(await visible(), false);
        }
      };
      const mouseCounts = async () => {
        await send("activate", source);
        helper.stdin.write(`mouse-counts ${source}\n`);
        const reply = (await replies.next()).value;
        assert.match(reply ?? "", /^\d+,\d+$/);
        return reply.split(",").map(Number);
      };
      await hide();
      const before = await mouseCounts();
      await mouse("middle", false);
      assert.deepEqual(await mouseCounts(), before.map(count => count + 1));
      await mouse("ctrl-middle");
      await expect.poll(() => win.evaluate(window => window.isFocused())).toBe(true);
      assert.deepEqual(await mouseCounts(), before.map(count => count + 2));
      await hide();
      await mouse("mouse4");
      await expect(page.locator(".file-workspace")).toBeVisible();
      await page.keyboard.press("Escape");
      await hide();
      await mouse("mouse5");
      await expect(button("切换到便签区")).toBeVisible();
      await hide();
      await mouse("double-middle");
      await expect(button("打开工作区")).toBeVisible();
      await expect(editor).toHaveValue("不同全局动作共用这份草稿");
      await page.evaluate(triggers => window.desktop.settings({ triggers }), { version: 1, bindings: keyboard });
      assert.equal(await listening(), false);
      await hide();
      const disabled = await mouseCounts();
      await mouse("ctrl-middle", false);
      assert.deepEqual(await mouseCounts(), disabled.map(count => count + 1));
      await fromOtherWindow(15);
      if (process.argv.includes("--smart")) {
        await button("打开工作区").click();
        await button("设置与快捷键").first().click();
        await button("鼠标手势").click();
        await toggle.getByRole("button", { name: /录制手势/ }).click();
        await expect(capture).toBeFocused();
        const rect = await capture.boundingBox();
        await page.keyboard.down("Control");
        await page.mouse.move(rect.x + 16, rect.y + 28);
        await page.mouse.down({ button: "right" });
        await page.mouse.move(rect.x + 96, rect.y + 28, { steps: 8 });
        await page.mouse.move(rect.x + 96, rect.y + 88, { steps: 6 });
        await page.mouse.up({ button: "right" });
        await page.keyboard.up("Control");
        await expect(capture).toContainText("Ctrl + 右键 拖动 → ↓");
        const smartScreenshot = process.env.ARASN_SMART_SCREENSHOT;
        if (smartScreenshot) await page.screenshot({ path: smartScreenshot, animations: "disabled" });
        await confirm.click();
        await button("测试触发器").click();
        const counts = await mouseCounts();
        await send("ctrl-right-drag", source);
        await expect(page.getByRole("status").filter({ hasText: "已识别 Ctrl + 右键 拖动 → ↓" })).toBeVisible();
        assert.equal(await visible(), true);
        assert.deepEqual(await mouseCounts(), counts.map(value => value + 1));
        await button("结束测试").click();
        await button("关闭弹窗").click();
        await hide();
        await mouse("ctrl-right-drag");
        console.log("PASS Windows gesture: recorded L path, native recognition, original right button delivered, test mode does not dispatch");
        if (process.argv.includes("--edge")) {
          await button("设置与快捷键").first().click();
          await button("屏幕边缘").click();
          await toggle.getByRole("button", { name: /添加热区/ }).click();
          const diagram = page.getByRole("group", { name: "屏幕热区示意图" });
          await expect(diagram.getByRole("button", { name: "顶部", exact: true })).toHaveAttribute("aria-pressed", "true");
          await diagram.getByRole("button", { name: "左上角", exact: true }).click();
          await expect(diagram.getByRole("button", { name: "左上角", exact: true })).toHaveAttribute("aria-pressed", "true");
          const edgeScreenshot = process.env.ARASN_EDGE_SCREENSHOT;
          if (edgeScreenshot) await page.screenshot({ path: edgeScreenshot, animations: "disabled" });
          await diagram.getByRole("button", { name: "顶部", exact: true }).click();
          await confirm.click();
          await button("关闭弹窗").click();
          await hide();
          await send("activate", source);
          await send("edge-top", source);
          await new Promise(resolve => setTimeout(resolve, 600));
          assert.equal(await visible(), false);
          const edgeConfig = (await getInfo()).triggers;
          const fullscreenGuarded = { ...edgeConfig, bindings: edgeConfig.bindings.map(binding =>
            binding.input.device === "edge" ? { ...binding, input: { ...binding.input,
              desktopOnly: false, dwellMs: process.argv.includes("--feedback") ? 1200 : binding.input.dwellMs } } : binding) };
          await page.evaluate(triggers => window.desktop.settings({ triggers }), fullscreenGuarded);
          await send("fullscreen-on", source);
          await send("edge-leave", source);
          await send("edge-top", source);
          await new Promise(resolve => setTimeout(resolve, process.argv.includes("--feedback") ? 1350 : 600));
          assert.equal(await visible(), false);
          await send("fullscreen-off", source);
          await send("edge-leave", source);
          await send("edge-top", source);
          if (process.argv.includes("--feedback")) {
            const frame = () => app.evaluate(({ BrowserWindow }) => {
              const w = BrowserWindow.getAllWindows().find(item => item.getTitle() === "Arasn Edge Feedback");
              return w ? { visible: w.isVisible(), focused: w.isFocused(), focusable: w.isFocusable(), ...w.getBounds() } : null;
            });
            await expect.poll(async () => (await frame())?.visible ?? false).toBe(true);
            const strip = await frame();
            assert.equal(strip.focused, false);
            assert.equal(strip.focusable, false);
            assert.equal(strip.width, 64);
            await send("foreground-status", source);
            const transparent = await app.evaluate(({ BrowserWindow }, koffiPath) => {
              const w = BrowserWindow.getAllWindows().find(item => item.getTitle() === "Arasn Edge Feedback");
              const load = process.getBuiltinModule("node:module").createRequire(koffiPath);
              const user = load(koffiPath).load("user32.dll");
              const style = user.func("intptr_t __stdcall GetWindowLongPtrW(uintptr_t hwnd, int index)");
              return Boolean(BigInt(style(w.getNativeWindowHandle().readBigUInt64LE(), -20)) & 0x20n);
            }, require.resolve("koffi"));
            assert.equal(transparent, true);
            await expect.poll(() => app.windows().some(w => w.url().endsWith("/edge-feedback.html"))).toBe(true);
            const feedbackPage = app.windows().find(w => w.url().endsWith("/edge-feedback.html"));
            await expect(feedbackPage.locator("html")).toHaveAttribute("data-running", "");
            await expect(feedbackPage.locator("#indicator")).toHaveCSS("height", "4px");
            await feedbackPage.emulateMedia({ reducedMotion: "reduce" });
            await expect(feedbackPage.locator("#fill")).toHaveCSS("animation-name", "none");
            console.log("PASS feedback: 64×4 DIP, ignores mouse, leaves WinForms foreground, reduced motion");
          }
          await expect.poll(visible).toBe(true);
          await new Promise(resolve => setTimeout(resolve, 650));
          assert.equal(await visible(), true);
          await hide();
          await send("activate", source);
          if (process.argv.includes("--feedback")) {
            await page.evaluate(triggers => window.desktop.settings({ triggers }), { ...fullscreenGuarded, feedback: false });
            await send("edge-leave", source);
            await send("edge-top", source);
            await expect.poll(visible).toBe(true);
            assert.equal(await app.evaluate(({ BrowserWindow }) =>
              BrowserWindow.getAllWindows().some(item => item.getTitle() === "Arasn Edge Feedback")), false);
            await hide();
            await send("activate", source);
          }
          const disabledEdge = { ...fullscreenGuarded, bindings: fullscreenGuarded.bindings.map(binding =>
            binding.input.device === "edge" ? { ...binding, enabled: false } : binding) };
          await page.evaluate(triggers => window.desktop.settings({ triggers }), disabledEdge);
          if (process.argv.includes("--feedback"))
            assert.equal(await app.evaluate(({ BrowserWindow }) =>
              BrowserWindow.getAllWindows().some(item => item.getTitle() === "Arasn Edge Feedback")), false);
          await send("edge-leave", source);
          await send("edge-top", source);
          await new Promise(resolve => setTimeout(resolve, process.argv.includes("--feedback") ? 1350 : 600));
          assert.equal(await visible(), false);
          await fromOtherWindow(15);
          console.log("PASS Windows edge: diagram and live settings, desktop-only filter, fullscreen pause, dwell, latch and individual disable");
        }
      }
      const simpleMouse = { version: 1, bindings: [...keyboard, mixed.bindings[keyboard.length]] };
      for (let iteration = 0; iteration < 20; iteration++) {
        await page.evaluate(triggers => window.desktop.settings({ triggers }), simpleMouse);
        assert.equal(await listening(), true);
        await page.evaluate(triggers => window.desktop.settings({ triggers }), { version: 1, bindings: keyboard });
        assert.equal(await listening(), false);
      }
      if (process.argv.includes("--smart")) {
        await page.evaluate(triggers => window.desktop.settings({ triggers }), { ...simpleMouse, paused: true });
        assert.equal(await listening(), false);
        assert.equal((await getInfo()).triggers.paused, true);
        assert.equal(await app.evaluate(({ globalShortcut }) => {
          const released = globalShortcut.register("Control+Alt+F15", () => {});
          if (released) globalShortcut.unregister("Control+Alt+F15");
          return released;
        }), true);
      }
      await page.evaluate(triggers => window.desktop.settings({ triggers }), simpleMouse);
      console.log("PASS Windows mouse: Ctrl+middle with native focus, sides, double-middle, pass-through on the original window, 20 native register/release cycles, keyboard retained");
    }
    await stopHelper(helper);
    helper = undefined;
    await stop(app);
    app = await launch();
    const restarted = await app.firstWindow();
    const saved = await restarted.evaluate(() => window.desktop.info());
    assert.equal(saved.triggers.bindings.length, withMouse ? 7 : 6);
    assert.equal(saved.triggers.bindings[0].enabled, false);
    assert.equal(saved.triggers.bindings[1].enabled, true);
    const restartedWindow = await app.browserWindow(restarted);
    if (withMouse) {
      assert.equal(saved.triggerFailures.middle, undefined);
      assert.equal(await restartedWindow.evaluate(window => window.isWindowMessageHooked(0xff)), true);
    }
    await restarted.evaluate(() => window.desktop.triggers.defaults());
    if (withMouse) assert.equal(await restartedWindow.evaluate(window => window.isWindowMessageHooked(0xff)), false);
    assert.equal(await restarted.evaluate(async () => (await window.desktop.info()).shortcut), "Control+Alt+N");
    console.log("PASS Windows keyboard: two live bindings for one action, all five actions, capture of registered key without toggle, migration, disable, restart and defaults");
  } finally {
    await stopHelper(helper);
    await stop(app);
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith("arasn-triggers-"))
      await fs.rm(target, { recursive: true, force: true });
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
