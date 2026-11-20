const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { captureNativeWindow } = require("./helpers/native-window-capture.cjs");

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-record-toolbar-"));
  const output = path.resolve(process.env.ARASN_SCREENSHOTS || "docs/screenshots/record-toolbar");
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({
      theme: "dark", sidebar: { mode: "full", width: 200 },
      appearance: { preset: "arasn", accent: "#DB799F", background: null, foreground: null, font: "system", scale: "standard" },
    }));
    app = await electron.launch({ args: [".", "--force-device-scale-factor=1"], env });
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(6000);
    await win.evaluate(w => { w.show(); w.focus(); });
    const workspace = page.locator(".xigra-record-workspace");
    const toolbar = workspace.locator(".xigra-note-heading");
    const library = workspace.locator("#record-library");
    const toggle = toolbar.locator(".record-layout-toggle");
    const create = toolbar.locator(".page-new-note");
    const copy = toolbar.getByRole("button", { name: "复制正文", exact: true });
    const more = toolbar.getByRole("button", { name: "管理当前便笺", exact: true });
    const help = toolbar.getByRole("button", { name: "使用说明", exact: true });
    const title = workspace.getByRole("textbox", { name: "便签标题" });
    const editor = workspace.locator(".xigra-record-editor");
    const sample = "梳理今天的想法，补上待查资料。\n\n下次讨论前，把整理好的内容加入关系画布。";
    const saved = () => expect(workspace.locator(".save-state")).toHaveText("已保存");
    async function resize(width, height) {
      await win.evaluate((w, size) => w.setSize(...size), [width, height]);
      await expect.poll(() => win.evaluate(w => w.getSize())).toEqual([width, height]);
    }
    async function settle() {
      await page.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        await Promise.allSettled(document.getAnimations().filter(a => a.effect?.getTiming().iterations !== Infinity).map(a => a.finished));
      });
    }
    async function screenshot(name) {
      await page.mouse.move(8, 18);
      await expect(page.getByRole("tooltip")).toHaveCount(0);
      await expect(page.locator(".app-notification")).toBeHidden();
      await settle();
      const shot = await captureNativeWindow(app, page, path.join(output, `${name}.png`));
      const [width, height] = await win.evaluate(w => w.getSize());
      assert.ok(shot.width >= width - 8 && shot.height >= height - 8, name);
    }
    async function verifyWorkpageSwitch() {
      await page.evaluate(() => {
        window.workpageFrames = new Promise(resolve => {
          const section = document.querySelector(".free-workspace");
          const sidebar = document.querySelector("#workbench-sidebar");
          const tools = section.querySelector(".toolbar");
          const frames = [];
          let firstPaint;
          function sample(time) {
            if (!section.hidden) {
              firstPaint ??= time;
              frames.push([sidebar.offsetWidth, section.dataset.toolbarMode, tools.offsetWidth, tools.offsetHeight, tools.offsetLeft, tools.offsetTop]);
              if (time - firstPaint >= 320) return resolve(frames);
            }
            requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        });
      });
      await page.getByRole("button", { name: "我的随手页", exact: true }).click();
      const frames = await page.evaluate(() => window.workpageFrames);
      assert.ok(frames.length > 1);
      assert.deepEqual(frames[0].slice(0, 2), [200, "full"]);
      assert.ok(frames[0][4] > 100, "the saved right-side dock is applied on the first frame");
      assert.ok(frames.every(frame => frame.every((value, index) => value === frames[0][index])),
        JSON.stringify([...new Set(frames.map(frame => JSON.stringify(frame)))]));
      await page.getByRole("button", { name: "返回上一页", exact: true }).click();
      await expect(title).toBeVisible();
    }
    async function layout({ compact = false } = {}) {
      await page.mouse.move(8, 18);
      await settle();
      await expect(workspace.locator(".page-new-note")).toHaveCount(1);
      await expect(library.locator(".page-new-note")).toHaveCount(0);
      await expect(toolbar.getByRole("button")).toHaveCount(5);
      await expect(toggle).toHaveText("");
      const metrics = await toolbar.evaluate(bar => {
        const rect = element => element.getBoundingClientRect().toJSON();
        return {
          bar: rect(bar), paper: rect(bar.parentElement), title: rect(bar.nextElementSibling),
          buttons: [...bar.querySelectorAll("button")].map(button => ({
            ...rect(button), radius: getComputedStyle(button).borderRadius,
          })),
          names: [...bar.querySelectorAll(".xigra-note-actions button")].map(button => button.getAttribute("aria-label")),
          overflow: document.documentElement.scrollWidth > innerWidth,
          accent: getComputedStyle(bar).getPropertyValue("--ui-action").trim(),
          primary: getComputedStyle(bar.querySelector(".page-new-note")).backgroundColor,
        };
      });
      const [libraryButton, helpButton, newNote, copyButton, moreButton] = metrics.buttons;
      assert.deepEqual(metrics.names, ["写一张便笺", "复制正文", "管理当前便笺"]);
      assert.equal(metrics.bar.height, 54);
      assert.ok(metrics.title.top > metrics.bar.bottom && !metrics.overflow);
      for (const button of metrics.buttons) {
        assert.equal(button.height, 36);
        assert.equal(button.top, libraryButton.top);
        assert.equal(button.radius, newNote.radius);
        assert.ok(button.left >= metrics.bar.left && button.right <= metrics.bar.right);
      }
      for (const button of [libraryButton, helpButton, copyButton, moreButton]) assert.equal(button.width, 36);
      assert.ok(compact ? newNote.width === 36 : newNote.width > 36);
      assert.ok(newNote.left >= helpButton.right + 8);
      for (const [start, end] of [[libraryButton, helpButton], [newNote, copyButton], [copyButton, moreButton]]) {
        assert.equal(end.left - start.right, 8);
      }
      const accentRgb = metrics.accent.slice(1).match(/../g).map(channel => parseInt(channel, 16));
      assert.equal(metrics.primary, `rgb(${accentRgb.join(", ")})`);
      return { right: metrics.buttons.slice(2).map(button => button.right), inset: metrics.paper.right - moreButton.right };
    }

    await expect(title).toBeEnabled();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    assert.equal(await page.evaluate(() => window.desktop.info().then(info => info.appearance.accent)), "#DB799F");
    await page.evaluate(() => localStorage.setItem("arasn-toolbar-dock-v1", JSON.stringify({
      mode: "free", side: "right", x: 1, y: 0,
    })));
    await page.reload();
    await expect(title).toBeEnabled();
    await resize(1280, 760);
    await verifyWorkpageSwitch();
    for (const [name, body] of [
      ["阅读清单", "整理这一周收藏的文章和书目。"],
      ["会议准备", "核对会议议程，整理需要跟进的问题。"],
      ["产品讨论与后续安排", sample],
    ]) {
      await create.click();
      await title.fill(name);
      await editor.fill(body);
      await saved();
    }
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const expanded = await layout();
    await screenshot("dark-expanded");
    await toggle.hover();
    await expect(page.getByRole("tooltip")).toHaveText("收起便签库");
    await editor.evaluate(element => { element.focus(); element.setSelectionRange(2, 5); });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(editor).toBeFocused();
    assert.deepEqual(await editor.evaluate(el => [el.selectionStart, el.selectionEnd]), [2, 5]);
    await editor.evaluate(el => el.setSelectionRange(5, 5));
    assert.deepEqual(await layout(), expanded);
    await screenshot("dark-collapsed");
    await verifyWorkpageSwitch();
    await toggle.hover();
    await expect(page.getByRole("tooltip")).toHaveText("展开便签库");

    // Exercise the native IPC handler while preserving the user's system clipboard.
    await app.evaluate(({ clipboard }) => { clipboard.writeText = text => { globalThis.recordToolbarCopiedText = text; }; });
    await copy.click();
    await expect(page.getByText("已复制", { exact: true })).toBeVisible();
    assert.equal(await app.evaluate(() => globalThis.recordToolbarCopiedText), sample);
    await more.click();
    await page.getByRole("menuitem", { name: "置顶便笺", exact: true }).click();
    await more.click();
    await expect(page.getByRole("menuitem", { name: "取消置顶", exact: true })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "删除便笺", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await help.click();
    await expect(page.getByText("编辑便签", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await create.click();
    await expect(editor).toHaveValue("");
    await expect(copy).toBeDisabled();
    await expect(more).toBeDisabled();
    assert.deepEqual(await layout(), expanded);
    await toggle.click();
    await library.getByRole("button", { name: /产品讨论与后续安排/ }).click();
    await expect(editor).toHaveValue(sample);

    await resize(800, 600);
    await layout();
    await resize(520, 420);
    await expect(workspace).toHaveAttribute("data-library-overlay", "true");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await layout({ compact: true });
    await resize(520, 510);
    const narrow = await layout({ compact: true });
    await screenshot("dark-narrow");
    await create.hover();
    await expect(page.getByRole("tooltip")).toHaveText("新建便签");
    await toggle.focus();
    await page.keyboard.press("Tab");
    await expect(help).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(toggle).toBeFocused();
    assert.equal(await toggle.evaluate(el => getComputedStyle(el).outlineStyle), "solid");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(library.getByRole("searchbox")).toBeVisible();
    assert.deepEqual(await layout({ compact: true }), narrow);
    await expect(copy).toBeEnabled();
    await copy.click({ trial: true });
    await screenshot("dark-narrow-expanded");
    await toggle.press("Enter");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(library.getByRole("searchbox")).toBeHidden();
    await toggle.click();
    await create.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue("");
    await toggle.click();
    await library.getByRole("button", { name: /产品讨论与后续安排/ }).click();
    await expect(editor).toHaveValue(sample);

    await page.evaluate(() => window.desktop.settings({ theme: "light" }));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await layout({ compact: true });
    await screenshot("light-narrow");
    await resize(1280, 760);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    assert.deepEqual(await layout(), expanded);
    await screenshot("light-expanded");
    assert.deepEqual(errors, []);
    console.log(`PASS native Electron record toolbar, 1280×760 / 800×600 / 520×510 / 520×420. Screenshots: ${output}`);
  } finally {
    if (app) await app.close();
    await fs.rm(data, { recursive: true, force: true });
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
