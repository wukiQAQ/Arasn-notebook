const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const { captureNativeWindow } = require("./helpers/native-window-capture.cjs");

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-unified-notes-"));
  const shots = path.resolve(process.env.ARASN_SCREENSHOTS || path.join(data, "screenshots"));
  await fs.mkdir(shots, { recursive: true });
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const bindings = [14, 16, 18].map((key, index) => ({
    id: `existing-${key}`, action: ["toggle", "quick-note", "workbench"][index], enabled: true,
    input: { device: "keyboard", accelerator: `Control+Alt+F${key}` },
  }));
  const triggers = { version: 1, bindings };
  await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({ theme: "light", triggers }));
  const errors = [];
  const launch = () => electron.launch({ args: [".", "--force-device-scale-factor=1"], env });
  let app, helper;
  try {
    app = await launch();
    const page = await app.firstWindow();
    page.on("pageerror", error => errors.push(error.message));
    const guardFixtureInput = () => document.addEventListener("keydown", event => {
      // Fixture text is set with fill(). Ignore unrelated physical keystrokes.
      if (event.key === "Delete" && event.target instanceof HTMLInputElement && event.target.type === "search") return;
      if (!event.ctrlKey && !event.altKey && !event.metaKey &&
          (event.key.length === 1 || ["Backspace", "Delete"].includes(event.key))) event.preventDefault();
    }, true);
    await page.addInitScript(guardFixtureInput);
    await page.evaluate(guardFixtureInput);
    page.setDefaultTimeout(6000);
    const win = await app.browserWindow(page);
    const editor = page.locator(".xigra-record-editor");
    const title = page.getByRole("textbox", { name: "便签标题", exact: true });
    const workspace = page.locator(".xigra-record-workspace");
    const library = page.locator("#record-library");
    const button = name => page.getByRole("button", { name, exact: true });
    const saved = () => expect(workspace.locator(".save-state")).toHaveText("已保存");
    await expect(title).toBeEnabled();
    assert.deepEqual(await page.evaluate(() => window.desktop.info().then(info => info.triggers)), triggers);

    helper = spawn("powershell.exe", ["-NoProfile", "-STA", "-File", path.join(__dirname, "xigra-p0c-windows.ps1")], {
      windowsHide: true, stdio: ["pipe", "pipe", "inherit"],
    });
    const replies = readline.createInterface({ input: helper.stdout })[Symbol.asyncIterator]();
    const source = Number((await replies.next()).value);
    assert.ok(source > 0);
    async function send(command) {
      helper.stdin.write(`${command} ${source}\n`);
      assert.match((await replies.next()).value ?? "", /^\d+$/);
    }
    const bounds = () => win.evaluate(w => w.getBounds());
    const initial = await bounds();
    await send("activate"); await send("f16");
    await expect(workspace).toHaveAttribute("data-quick", "true");
    await expect(editor).toBeFocused();
    await button("展开导航").click();
    await expect(page.locator(".adaptive-shell")).toHaveAttribute("data-sidebar-mode", "full");
    await button("紧凑导航").click();
    await expect(page.locator(".adaptive-shell")).toHaveAttribute("data-sidebar-mode", "compact");
    assert.deepEqual(await bounds(), initial);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
    assert.equal(await win.evaluate(w => w.isAlwaysOnTop()), false);
    await button("写一张便笺").click();
    await button("写一张便笺").click();
    await expect(editor).toHaveValue("");

    const samples = [
      ["产品讨论与后续安排", "整理今天的想法，把相关资料放在一起。\n下一次讨论前，确认文件中心的附件和关系画布上的安排。"],
      ["周末阅读清单", "先读收藏的文章，再整理读书笔记。"],
      ["会议准备", "核对会议议程，并整理需要跟进的问题。"],
    ];
    for (const [name, body] of samples) {
      await title.fill(name);
      await editor.fill(body);
      await saved();
      if (name !== samples.at(-1)[0]) await button("写一张便笺").click();
    }
    await editor.evaluate(el => { el.focus(); el.setSelectionRange(2, 5); window.originalNoteEditor = el; });
    await button("展开便签库").click();
    await expect(workspace).toHaveAttribute("data-quick", "false");
    assert.deepEqual(await editor.evaluate(el => [el === window.originalNoteEditor, document.activeElement === el, el.selectionStart, el.selectionEnd]), [true, true, 2, 5]);
    assert.deepEqual(await bounds(), initial);
    await expect(library.locator(".xigra-record-list li")).toHaveCount(3);
    await expect(button("写一张便笺")).toHaveCount(1);
    await library.getByRole("searchbox").fill("产品讨论");
    await library.getByRole("button", { name: /产品讨论与后续安排/ }).click();
    await expect(editor).toHaveValue(samples[0][1]);
    await library.getByRole("searchbox").fill("");
    await expect(library.locator(".xigra-record-list li")).toHaveCount(3);

    const file = path.join(data, "讨论资料.png");
    await fs.copyFile(path.join(__dirname, "..", "public", "arasn-icon.png"), file);
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
    await button("0 个附件").click();
    await button("本地导入").click();
    await expect(button("1 个附件")).toBeVisible();
    await button("1 个附件").click();
    await expect(page.getByText("来源：本地导入", { exact: false })).toBeVisible();
    await button("预览 讨论资料.png").click();
    const preview = page.getByRole("dialog").getByRole("img", { name: "讨论资料.png" });
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await button("返回文件列表").click();
    await button("发送到工作页").click();
    await button("关闭附件").click();

    const cover = path.join(data, "会议议程.txt");
    await fs.writeFile(cover, "会议议程");
    await app.evaluate(({ dialog }, cover) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [cover] }); }, cover);
    await button("1 个附件").click();
    await button("文件中心引用").click();
    await button("导入文件").click();
    await expect(button("添加所选（1）")).toBeEnabled();
    await button("添加所选（1）").click();
    await expect(button("2 个附件")).toBeVisible();

    await button("查看工作页").click();
    await expect(page.locator(".free-file-card")).toHaveCount(1);
    const card = page.locator(".spatial-note").filter({ hasText: samples[0][0] });
    await expect(card).toHaveCount(1);
    const noteId = await card.getAttribute("data-note-id");
    await page.getByRole("button", { name: "便笺列表", exact: true }).click();
    const updatedBody = "同一记录的最新正文与资料。\n\n会前：核对会议议程，确认第二轮讨论的负责人。\n会后：根据关系画布整理行动项，把决策同步到工作页。";
    await editor.fill(updatedBody);
    await saved();
    await button("查看工作页").click();
    await expect(page.locator(`[data-note-id="${noteId}"]`)).toContainText("同一记录的最新正文与资料。");
    await page.getByRole("button", { name: "便笺列表", exact: true }).click();
    await button("加入关系画布").click();
    const enable = button("备份并启用关系画布");
    if (await enable.isVisible()) await enable.click();
    const node = page.locator(".topology-node").filter({ hasText: samples[0][0] });
    await expect(node).toHaveCount(1);
    await page.getByRole("button", { name: "便笺列表", exact: true }).click();
    await title.fill("产品讨论与行动项"); await saved();
    await button("查看关系画布").click();
    await expect(page.locator(".topology-node").filter({ hasText: "产品讨论与行动项" })).toHaveCount(1);
    await page.getByRole("button", { name: "便笺列表", exact: true }).click();

    async function resize(width, height) {
      if (await win.evaluate(w => w.isMaximized())) {
        await win.evaluate(w => w.unmaximize());
        await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(false);
      }
      await win.evaluate((w, size) => w.setSize(...size), [width, height]);
      await expect.poll(() => bounds().then(b => [b.width, b.height])).toEqual([width, height]);
    }
    async function capture(name) {
      await page.locator(".app-notification").waitFor({ state: "hidden" });
      const metrics = await workspace.evaluate(root => {
        const editor = root.querySelector("textarea").getBoundingClientRect();
        const status = root.querySelector(".note-status-bar").getBoundingClientRect();
        return [document.documentElement.scrollWidth <= innerWidth, editor.height > 100, status.bottom <= innerHeight, status.right <= innerWidth];
      });
      assert.deepEqual(metrics, [true, true, true, true], name);
      await page.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.allSettled(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished));
      });
      const expected = await bounds();
      await expect.poll(async () => {
        await win.evaluate(w => { if (w.isMinimized()) w.restore(); });
        const shot = await captureNativeWindow(app, page, path.join(shots, `${name}.png`));
        // Native capture includes the Windows resize border outside the client bounds.
        return shot.width >= expected.width - 32 && shot.height >= expected.height - 32;
      }, { message: `${name} captures the full window` }).toBe(true);
    }
    for (const [width, height] of [[1280, 800], [800, 600], [600, 480]]) {
      await resize(width, height);
      await capture(`light-management-${width}x${height}`);
      const narrow = button("展开便签库");
      if (await narrow.isVisible()) {
        await narrow.click();
        await expect(library.getByRole("searchbox")).toBeVisible();
        await capture(`light-library-${width}x${height}`);
        await button("收起便签库").click();
      }
      await send("activate"); await send("f16");
      await expect(workspace).toHaveAttribute("data-quick", "true");
      await expect(editor).toBeFocused();
      await capture(`light-capture-${width}x${height}`);
      await send("activate"); await send("f18");
      await expect(workspace).toHaveAttribute("data-quick", "false");
    }

    await page.evaluate(() => window.desktop.settings({ theme: "dark" }));
    await page.reload();
    await expect(title).toHaveValue("产品讨论与行动项");
    await expect(button("2 个附件")).toBeVisible();
    await win.evaluate(w => w.maximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    await capture("dark-management-maximized");
    await send("activate"); await send("f16");
    await expect(workspace).toHaveAttribute("data-quick", "true");
    await capture("dark-capture-maximized");
    await win.evaluate(w => w.minimize());
    await send("activate"); await send("f16");
    await expect.poll(() => win.evaluate(w => w.isFocused() && !w.isMinimized())).toBe(true);
    await expect(editor).toBeFocused();
    await page.evaluate(() => window.desktop.hide());
    await expect.poll(() => win.evaluate(w => w.isVisible())).toBe(false);
    await send("activate"); await send("f14");
    await expect.poll(() => win.evaluate(w => w.isFocused())).toBe(true);
    await expect(editor).toBeFocused();
    await expect(workspace).toHaveAttribute("data-quick", "true");
    assert.deepEqual(errors, []);
    console.log(`PASS unified notes and Windows hotkeys. Screenshots: ${shots}`);
  } finally {
    helper?.stdin.end();
    if (app) await app.close();
    if (process.env.ARASN_SCREENSHOTS) await fs.rm(data, { recursive: true, force: true });
  }
}
verify().catch(error => { console.error(error); process.exitCode = 1; });
