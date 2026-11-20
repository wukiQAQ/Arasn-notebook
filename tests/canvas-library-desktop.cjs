const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createStore } = require("../desktop/server.cjs");
const { planCanvasMigration } = require("../desktop/engines/canvas-migration.cjs");

(async () => {
  const root = path.resolve(__dirname, "..");
  const data = await fs.mkdtemp(path.join(root, ".runtime", "multi-canvas-"));
  const output = path.resolve(root, process.env.ARASN_CANVAS_SHOTS || "docs/screenshots/multi-canvas");
  const store = createStore(path.join(data, "board.json"));
  const seed = (text, x, y) => store.apply({ id: randomUUID(), opId: randomUUID(), expected: 0, value: {
    type: "text", text, x, y, color: "#263449", width: 290, height: 155,
    topology: { x: x - 700, y: y - 300, width: 270, height: 120, kind: "note", status: "open" },
  } });
  seed("设计评审\n定稿前核对信息层级和留白。", 610, 350);
  seed("交付范围\n确认文件、原型与反馈。", 935, 560);
  const seeded = store.dump();
  const plan = planCanvasMigration(seeded);
  for (const operation of plan.operations) store.apply(operation);
  store.apply({ id: randomUUID(), opId: randomUUID(), expected: 0, value: {
    type: "canvas-edge", roomId: seeded.roomId, canvasId: seeded.roomId,
    fromNodeId: plan.operations[0].id, toNodeId: plan.operations[1].id, label: "交付前确认", direction: "forward",
  } });
  await fs.mkdir(output, { recursive: true });
  const executablePath = process.env.ARASN_CANVAS_EXE;
  const app = await electron.launch({ executablePath, args: executablePath ? [] : ["."], cwd: root, env: { ...process.env, ARASN_DATA_DIR: data } });
  try {
    const page = await app.firstWindow();
    page.on("pageerror", err => console.error(err));
    await page.getByRole("button", { name: "我的随手页", exact: true }).waitFor();
    const size = async (width, height) => {
      await app.evaluate(({ BrowserWindow }, [w, h]) => {
        const window = BrowserWindow.fromId(BrowserWindow.getFocusedWindow()?.id) ?? BrowserWindow.getAllWindows().find(win => win.isVisible());
        window.setMinimumSize(1, 1);
        window.setSize(w, h, false);
      }, [width, height]);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
    };
    await size(1440, 850);
    const library = page.getByRole("button", { name: "我的随手页", exact: true });
    await library.click();
    const defaultPage = page.getByRole("button", { name: "打开 默认工作页", exact: true });
    await expect(defaultPage).toBeVisible({ timeout: 15000 });
    await expect(defaultPage.locator("img")).toBeVisible();
    await page.getByRole("button", { name: "新建画布", exact: true }).click();
    await page.getByRole("textbox", { name: "画布名称" }).fill("项目草稿");
    await page.screenshot({ path: path.join(output, "create.png") });
    await page.getByRole("button", { name: "创建并打开" }).click();
    await expect(page.getByRole("button", { name: "切换画布，当前 项目草稿" })).toBeVisible();
    await expect(page.locator(".canvas-note-title")).toHaveCount(0);
    await page.getByRole("button", { name: "放大", exact: true }).click();
    await page.getByRole("button", { name: "写一张便笺", exact: true }).click();
    await page.getByRole("textbox", { name: "便签完整正文" }).fill("草稿内容");
    await page.getByRole("button", { name: "关闭便签详情" }).click();
    await library.click();
    await expect(page.getByRole("button", { name: "打开 项目草稿" }).locator("img")).toBeVisible();
    await page.screenshot({ path: path.join(output, "workspace-library.png") });
    const search = page.getByRole("textbox", { name: "搜索画布" });
    await search.fill("项目");
    await expect(defaultPage).toHaveCount(0);
    await page.getByRole("button", { name: "列表", exact: true }).click();
    await expect(page.locator(".canvas-library-grid")).toHaveAttribute("data-list", "true");
    await search.fill("");
    await page.getByRole("button", { name: "网格", exact: true }).click();
    await defaultPage.click();
    await expect(page.locator(".canvas-note-title")).toHaveCount(2);
    await page.getByRole("button", { name: "切换画布，当前 默认工作页" }).click();
    await expect(page.getByRole("menuitem", { name: "项目草稿", exact: true })).toBeVisible();
    await page.screenshot({ path: path.join(output, "switcher.png") });
    await page.getByRole("menuitem", { name: "项目草稿", exact: true }).click();
    await expect(page.locator(".canvas-note-title")).toHaveText("草稿内容");
    await expect(page.getByRole("button", { name: "重置视图为100%" })).toHaveText("96%");
    await page.getByRole("button", { name: "分享当前画布" }).click();
    await expect(page.getByRole("dialog", { name: "分享画布" })).toBeVisible();
    await page.screenshot({ path: path.join(output, "share.png") });
    const panel = page.getByRole("dialog", { name: "分享画布" });
    const start = panel.getByRole("button", { name: "开启局域网分享" });
    if (await start.isEnabled()) {
      await start.click();
      await expect(panel.getByRole("button", { name: "停止分享" })).toBeVisible();
      const link = new URL(await panel.getByRole("textbox", { name: "分享链接" }).inputValue());
      const endpoint = new URL("/api/board", link);
      const headers = { Authorization: "Bearer " + link.hash.slice(1) };
      const response = await fetch(endpoint, { headers });
      assert.equal(response.status, 200);
      const snapshot = await response.json();
      assert.equal(snapshot.name, "项目草稿");
      assert.equal(snapshot.mode, "view");
      assert.equal(snapshot.objects.length, 1);
      assert.equal(snapshot.objects[0].text, "正文未共享");
      await panel.getByRole("button", { name: "停止分享" }).click();
      await expect(start).toBeVisible();
      await assert.rejects(fetch(endpoint, { headers }));
    }
    const packagePath = path.join(data, "project.arasn-canvas");
    await app.evaluate(({ dialog }, filename) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: filename });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filename] });
    }, packagePath);
    await panel.getByRole("button", { name: "导出画布包", exact: true }).click();
    const exporter = page.getByRole("dialog", { name: "导出画布包" });
    await exporter.getByRole("checkbox", { name: "包含引用便签的正文" }).check();
    await exporter.getByRole("button", { name: "导出画布包", exact: true }).click();
    await expect(exporter).toHaveCount(0);
    const pack = JSON.parse(await fs.readFile(packagePath, "utf8"));
    assert.equal(pack.records[0].text, "草稿内容");
    pack.canvas.name = "重新导入的草稿";
    await fs.writeFile(packagePath, JSON.stringify(pack), "utf8");
    await library.click();
    await page.getByRole("button", { name: "导入画布包" }).click();
    await expect(page.getByRole("button", { name: "切换画布，当前 重新导入的草稿" })).toBeVisible();
    await expect(page.locator(".canvas-note-title")).toHaveText("草稿内容");
    await library.click();
    const more = page.getByRole("button", { name: "重新导入的草稿的更多操作" });
    await page.getByRole("button", { name: "打开 重新导入的草稿" }).hover();
    await more.click();
    await page.getByRole("menuitem", { name: "移至回收站" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "移至回收站" }).click();
    await expect(page.getByRole("button", { name: "打开 重新导入的草稿" })).toHaveCount(0);
    await page.getByRole("button", { name: "回收站", exact: true }).click();
    await page.locator(".canvas-library-card").hover();
    await more.click();
    await page.getByRole("menuitem", { name: "恢复" }).click();
    await expect(more).toHaveCount(0);
    await page.getByRole("button", { name: "打开关系画布", exact: true }).click();
    await expect(page.getByRole("button", { name: "打开 默认关系图" }).locator("img")).toBeVisible();
    await page.getByRole("button", { name: "新建画布", exact: true }).click();
    await page.getByRole("textbox", { name: "画布名称" }).fill("客户访谈");
    await page.getByRole("button", { name: "创建并打开" }).click();
    await expect(page.getByRole("button", { name: "切换画布，当前 客户访谈" })).toBeVisible();
    await expect(page.locator("[data-topology-node]")).toHaveCount(0);
    await page.getByRole("button", { name: "新建节点" }).click();
    await page.getByRole("menuitem", { name: "问题", exact: true }).click();
    await expect(page.locator("[data-topology-node]")).toHaveCount(1);
    await page.evaluate(() => window.desktop.settings({ theme: "dark" }));
    await page.reload();
    await page.getByRole("button", { name: "打开关系画布", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.getByRole("button", { name: "打开 默认关系图" }).locator("img")).toBeVisible();
    await page.screenshot({ path: path.join(output, "relation-library.png") });
    await size(390, 770);
    await expect.poll(() => page.locator(".canvas-library").evaluate(el => el.scrollWidth - el.clientWidth)).toBe(0);
    await page.screenshot({ path: path.join(output, "narrow.png") });
    await page.evaluate(async () => {
      for (let i = 0; i < 75; i++)
        await window.desktop.canvas.catalog("create", { type: "relation", name: "批量画布 " + i });
    });
    await page.getByRole("button", { name: "我的随手页", exact: true }).click();
    await page.getByRole("button", { name: "打开关系画布", exact: true }).click();
    await expect(page.locator(".canvas-library-card")).toHaveCount(77);
    await page.getByRole("textbox", { name: "搜索画布" }).fill("批量画布 74");
    await expect(page.locator(".canvas-library-card")).toHaveCount(1);
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(w => w.isVisible()).length), 1);
    console.log("Electron multi-canvas migration, previews, navigation, viewport, themes and narrow layout passed");
  } finally {
    await app.close();
    assert.equal(path.dirname(data), path.join(root, ".runtime"));
    await fs.rm(data, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
