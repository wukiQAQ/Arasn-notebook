import { test, expect, type Page } from "@playwright/test";
test("two clients share text and mouse drawing, recover offline edits and preserve conflicts", async ({
  browser,
}) => {
  const a = await browser.newContext(),
    b = await browser.newContext();
  const page = await a.newPage(),
    peer = await b.newPage();
  const url = "http://127.0.0.1:47839/#ui-test-token";
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(url);
  await peer.goto(url);
  const note = (page: Page, index = 0) => page.locator(".spatial-note").nth(index);
  const fillDetails = async (page: Page, text: string) => {
    await page.getByRole("textbox", { name: "便签完整正文" }).fill(text);
    await page.getByRole("button", { name: "关闭便签详情" }).click();
  };
  const editNote = async (page: Page, index: number, text: string) => {
    await note(page, index).getByRole("button", { name: "查看完整便签" }).click();
    await fillDetails(page, text);
  };
  const title = (page: Page, index = 0) => note(page, index).locator(".canvas-note-title");
  await page.getByRole("button", { name: "写一张便笺" }).click();
  await fillDetails(page, "周一例会\n确认本周交付与分工");
  await expect(title(peer)).toHaveText("周一例会", { timeout: 10000 });
  await expect(note(peer).locator(".canvas-note-summary")).toHaveText("确认本周交付与分工");
  await page.getByRole("button", { name: "自由绘图", exact: true }).click();
  const paper = await page.locator(".paper-scroll").boundingBox();
  await page.mouse.move(paper!.x + 380, paper!.y + 120);
  await page.mouse.down();
  await page.mouse.move(paper!.x + 460, paper!.y + 160, { steps: 10 });
  await page.mouse.up();
  await expect(peer.getByTestId("stroke")).toHaveCount(1, { timeout: 10000 });
  await page.getByRole("button", { name: "选择与拖动", exact: true }).click();
  await a.setOffline(true);
  await editNote(page, 0, "离线整理的会议重点");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("arasn-recovery"))).toContain("离线整理的会议重点");
  // Browser reload needs the host again; the outbox survives the page being recreated.
  await a.setOffline(false);
  await page.goto(url);
  await expect(title(peer)).toHaveText("离线整理的会议重点", { timeout: 12000 });
  await a.setOffline(true);
  await editNote(page, 0, "本机冲突副本");
  await editNote(peer, 0, "同事最新修改");
  await expect(peer.locator(".save-state")).toHaveText("已保存");
  await a.setOffline(false);
  await expect(
    page.getByRole("button", { name: /恢复 1 条本机改动/ }),
  ).toBeVisible({ timeout: 12000 });
  await expect(title(page)).toHaveText("同事最新修改");
  await page.getByRole("button", { name: /恢复 1 条本机改动/ }).click();
  await expect(peer.locator(".spatial-note")).toHaveCount(2, {
    timeout: 12000,
  });
  await page.getByRole("button", { name: "写一张便笺" }).click();
  await fillDetails(page, "随手记下，再一起完善。\n文字和草图都在这一页。");
  await expect(page.locator(".save-state")).toHaveText("已保存");
  const handle = page.locator(".note-handle").nth(1);
  const before = await handle.boundingBox();
  await page.mouse.move(before!.x + 30, before!.y + 8);
  await page.mouse.down();
  await page.mouse.move(before!.x + 260, before!.y + 180, { steps: 10 });
  await page.mouse.up();
  await expect
    .poll(async () => (await handle.boundingBox())!.x)
    .toBeGreaterThan(before!.x + 150);
  await editNote(page, 0, "周一例会 · 本周重点\n确认产品原型与交付时间");
  await editNote(page, 1, "待办清单\n□ 整理会议纪要\n□ 和同事确认方案");
  await page.getByRole("button", { name: "选择与拖动", exact: true }).click();
  const scroll = page.locator(".paper-scroll");
  const beforePan = await page.locator(".paper").evaluate(el => new DOMMatrix(getComputedStyle(el).transform).e);
  const blank = await scroll.evaluate(el => {
    const r = el.getBoundingClientRect();
    for (let y = r.top + 60; y < r.bottom - 60; y += 40) for (let x = r.left + 60; x < r.right - 60; x += 40) {
      const target = document.elementFromPoint(x, y);
      if (target?.classList.contains('paper-scroll')) return { x, y };
    }
    throw new Error('No blank paper point');
  });
  const strokesBeforePan = await page.locator(".paper svg path").count();
  await page.mouse.move(blank.x, blank.y); await page.mouse.down(); await page.mouse.move(blank.x - 50, blank.y - 40, { steps: 8 }); await page.mouse.up();
  await expect.poll(() => page.locator(".paper").evaluate(el => new DOMMatrix(getComputedStyle(el).transform).e)).toBeLessThan(beforePan - 40);
  expect(await page.locator(".paper svg path").count()).toBe(strokesBeforePan);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "截图 / 导出", exact: true }).click();
  await page.getByRole("button", { name: "生成预览", exact: true }).click();
  await page.getByRole("button", { name: "保存 PNG", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^Arasn-自由画布-.*-1x\.png$/);
  await page.getByRole("button", { name: "关闭截图导出", exact: true }).click();
  await expect(page.locator(".save-state")).toHaveText("已保存");
  await page.screenshot({ path: "test-results/office-board.png" });
  expect(errors).toEqual([]);
  await a.close();
  await b.close();
});
