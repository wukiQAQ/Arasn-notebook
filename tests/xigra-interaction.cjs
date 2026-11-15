const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const output = process.env.ARASN_TEST_SCREENSHOTS;

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "xigra-interaction-"));
  const env = { ...process.env, ARASN_DATA_DIR: data };
  delete env.ARASN_SMOKE;
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  const launch = () => electron.launch({ args: ["."], cwd: root, env });
  try {
    if (output) await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({ theme: "light", shortcut: "Control+Alt+F16" }));
    app = await launch();
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const button = name => page.getByRole("button", { name, exact: true });
    const shot = name => output && page.screenshot({ path: path.join(output, name + ".png"), animations: "disabled" });
    const bounds = () => win.evaluate(win => win.getBounds());
    await expect.poll(() => win.evaluate(win => win.isVisible())).toBe(true);
    const area = await app.evaluate(({ screen }) => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea);
    const first = await bounds();
    assert.ok(Math.abs(first.x + first.width / 2 - (area.x + area.width / 2)) <= 2);
    assert.ok(Math.abs(first.y + first.height / 2 - (area.y + area.height / 2)) <= 2);
    await win.evaluate(win => { const { x, y } = win.getBounds(); win.setPosition(x + 24, y + 12); });
    const moved = await bounds();
    assert.notDeepEqual(moved, first);
    await button("打开工作区").click();
    await button("切换到便签区").click();
    await expect.poll(bounds).toEqual(moved);
    await button("打开工作区").click();

    const canvas = button("我的随手页");
    const records = button("便笺列表");
    await canvas.click();
    const scroller = page.locator(".paper-scroll");
    await scroller.evaluate(el => el.scrollTo(140, 90));
    await button("写一张便笺").click();
    const note = page.locator(".note.focused");
    const editor = note.getByRole("textbox");
    await expect(editor).toBeFocused();
    const centered = await note.evaluate(el => {
      const card = el.getBoundingClientRect(), view = el.closest(".paper-scroll").getBoundingClientRect();
      const bottom = el.closest(".workspace").querySelector(".toolbar").getBoundingClientRect().top - 8;
      return { x: Math.abs(card.left + card.width / 2 - (view.left + view.width / 2)),
        y: Math.abs(card.top + card.height / 2 - (view.top + bottom) / 2) };
    });
    assert.ok(centered.x < 16 && centered.y < 16, JSON.stringify(centered));
    await editor.fill("画布便笺的位置、正文与视图状态");
    const handle = await note.locator(".note-handle").boundingBox();
    await page.mouse.move(handle.x + 16, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + 65, handle.y + handle.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    const dragged = await note.evaluate(el => ({ id: el.dataset.noteId, left: el.style.left, top: el.style.top }));
    const scroll = await scroller.evaluate(el => [el.scrollLeft, el.scrollTop]);
    await records.click();
    await expect(scroller).toBeHidden();
    await expect(page.locator(".xigra-record-workspace")).toHaveCSS("animation-duration", "0.19s");
    await canvas.click();
    assert.deepEqual(await scroller.evaluate(el => [el.scrollLeft, el.scrollTop]), scroll);
    await expect(editor).toHaveValue("画布便笺的位置、正文与视图状态");
    await expect(page.locator(".xigra-save-state").filter({ visible: true })).toHaveText("已保存");
    await shot("canvas-note");

    await app.close();
    app = await launch();
    const reopened = await app.firstWindow();
    const reopenedWindow = await app.browserWindow(reopened);
    assert.deepEqual(await reopenedWindow.evaluate(win => win.getBounds()), moved);
    const click = name => reopened.getByRole("button", { name, exact: true }).click();
    await click("打开工作区");
    await click("我的随手页");
    const restored = reopened.locator(`[data-note-id="${dragged.id}"].note`);
    await expect(restored).toHaveCSS("left", dragged.left);
    await expect(restored).toHaveCSS("top", dragged.top);

    const picture = path.join(data, "交互稿-横向示意图.png");
    const document = path.join(data, "本周评审材料.txt");
    const png = await reopened.evaluate(() => {
      const canvas = window.document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 160;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#4358c4";
      ctx.fillRect(0, 0, 320, 160);
      ctx.fillStyle = "#dbe3ff";
      ctx.fillRect(32, 32, 180, 30);
      return canvas.toDataURL().split(",")[1];
    });
    await fs.writeFile(picture, Buffer.from(png, "base64"));
    await fs.writeFile(document, "XIGRA regression fixture");
    await app.evaluate(({ dialog }, filePaths) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths });
    }, [picture, document]);
    await click("文件");
    await click("导入文件");
    const rows = reopened.locator(".file-row");
    await expect(rows).toHaveCount(2);
    const filter = reopened.getByRole("combobox", { name: "文件分类" });
    await filter.focus();
    await filter.press("Enter");
    const list = reopened.getByRole("listbox");
    await expect(list).toBeVisible();
    const filterBounds = await filter.boundingBox(), listBounds = await list.boundingBox();
    assert.ok(Math.abs(filterBounds.width - listBounds.width) < 16);
    await reopened.keyboard.press("ArrowDown");
    await reopened.keyboard.press("Enter");
    await expect(filter).toContainText("图片");
    await expect(filter).toBeFocused();
    await expect(rows).toHaveCount(1);
    await filter.click();
    await expect(list).toBeVisible();
    await expect(reopened.getByRole("option", { name: "图片", exact: true })).toHaveAttribute("aria-selected", "true");
    const menuShot = output && path.join(output, "file-filter.png");
    if (menuShot) await reopened.screenshot({ path: menuShot, animations: "disabled" });
    await reopened.keyboard.press("Escape");
    await expect(filter).toBeFocused();
    await expect(reopened.getByRole("dialog", { name: "文件" })).toBeVisible();
    const preview = reopened.getByRole("button", { name: "预览 交互稿-横向示意图.png" });
    await preview.click();
    await expect(reopened.locator(".file-preview > img")).toBeVisible();
    if (output) await reopened.screenshot({ path: path.join(output, "file-preview.png"), animations: "disabled" });
    await reopened.keyboard.press("Escape");
    await expect(preview).toBeFocused();
    await click("放入面板");
    await click("面板文件");
    await click("移出面板");
    await expect(rows).toHaveCount(0);
    await click("中转站");
    await expect(rows).toHaveCount(1);
    const more = reopened.getByRole("button", { name: "交互稿-横向示意图.png的更多操作" });
    await more.press("Enter");
    await reopened.getByRole("menuitem", { name: "重命名副本" }).click();
    await expect(reopened.getByRole("textbox", { name: "新文件名" })).toBeFocused();
    await reopened.keyboard.press("Escape");
    await expect(more).toBeFocused();
    await more.click();
    await reopened.getByRole("menuitem", { name: "移入回收站" }).click();
    await click("回收站");
    await click("恢复");
    assert.deepEqual(await fs.readFile(picture), Buffer.from(png, "base64"));

    await reopened.emulateMedia({ reducedMotion: "reduce" });
    await reopenedWindow.evaluate(win => { win.setMinimumSize(350, 460); win.setContentSize(390, 560); });
    await click("中转站");
    await expect(preview).toBeVisible();
    await expect(reopened.locator(".lagoon-files")).toHaveCSS("transition-duration", "0s");
    await expect(rows.first()).toHaveCSS("transition-duration", "0s");
    await filter.click();
    const boundsAt390 = await list.boundingBox();
    assert.ok(boundsAt390.x >= 0 && boundsAt390.x + boundsAt390.width <= 390);
    await reopened.getByRole("option", { name: "所有类型", exact: true }).click();
    await expect(rows).toHaveCount(2);
    await click("关闭文件");
    await click("切换主题");
    await click("文件");
    await expect(rows).toHaveCount(2);
    if (output) await reopened.screenshot({ path: path.join(output, "files-narrow.png"), animations: "disabled" });
    console.log("PASS Electron: centered and persisted native/canvas bounds, retained scroll and draft across tabs, image preview, keyboard/mouse filter, rename cancel, references/trash/source safety, 390px and reduced motion");
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith("xigra-interaction-"))
      await fs.rm(target, { recursive: true, force: true });
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
