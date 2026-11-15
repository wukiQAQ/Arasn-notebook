const { selectOption } = require("./helpers/select-option.cjs");
const { _electron: electron, expect } = require("@playwright/test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createStore } = require("../desktop/server.cjs");

async function verify() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "arasn-topology-"));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: "1" };
  delete env.ELECTRON_RUN_AS_NODE;
  const legacyRecord = randomUUID();
  let legacy;
  const title = "项目问题清单";
  const store = createStore(path.join(data, "board.json"));
  store.apply({ id: legacyRecord, opId: randomUUID(), expected: 0,
    value: { type: "text", text: "原有便笺\n保留旧正文与纸面坐标", color: "#263449", x: 120, y: 140 } });
  let app;
  let page;
  let win;
  const button = name => page.getByRole("button", { name, exact: true });
  const node = id => page.locator(`[data-topology-node="${id}"]`);
  const editor = () => page.getByRole("textbox", { name: "节点正文" });
  const viewport = () => page.getByRole("region", { name: "节点画布" });
  const board = () => page.evaluate(async () => {
    const response = await fetch("/api/board", { headers: { Authorization: `Bearer ${sessionStorage.getItem("arasn-token")}` } });
    if (!response.ok) throw new Error(`board ${response.status}`);
    return (await response.json()).items;
  });
  const camera = () => page.evaluate(async () => (await window.desktop.info()).topologyViewport);
  const shot = async name => {
    if (process.env.ARASN_VISUAL_SHOTS) await page.screenshot({
      path: path.join(process.env.ARASN_VISUAL_SHOTS, `${name}.png`), animations: "disabled", scale: "css",
    });
  };
  const open = async () => {
    app = await electron.launch({ args: ["."], cwd: path.resolve(__dirname, ".."), env });
    page = await app.firstWindow();
    win = await app.browserWindow(page);
    await win.evaluate(window => { window.setContentSize(1440, 900); window.show(); window.focus(); });
    const expand = button("打开工作区");
    if (await expand.isVisible()) await expand.click();
    await win.evaluate(window => window.setContentSize(1440, 900));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(1440);
    await button("打开关系画布").click();
    const upgrade = button("备份并启用关系画布");
    if (await upgrade.isVisible()) { await expect(upgrade).toBeEnabled(); await upgrade.click(); }
    await expect(button("新建节点")).toBeEnabled();
    const state = await board();
    legacy = Object.entries(state).find(([, item]) => item.value?.type === "canvas-node" && item.value.contentRef.id === legacyRecord)[0];
  };
  const close = async () => {
    const child = app.process();
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Electron 未退出")), 9000);
        child.once("exit", () => { clearTimeout(timer); resolve(); });
      });
      await app.evaluate(({ app }) => setTimeout(() => app.quit(), 25)).catch(() => {});
      await done;
    }
    app = undefined;
  };
  const drag = async (start, dx, dy, button = "left") => {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down({ button });
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 9 });
    await page.mouse.up({ button });
  };
  try {
    await open();
    const navigation = page.getByRole("navigation", { name: "工作台导航" });
    await expect(button("打开关系画布")).toHaveAttribute("aria-current", "page");
    await expect(button("打开关系画布").locator("svg")).toHaveCount(1);
    await expect(navigation.locator(".lucide-radio")).toHaveCount(0);
    await expect(navigation.locator(".lucide-monitor-up")).toHaveCount(1);
    for (const icon of ["monitor-up"]) {
      await expect(navigation.locator(`.lucide-${icon}`)).toHaveAttribute("stroke-width", "1.65");
    }
    await shot("relations-navigation-desktop");
    await expect(node(legacy)).toHaveAccessibleName("便签，原有便笺");
    await page.getByRole("combobox", {name:"新节点类型",exact:true}).click();
    await expect(page.getByRole("listbox").getByRole("option")).toHaveCount(4);
    await page.keyboard.press("Escape");
    await node(legacy).focus();
    await node(legacy).press("Enter");
    await button("编辑节点").click();
    await editor().fill("原有便笺\n在拓扑中编辑");
    await selectOption(page, "节点类型", "idea");
    await expect.poll(async () => (await board())[legacy]?.value?.layout?.kind).toBe("idea");
    await button("返回工作页").click();
    await expect(page.getByRole("textbox", { name: "便笺文字" })).toHaveValue("原有便笺\n在拓扑中编辑");
    await button("打开关系画布").click();
    if (await button("关闭详情").isVisible()) await button("关闭详情").click();
    await expect(page.getByRole("complementary", { name: "节点详情" })).toHaveCount(0);
    const area = await viewport().boundingBox();
    await page.evaluate(()=>{window.__topologyPanEvents=[];for(const type of ['pointerdown','pointerup','pointercancel','blur'])window.addEventListener(type,e=>window.__topologyPanEvents.push({type,button:e.button,target:e.target?.className}),true);});
    await drag({ x: area.x + 50, y: area.y + 60 }, 400, 160, "middle");
    try { await expect.poll(async () => (await camera())?.x).toBeLessThan(0); }
    catch(error){console.error('topology pan diagnostics',await page.evaluate(async()=>({events:window.__topologyPanEvents,viewport:(await window.desktop.info()).topologyViewport,bindings:(await window.desktop.info()).triggers.bindings})));throw error;}
    await selectOption(page, "新节点类型", "question");
    await button("新建节点").click();
    await expect(editor()).toBeFocused();
    await editor().fill(`${title}\n哪些问题需要在评审前确认？`);
    await require('./helpers/select-option.cjs').selectOption(page, '处理状态', "active");
    const card = page.locator(".topology-node").filter({ hasText: title });
    await expect(card.getByText("进行中")).toBeVisible();
    const id = await card.getAttribute("data-topology-node");
    await expect.poll(async () => (await board())[id]?.value?.layout?.status).toBe("active");
    const created = (await board())[id].value.layout;
    assert(created.x < 0);
    await shot("topology-desktop-light");
    if (await button("关闭详情").isVisible()) await button("关闭详情").click();
    const box = await node(id).boundingBox();
    await drag({ x: box.x + 32, y: box.y + 30 }, -110, -75);
    await expect.poll(async () => (await board())[id]?.value?.layout.x).toBe(created.x - 110);
    await button("撤销节点操作").click();
    await expect.poll(async () => (await board())[id]?.value?.layout.x).toBe(created.x);
    await button("重做节点操作").click();
    await expect.poll(async () => (await board())[id]?.value?.layout.x).toBe(created.x - 110);

    const region = await viewport().boundingBox();
    const anchor = { x: region.x + region.width * .57, y: region.y + region.height * .39 };
    const before = await camera();
    await page.mouse.move(anchor.x, anchor.y);
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -200);
    await page.keyboard.up("Control");
    await expect.poll(async () => (await camera())?.zoom).toBeGreaterThan(before.zoom);
    const zoomed = await camera();
    const worldX = value => value.x + (anchor.x - region.x - region.width / 2) / value.zoom;
    assert(Math.abs(worldX(before) - worldX(zoomed)) < 1);
    await button("复位视图").click();
    await expect.poll(async () => (await camera())?.zoom).toBe(1);
    await button("小地图，适配节点").press("Enter");
    await expect.poll(async () => (await camera())?.x).not.toBe(0);
    await node(id).press("Enter");
    await button("编辑节点").click();
    await button("从画布移除").click();
    await expect.poll(async () => (await board())[id]?.value?.layout.hidden).toBe(true);
    await button("放大画布").click();
    await expect(button("复位视图")).not.toHaveText("100%");
    await expect.poll(async () => (await camera())?.zoom).not.toBe(1);
    const saved = await camera();
    await close();
    await open();
    await expect(button("复位视图")).toHaveText(`${Math.round(saved.zoom * 100)}%`);
    assert.deepEqual(await camera(), saved);
    await expect(node(id)).toHaveCount(0);
    await button("已移除节点").click();
    await button(`恢复 ${title}`).click();
    await button("编辑节点").click();
    await expect(node(id)).toHaveAccessibleName(`问题，${title}`);
    await expect(page.getByLabel("处理状态", { exact: true })).toContainText("进行中");
    const original = (await board())[legacyRecord].value;
    assert.equal(original.x, 120);
    assert.equal(original.y, 140);

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.desktop.settings({ theme: "dark" }));
    await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; });
    await win.evaluate(window => { window.setMinimumSize(350, 460); window.setContentSize(390, 590); });
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(390);
    await shot("topology-narrow-dark");
    if (!(await editor().isVisible())) await button("编辑节点").click();
    await expect(editor()).toBeVisible();
    assert(await page.locator(".topology-workspace").evaluate(el => el.scrollWidth <= el.clientWidth));
    await button("新建节点").click();
    await expect(editor()).toBeFocused();
    await expect(page.locator(".topology-node").filter({ hasText: "未命名节点" })).toHaveCSS("animation-name", "none");
    await button("返回工作页").click();
    await button("打开关系画布").click();
    if (await button("关闭详情").isVisible()) await button("关闭详情").click();
    const empty = await viewport().evaluate(element => {
      const { left, top, width, height } = element.getBoundingClientRect();
      for (const y of [12, height / 4, height / 2]) for (const x of [12, width - 12, width / 2]) {
        if (document.elementFromPoint(left + x, top + y) === element) return { x: left + x, y: top + y };
      }
      return null;
    });
    assert(empty, "an empty canvas position is available");
    await page.mouse.dblclick(empty.x, empty.y);
    await expect(page.getByRole("dialog", { name: "快捷创建节点", exact: true })).toBeVisible();
    await button("创建节点").click();
    await expect(editor()).toBeFocused();
    await expect(page.locator(".topology-node").filter({ hasText: "未命名节点" })).toHaveCount(2);
    console.log("PASS legacy note, five types, status, negative positions, drag history, anchored zoom, minimap, restart, restore, narrow navigation, double-click creation and reduced motion");
  } catch (error) {
    if (page && !page.isClosed()) await shot("topology-test-failure").catch(() => {});
    throw error;
  } finally {
    try { if (app) await close(); }
    finally {
      const target = await fs.realpath(data);
      if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith("arasn-topology-"))
        await fs.rm(target, { recursive: true, force: true });
    }
  }
}

verify().catch(error => { console.error(error); process.exitCode = 1; });
