const { _electron: electron, chromium, expect } = require("@playwright/test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "arasn-panel-"));
  const env = { ...process.env, ARASN_DATA_DIR: directory, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  let application, browser;
  try {
    application = await electron.launch({
      executablePath: path.resolve(
        __dirname,
        "../release/ArasnNotebook-win32-x64/ArasnNotebook.exe",
      ),
      args: [],
      env,
    });
    const page = await application.firstWindow();
    await expect(
      page.getByRole("tab", { name: "打字", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await application.evaluate(
        ({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()[0].getBounds().width,
      ),
    ).toBe(520);
    const input = page.getByRole("textbox", { name: "便笺文字" });
    await expect(input).toBeEnabled();
    await input.fill("小窗写下的信息，切换后还在。");
    await page.getByRole("tab", { name: "画图", exact: true }).click();
    const rect = await page.getByTestId("quick-canvas").boundingBox();
    await page.mouse.move(rect.x + 50, rect.y + 70);
    await page.mouse.down();
    await page.mouse.move(rect.x + 150, rect.y + 120, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByTestId("quick-stroke")).toHaveCount(1);
    await page.getByRole("tab", { name: "打字", exact: true }).click();
    await expect(input).toHaveValue("小窗写下的信息，切换后还在。");
    await page.screenshot({ path: "docs/screenshots/quick-text.png" });
    await page.getByRole("tab", { name: "画图", exact: true }).click();
    await expect(page.getByTestId("quick-stroke")).toHaveCount(1);
    await page.screenshot({ path: "docs/screenshots/quick-draw.png" });
    await page.getByRole("button", { name: "传递 / 共享" }).click();
    await page.getByRole("button", { name: "开启共享", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "停止共享", exact: true }),
    ).toBeEnabled();
    const shared = await page.evaluate(() => window.desktop.info());
    const link = new URL(shared.links[0]);
    browser = await chromium.launch({ headless: true });
    const peer = await browser.newPage();
    await peer.goto(`http://127.0.0.1:${link.port}/${link.hash}`);
    await expect(peer.getByRole("textbox", { name: "便笺文字" })).toHaveValue(
      "小窗写下的信息，切换后还在。",
    );
    await expect(peer.getByTestId("stroke")).toHaveCount(1);
    await peer
      .getByRole("textbox", { name: "便笺文字" })
      .fill("另一台客户端的回复");
    await page.getByRole("button", { name: "关闭弹窗" }).click();
    await page.getByRole("tab", { name: "打字", exact: true }).click();
    await expect(input).toHaveValue("另一台客户端的回复", { timeout: 10000 });
    await page.getByRole("button", { name: "展开完整页面" }).click();
    await expect(page.getByTestId("stroke")).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: "便笺文字" })).toHaveValue(
      "另一台客户端的回复",
    );
    await page.getByRole("button", { name: "收回小窗" }).click();
    await expect(input).toHaveValue("另一台客户端的回复");
    console.log(
      "PASS: compact window, text/drawing switches, full-page consistency, two-client bidirectional sharing",
    );
  } finally {
    if (browser) await browser.close();
    if (application) await application.close();
    if (path.dirname(directory) !== os.tmpdir())
      throw new Error("Unexpected cleanup path");
    fs.rmSync(directory, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
