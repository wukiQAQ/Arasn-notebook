const { _electron: electron, expect } = require("@playwright/test");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");
const { createStore } = require("../desktop/server.cjs");
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-core-"));
  const data = path.join(root, "data");
  await fs.mkdir(data);
  const retainedRecordId = randomUUID();
  createStore(path.join(data, "board.json")).apply({ id: retainedRecordId, opId: randomUUID(), expected: 0,
    value: { type: "text", text: "清空文件区必须保留的原记录", color: "#263449", x: 20, y: 20 } });
  const boardState = () => {
    const db = new DatabaseSync(path.join(data, "workspace.sqlite"), { readOnly: true });
    try { return JSON.parse(db.prepare("SELECT state FROM panels WHERE id='default'").get().state); }
    finally { db.close(); }
  };
  await fs.writeFile(
    path.join(data, "settings.json"),
    JSON.stringify({ shortcut: "Control+Alt+F13" }),
  );
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () =>
    electron.launch({
      ...(process.argv.includes("--packaged")
        ? {
            executablePath: process.env.ARASN_TEST_EXE || path.resolve(
              __dirname,
              `../release/ArasnNotebook-${require("../package.json").version}-win32-x64/ArasnNotebook.exe`,
            ),
            args: [],
          }
        : { args: ["."] }),
      cwd: path.resolve(__dirname, ".."),
      env,
    });
  const openFiles = async (page) => {
    await page.getByRole("button", { name: "打开工作区", exact: true }).click();
    await page.getByRole("button", { name: "文件", exact: true }).click();
  };
  const returnToQuickNote = async (page) => {
    await page.getByRole("button", { name: "返回工作区", exact: true }).click();
    await page.getByRole("button", { name: "便笺列表", exact: true }).click();
    const list = page.getByRole("complementary", { name: "记录列表", exact: true });
    await list.getByRole("button", { name: /主动粘贴测试/ }).click();
    await page.getByRole("button", { name: "切换到便签区", exact: true }).click();
  };
  const pasteFile = async (page) => {
    const direct = page.getByRole("button", { name: "粘贴", exact: true });
    if (await direct.isVisible()) await direct.click();
    else {
      await page.getByRole("button", { name: "更多文件操作", exact: true }).click();
      await page.getByRole("menuitem", { name: "粘贴", exact: true }).click();
    }
  };
  let app;
  try {
    const sources = ["office.docx", "picture.png", "video.mp4"];
    for (const name of sources)
      await fs.writeFile(path.join(root, name), "user content " + name);
    const started = performance.now();
    app = await launch();
    let page = await app.firstWindow();
    await expect(page.getByRole("button", { name: "添加文件", exact: true })).toBeVisible();
    const startupMs = performance.now() - started;
    await page.evaluate(() => {
      const i = document.createElement("input");
      i.type = "file";
      i.multiple = true;
      i.id = "test-files";
      document.body.append(i);
    });
    await page
      .locator("#test-files")
      .setInputFiles(sources.map((n) => path.join(root, n)));
    await page.evaluate(() => {
      const dt = new DataTransfer();
      for (const f of document.querySelector("#test-files").files)
        dt.items.add(f);
      document.querySelector(".quick-panel").dispatchEvent(
        new DragEvent("drop", {
          dataTransfer: dt,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
    await expect(page.getByRole("status").filter({ hasText: "已存入 3 个文件" })).toBeVisible();
    await openFiles(page);
    await expect(page.locator(".file-row")).toHaveCount(3);
    await page.context().setOffline(true);
    const panelAction = page.getByRole("button", { name: "放入面板", exact: true }).first();
    if (await panelAction.isVisible()) await panelAction.click();
    else {
      await page.getByRole("button", { name: /的更多操作$/ }).first().click();
      await page.getByRole("menuitem", { name: "放入面板", exact: true }).click();
    }
    await page.getByRole("button", { name: "面板文件", exact: true }).click();
    await expect(page.locator(".file-row")).toHaveCount(1);
    const beforeClear = boardState();
    expect(beforeClear.items[retainedRecordId].value.text).toBe("清空文件区必须保留的原记录");
    await page.locator("summary").filter({ hasText: "恢复与数据检查" }).click();
    await page.getByRole("button", { name: "清空文件区", exact: true }).click();
    const clearDialog = page.getByRole("alertdialog", { name: "确认操作", exact: true });
    await expect(clearDialog).toContainText("即将清空文件区中的 1 个条目");
    await clearDialog.getByRole("button", { name: "取消", exact: true }).click();
    await expect(page.locator(".file-row")).toHaveCount(1);
    expect(boardState()).toEqual(beforeClear);
    await page.getByRole("button", { name: "清空文件区", exact: true }).click();
    await clearDialog.getByRole("button", { name: "确认清空", exact: true }).click();
    await expect(page.locator(".file-row")).toHaveCount(0);
    expect(boardState()).toEqual(beforeClear);
    await page.getByRole("button", { name: "撤销清空文件区", exact: true }).click();
    await expect(page.locator(".file-row")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "撤销清空文件区", exact: true })).toBeDisabled();
    expect(boardState()).toEqual(beforeClear);
    await page.getByRole("button", { name: "中转站", exact: true }).click();
    await expect(page.locator(".file-row")).toHaveCount(3);
    await page
      .getByRole("button", { name: /的更多操作$/ })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "移入回收站", exact: true }).click();
    await expect(page.locator(".file-row")).toHaveCount(2);
    await page.getByRole("button", { name: "回收站", exact: true }).click();
    await expect(page.locator(".file-row")).toHaveCount(1);
    await page.getByRole("button", { name: "恢复", exact: true }).click();
    await expect(page.locator(".file-row")).toHaveCount(0);
    await app.evaluate(async ({ clipboard, ClipboardItem }) => {
      globalThis.clipboardBefore = await Promise.all(
        (await clipboard.read()).filter(item => item.types.length > 0).map(
          async (item) =>
            new ClipboardItem(
              Object.fromEntries(
                await Promise.all(
                  item.types.map(async (type) => [
                    type,
                    await item.getType(type),
                  ]),
                ),
              ),
            ),
        ),
      );
    });
    await app.evaluate(
      async ({ clipboard }) => await clipboard.writeText("主动粘贴测试"),
    );
    await page.evaluate(() =>
      document.querySelector(".file-station").dispatchEvent(
        new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: new DataTransfer(),
        }),
      ),
    );
    await expect(page.locator(".file-message")).toContainText("文字已添加");
    await returnToQuickNote(page);
    await expect(page.getByRole("textbox", { name: "便笺文字" })).toHaveValue(
      "主动粘贴测试",
    );
    await openFiles(page);
    await page.getByRole("button", { name: "中转站", exact: true }).click();
    await app.evaluate(async ({ clipboard, ClipboardItem, nativeImage }) => {
      const image = nativeImage.createFromBitmap(
        Buffer.alloc(16 * 16 * 4, 255),
        { width: 16, height: 16 },
      );
      await clipboard.write([
        new ClipboardItem({
          "image/png": new Blob([image.toPNG()], { type: "image/png" }),
        }),
      ]);
    });
    await pasteFile(page);
    await expect(page.locator(".file-row")).toHaveCount(4);
    await expect(page.locator(".file-media img")).toHaveCount(1);
    await app.evaluate(
      async ({ clipboard, ClipboardItem }, source) => {
        await clipboard.write([
          new ClipboardItem({
            'electron application/osclipboard;format="FileNameW"': new Blob([
              Buffer.from(source + "\0", "utf16le"),
            ]),
          }),
        ]);
      },
      path.join(root, "office.docx"),
    );
    await pasteFile(page);
    await expect(page.locator(".file-row")).toHaveCount(5);
    await app.evaluate(async ({ clipboard }) => {
      if (globalThis.clipboardBefore.length)
        await clipboard.write(globalThis.clipboardBefore);
      else clipboard.clear();
    });
    const showApi = await app.evaluate(({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows()[0],
        samples = [];
      for (let i = 0; i < 30; i++) {
        const at = performance.now();
        w.showInactive();
        w.hide();
        samples.push(performance.now() - at);
      }
      samples.sort((a, b) => a - b);
      return {
        samples: 30,
        p95Ms: samples[28],
        scope:
          "native showInactive/hide calls; excludes key dispatch and paint",
      };
    });
    const metrics = await app.evaluate(({ app }) =>
      app.getAppMetrics().map((p) => ({
        type: p.type,
        memoryKiB: p.memory.workingSetSize,
        cpu: p.cpu.percentCPUUsage,
      })),
    );
    const durable = await page.evaluate(() => window.desktop.recovery());
    expect(JSON.stringify(durable)).toContain("主动粘贴测试");
    const exited = new Promise((resolve) =>
      app.process().once("exit", resolve),
    );
    await app.evaluate(({ app }) => {
      setTimeout(() => app.exit(0), 20);
    });
    await exited;
    app = null;
    app = await launch();
    page = await app.firstWindow();
    await openFiles(page);
    await expect(page.locator(".file-row")).toHaveCount(5);
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: "" });
    });
    await page.getByRole("button", { name: /的更多操作$/ }).first().click();
    await page.getByRole("menuitem", { name: "导出副本", exact: true }).click();
    await expect(page.locator(".file-message")).toContainText("已取消");
    const audit = await page.evaluate(() =>
      window.desktop.files.action("audit"),
    );
    expect(audit.missing).toEqual([]);
    expect(audit.corrupt).toEqual([]);
    await returnToQuickNote(page);
    await expect(page.getByRole("textbox", { name: "便笺文字" })).toHaveValue(
      "主动粘贴测试",
    );
    if (process.argv.includes("--screenshots")) {
      await openFiles(page);
      const output = path.resolve(__dirname, "../docs/screenshots/xigra-simple");
      await fs.mkdir(output, { recursive: true });
      for (const width of [1440, 520, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await page.screenshot({ path: path.join(output, `workbench-files-${width}.png`) });
      }
    }
    console.log(
      JSON.stringify({
        startupMs,
        metrics,
        showApi,
        dragImport: true,
        clearPreservesFiles: true,
        recycleRestore: true,
        clipboard: true,
        restart: true,
      }),
    );
  } finally {
    if (app) {
      try {
        await app.evaluate(async ({ clipboard }) => {
          if (globalThis.clipboardBefore?.length)
            await clipboard.write(globalThis.clipboardBefore);
        });
      } catch {}
      await app.close();
    }
    if (path.dirname(root) !== os.tmpdir()) throw new Error("Invalid cleanup");
    await fs.rm(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
