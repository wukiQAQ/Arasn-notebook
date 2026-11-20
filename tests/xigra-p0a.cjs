const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const root = path.resolve(__dirname, "..");

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "xigra-p0a-"));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ args: ["."], cwd: root, env });
  let app;
  function savedTexts() {
    const db = new DatabaseSync(path.join(data, "workspace.sqlite"), { readOnly: true });
    try {
      return db.prepare("SELECT value FROM elements").all().map(row => JSON.parse(row.value)).filter(value => value?.type === "text").map(value => value.text);
    } finally { db.close(); }
  }
  try {
    await fs.writeFile(path.join(data, "settings.json"), JSON.stringify({ shortcut: "Control+Alt+F13" }));
    app = await launch();
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const show = () => win.evaluate(window => {
      window.show();
      window.focus();
      window.webContents.send("app:focus");
    });
    await show();
    const editor = page.getByRole("textbox", { name: "便笺文字", exact: true });
    const status = page.locator(".xigra-save-state");
    await expect(status).toHaveText("等待输入");
    const requests = [];
    let allow = false;
    await page.route("**/api/ops", async route => {
      const op = route.request().postDataJSON();
      requests.push({ id: op.id, opId: op.opId, text: op.value.text });
      if (requests.length === 1) {
        // Forward the POST to the actual desktop API, then drop its response to the renderer.
        const response = await route.fetch({ maxRetries: 0 });
        assert.equal(response.status(), 200);
      }
      if (allow) await route.continue();
      else await route.abort("connectionreset");
    });
    await editor.fill("已提交但回执丢失");
    await expect(status).toHaveText("已暂存 · 待同步", { timeout: 12000 });
    assert.deepEqual(savedTexts(), ["已提交但回执丢失"]);
    await editor.fill("丢回执后继续写的最新稿");
    await expect.poll(() => page.evaluate(async () => (await window.desktop.recovery()).pending.at(-1)?.value?.text)).toBe("丢回执后继续写的最新稿");
    allow = true;
    await page.getByRole("button", { name: "重试保存", exact: true }).click();
    await expect(status).toHaveText("已保存");
    assert.deepEqual(savedTexts(), ["丢回执后继续写的最新稿"]);
    assert.ok(requests.filter(op => op.opId === requests[0].opId).length >= 2);
    assert.ok(requests.filter(op => op.opId === requests[0].opId).every(op => op.text === "已提交但回执丢失"));
    assert.ok(requests.some(op => op.id === requests[0].id && op.opId !== requests[0].opId && op.text === "丢回执后继续写的最新稿"));

    allow = false;
    const draft = "恢复副本确认后才强退的草稿";
    await editor.fill(draft);
    await expect(status).toHaveText("已暂存 · 待同步", { timeout: 12000 });
    await win.evaluate(window => window.close());
    await expect.poll(() => win.evaluate(window => window.isVisible())).toBe(false);
    await show();
    await expect(editor).toBeFocused();
    await expect(editor).toHaveValue(draft);
    assert.deepEqual(savedTexts(), ["丢回执后继续写的最新稿"]);
    const exited = new Promise(resolve => app.process().once("exit", resolve));
    await app.evaluate(({ app }) => setTimeout(() => app.exit(0), 20));
    await exited;
    app = null;

    app = await launch();
    const restarted = await app.firstWindow();
    await expect(restarted.getByRole("textbox", { name: "便笺文字", exact: true })).toHaveValue(draft);
    await expect(restarted.locator(".xigra-save-state")).toHaveText("已保存");
    assert.deepEqual(savedTexts(), [draft]);
    console.log("PASS Electron + SQLite: lost HTTP acknowledgement, latest text retry, hide/reopen, durable recovery after forced exit");
  } finally {
    if (app) await app.close();
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith("xigra-p0a-"))
      await fs.rm(target, { recursive: true, force: true });
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
