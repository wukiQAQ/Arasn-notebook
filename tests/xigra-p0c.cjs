const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { execFileSync, spawn } = require("node:child_process");
const readline = require("node:readline");

const root = path.resolve(__dirname, "..");
const testF14 = process.argv.includes("--f14");
const toggleCycle = process.argv.includes("--toggle-cycle");

function waitForExit(app) {
  const child = app.process();
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Electron launcher ${child.pid} did not exit`)), 10000);
    child.once("exit", () => { clearTimeout(timer); resolve(); });
  });
}

async function verifyWindowsInput(app, page, window, editor, visible) {
  const helper = spawn("powershell.exe", ["-NoProfile", "-STA", "-File", path.join(__dirname, "xigra-p0c-windows.ps1"), testF14 ? "125" : "78"], {
    windowsHide: true, stdio: ["pipe", "pipe", "inherit"],
  });
  const responses = readline.createInterface({ input: helper.stdout })[Symbol.asyncIterator]();
  async function readNumber() {
    const reply = (await responses.next()).value;
    assert.match(reply ?? "", /^\d+$/);
    return Number(reply);
  }
  async function send(command, target) {
    helper.stdin.write(`${command} ${target}\n`);
    return readNumber();
  }
  try {
    const source = await readNumber();
    const panel = await window.evaluate(window => Number(window.getNativeWindowHandle().readBigUInt64LE()));
    await expect.poll(() => page.evaluate(async () => (await window.desktop.info()).shortcutOk)).toBe(true);
    await page.evaluate(() => {
      window.xigraInputCheck = { focus: 0, requests: 0, composition: false, ended: null };
      window.desktop.onFocus(() => {
        window.xigraInputCheck.requests++;
        const checkFocus = () => {
          if (document.hidden || !document.hasFocus() || document.activeElement?.getAttribute("aria-label") !== "便笺文字") {
            requestAnimationFrame(checkFocus);
            return;
          }
          window.xigraInputCheck.focus = Date.now();
        };
        requestAnimationFrame(checkFocus);
      });
      document.addEventListener("compositionstart", () => { window.xigraInputCheck.composition = true; });
      document.addEventListener("compositionend", event => {
        window.xigraInputCheck.composition = false;
        window.xigraInputCheck.ended = event.data;
      });
    });
    const latencies = [];
    for (let sample = 0; sample < 30; sample++) {
      if (sample === 0 || !toggleCycle) {
        await page.evaluate(() => window.desktop.hide());
        await expect.poll(visible).toBe(false);
      }
      await send("activate", source);
      const sent = await send("hotkey", source);
      const focusedAt = () => page.evaluate(() => window.xigraInputCheck.focus);
      try {
        await expect.poll(focusedAt).toBeGreaterThanOrEqual(sent);
      } catch (error) {
        console.error("Hotkey recall diagnostics", {
          sample,
          native: await window.evaluate(w => ({ visible: w.isVisible(), focused: w.isFocused() })),
          renderer: await page.evaluate(() => ({
            ...window.xigraInputCheck, focused: document.hasFocus(), active: document.activeElement?.getAttribute("aria-label"),
          })),
        });
        throw error;
      }
      latencies.push(await focusedAt() - sent);
      if (toggleCycle && sample < 29) {
        await send("hotkey", panel);
        await expect.poll(visible).toBe(false);
      }
    }
    latencies.sort((a, b) => a - b);
    console.log(`Windows OS hotkey from separate WinForms process, ${latencies.length} recalls: median ${latencies[14]}ms, p95 ${latencies[28]}ms, max ${latencies.at(-1)}ms to editor focus`);
    if (toggleCycle) console.log("PASS Windows hotkey: 29 consecutive native hides between 30 foreground recalls");

    const draft = "隐藏后保留当前编辑与选区";
    await editor.fill(draft);
    await expect(page.locator(".xigra-save-state")).toHaveText("已保存");
    await editor.evaluate(el => el.setSelectionRange(2, 6));
    await send("hotkey", panel);
    await expect.poll(visible).toBe(false);
    await window.evaluate(window => {
      window.xigraTestTransitions = [];
      for (const type of ["hide", "show"]) window.on(type, () => window.xigraTestTransitions.push(type));
    });
    await send("activate", source);
    await send("repeat-hotkey", source);
    await expect.poll(visible).toBe(true);
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue(draft);
    assert.deepEqual(await editor.evaluate(el => [el.selectionStart, el.selectionEnd]), [2, 6]);
    assert.deepEqual(await window.evaluate(window => window.xigraTestTransitions), ["show"]);

    const conflict = "Control+Shift+F16";
    assert.equal(await app.evaluate(({ globalShortcut }, value) => globalShortcut.register(value, () => {}), conflict), true);
    try {
      await assert.rejects(page.evaluate(shortcut => window.desktop.settings({ shortcut }), conflict), /已被占用/);
      const current = await page.evaluate(() => window.desktop.info());
      assert.equal(current.shortcut, testF14 ? "Control+Alt+F14" : "Control+Alt+N");
      assert.equal(current.shortcutOk, true);
    } finally {
      await app.evaluate(({ globalShortcut }, value) => globalShortcut.unregister(value), conflict);
    }

    const button = name => page.getByRole("button", { name, exact: true });
    await button("打开工作区").click();
    await expect(editor).toHaveValue(draft);
    await window.evaluate(window => window.minimize());
    await send("activate", source);
    await send("hotkey", source);
    await expect.poll(() => window.evaluate(window => window.isMinimized())).toBe(false);
    await expect(button("切换到便签区")).toBeVisible();
    await editor.focus();
    await send("hotkey", panel);
    await expect.poll(visible).toBe(false);
    await send("activate", source);
    await send("hotkey", source);
    await expect(button("切换到便签区")).toBeVisible();
    await expect(editor).toHaveValue(draft);
    await expect(editor).toBeFocused();
    await button("切换到便签区").click();
    console.log("PASS Windows hotkey: single transition under repeated keydown, preserved selection, conflict leaves old binding active, workbench retained across minimize and hide");
    await page.getByRole("button", { name: "新建便笺", exact: true }).click();

    const isComposing = () => page.evaluate(() => window.xigraInputCheck.composition);
    await send("pinyin", panel);
    if (!(await isComposing())) {
      await editor.fill("");
      await send("shift", panel);
      await send("pinyin", panel);
    }
    await expect.poll(isComposing).toBe(true);
    await send("hotkey", panel);
    await expect.poll(async () => ({ visible: await visible(), ...(await page.evaluate(() => ({ composition: window.xigraInputCheck.composition, ended: window.xigraInputCheck.ended }))) })).toMatchObject({ visible: true, composition: true });
    await window.evaluate(window => window.close());
    await app.evaluate(({ app }) => app.quit());
    await expect.poll(isComposing).toBe(true);
    assert.equal(await visible(), true);
    await send("escape", panel);
    await expect.poll(isComposing).toBe(false);
    assert.equal(await visible(), true);
    await send("escape", panel);
    await expect.poll(visible).toBe(false);
    await send("activate", source);
    await send("hotkey", source);
    await expect.poll(visible).toBe(true);
    await expect(editor).toBeFocused();
    await send("pinyin", panel);
    await expect.poll(isComposing).toBe(true);
    await send("space", panel);
    await expect.poll(isComposing).toBe(false);
    await expect(editor).toHaveValue(/\p{Script=Han}/u);
    await expect(page.locator(".xigra-save-state")).toHaveText("已保存");
    console.log("PASS Windows Microsoft Pinyin: candidates survive global toggle, native close and app quit, Escape cancels before hiding, Space commits Chinese text");
  } finally {
    helper.stdin.end();
    helper.kill();
  }
}

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "xigra-p0c-"));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ args: ["."], cwd: root, env });
  let app;
  function savedTexts() {
    const db = new DatabaseSync(path.join(data, "workspace.sqlite"), { readOnly: true });
    try { return db.prepare("SELECT value FROM elements").all().map(row => JSON.parse(row.value)?.text); }
    finally { db.close(); }
  }
  try {
    await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({ shortcut: testF14 ? "Control+Alt+F14" : "Control+Alt+N" }));
    app = await launch();
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const visible = () => win.evaluate(window => window.isVisible());
    const show = () => win.evaluate(window => {
      window.show();
      window.focus();
      window.webContents.send("app:focus");
    });
    await show();
    const editor = page.getByRole("textbox", { name: "便笺文字", exact: true });
    await expect(editor).toBeFocused();
    await expect(page.locator(".xigra-save-state")).toHaveText("等待输入");

    const cdp = await page.context().newCDPSession(page);
    const composing = "候选草稿";
    await cdp.send("Input.imeSetComposition", { text: composing, selectionStart: 0, selectionEnd: composing.length });
    await expect(editor).toHaveValue(composing);
    await win.evaluate(window => window.close());
    await expect.poll(visible).toBe(true);
    await expect(editor).toHaveValue(composing);
    assert.equal((await page.evaluate(() => window.desktop.recovery()))?.pending.length ?? 0, 0);

    await app.evaluate(({ app }) => app.quit());
    await expect(editor).toHaveValue(composing);
    assert.equal(await visible(), true);
    await cdp.send("Input.imeSetComposition", { text: "", selectionStart: 0, selectionEnd: 0 });
    await expect(editor).toHaveValue("");
    await win.evaluate(window => window.close());
    await expect.poll(visible).toBe(false);
    await show();
    await expect(editor).toBeFocused();

    await page.route("**/api/ops", route => route.abort("connectionreset"));
    const draft = "退出前已写入恢复副本的正文";
    await editor.fill(draft);
    const exited = waitForExit(app);
    await app.evaluate(({ app }) => app.quit());
    await exited;
    app = await launch();
    const restarted = await app.firstWindow();
    await expect(restarted.getByRole("textbox", { name: "便笺文字", exact: true })).toHaveValue(draft);
    await expect(restarted.locator(".xigra-save-state")).toHaveText("已保存");
    assert.deepEqual(savedTexts(), [draft]);
    console.log("PASS P0c: native close and quit preserve Chromium composition, canceled candidates stay out of SQLite, offline quit recovers latest text");
    if (process.platform === "win32" && process.argv.includes("--windows-input")) {
      const restartedWindow = await app.browserWindow(restarted);
      await restartedWindow.evaluate(window => { window.show(); window.focus(); });
      await verifyWindowsInput(app, restarted, restartedWindow, restarted.getByRole("textbox", { name: "便笺文字", exact: true }), () => restartedWindow.evaluate(window => window.isVisible()));
    }
    const committed = "SQLite 确认提交后强退，重启仍可找回";
    await restarted.getByRole("textbox", { name: "便笺文字", exact: true }).fill(committed);
    await expect(restarted.locator(".xigra-save-state")).toHaveText("已保存");
    assert.ok(savedTexts().includes(committed));
    const forcedExit = waitForExit(app);
    const mainPid = await app.evaluate(() => process.pid);
    if (process.platform === "win32") execFileSync("taskkill.exe", ["/PID", String(mainPid), "/T", "/F"], { windowsHide: true });
    else process.kill(mainPid, "SIGKILL");
    await forcedExit;
    app = await launch();
    await app.firstWindow();
    assert.ok(savedTexts().includes(committed));
    console.log("PASS SQLite: committed note survives abrupt Electron process termination and restart");
  } finally {
    if (app && app.process().exitCode === null && app.process().signalCode === null) {
      await app.evaluate(({ app }) => setTimeout(() => app.exit(0), 20)).catch(() => {});
      await waitForExit(app);
    }
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith("xigra-p0c-"))
      await fs.rm(target, { recursive: true, force: true });
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
