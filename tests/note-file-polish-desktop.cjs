const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-polish-'));
  const phase = process.env.ARASN_POLISH_PHASE || 'final';
  const out = path.resolve('docs/screenshots/note-file-polish', phase);
  await fs.mkdir(out, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  for (const text of ['评审前的准备\n把需要讨论的问题收集在这里。确认范围，补充材料，再安排下一步。', '一个新的想法\n先记录灵感，再慢慢展开细节。', '周末阅读清单\n留一点时间给阅读与思考。']) store.apply({ id: randomUUID(), value: {type:'text', text, color:'#9aafff', x:650, y:410}, expected:0, opId:randomUUID() });
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({theme:'dark', shortcut:'Control+Alt+F23'}));
  const env = {...process.env, ARASN_DATA_DIR:data, ARASN_SMOKE:'1'}; delete env.ELECTRON_RUN_AS_NODE;
  let app; const checks = [], errors = [];
  try {
    app = await electron.launch({args:['.'], cwd:path.resolve(__dirname,'..'), env});
    const page = await app.firstWindow(), win = await app.browserWindow(page);
    page.on('pageerror', e => errors.push(e.message));
    const b = name => page.getByRole('button', {name, exact:true});
    await b('打开工作区').click();
    const file = path.join(data,'评审资料.txt'); await fs.writeFile(file,'测试资料，不使用个人数据');
    await app.evaluate(({dialog}, file) => {dialog.showOpenDialog = async () => ({canceled:false,filePaths:[file]});}, file);
    await b('文件').click(); await b('导入文件').click(); await expect(page.locator('.file-row')).toHaveCount(1);
    for (const width of [1440, 1100, 820, 720, 390]) {
      await win.evaluate((w,width) => {w.unmaximize();w.setMinimumSize(350,460);w.setContentSize(width,width===1440?900:720);w.show();}, width);
      await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width);
      await b('便笺列表').click();
      if (phase !== 'before' && width <= 900) await b('便签列表').click();
      await page.screenshot({path:path.join(out,`records-list-${width}.png`),animations:'disabled'});
      const item = page.locator('.xigra-record-index .xigra-record-list button').first();
      const weight = await item.locator('strong').evaluate(el=>getComputedStyle(el).fontWeight);
      await item.click();
      await page.waitForTimeout(240);
      if (phase !== 'before') {
        assert.equal(await item.locator('strong').evaluate(el=>getComputedStyle(el).fontWeight),weight);
        await expect(page.locator('.xigra-record-editor')).toBeVisible();
        const g = await page.locator('.xigra-record-editor').boundingBox(); assert(g.width >= Math.min(300,width-60));
      }
      await page.screenshot({path:path.join(out,`records-editor-${width}.png`),animations:'disabled'});
      await b('文件').click();
      await expect(page.locator('.file-row')).toHaveCount(1);
      await expect(page.locator('.file-list')).toHaveAttribute('aria-busy', 'false');
      await page.waitForTimeout(240);
      await page.screenshot({path:path.join(out,`files-${width}.png`),animations:'disabled'});
      checks.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth})));
    }
    if (phase !== 'before') {
      await b('更多文件操作').click(); await expect(page.getByRole('menuitem',{name:'设备互传',exact:true})).toBeVisible(); await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'评审资料.txt的更多操作'}).click(); await expect(page.getByRole('menuitem',{name:'放入面板',exact:true})).toBeVisible(); await page.keyboard.press('Escape');
      await b('便笺列表').click(); await b('便签列表').click(); await page.locator('.xigra-record-index .xigra-record-list button').first().click();
      await page.locator('.xigra-record-editor').fill('精修保存验收\n正文保持原有保存流程。');
      await expect.poll(async()=>page.evaluate(async()=> Object.values((await (await fetch('/api/board',{headers:{Authorization:`Bearer ${sessionStorage.getItem('arasn-token')}`}})).json()).items).some(i=>i.value?.text?.includes('精修保存验收')))).toBe(true);
      await b('便签列表').click(); await b('写一张便笺').click();
      await expect(page.locator('.xigra-record-editor')).toBeVisible();
      await expect(page.locator('.xigra-record-editor')).toBeFocused();
      await b('便签列表').focus(); await page.keyboard.press('Enter');
      await expect(page.locator('.xigra-record-index')).toBeVisible();
      for (const selector of ['.sidebar [aria-label="便笺列表"]', '.xigra-record-filters button']) {
        const c = page.locator(selector).first();
        const metrics = await c.evaluate(el=>({weight:getComputedStyle(el).fontWeight, transition:getComputedStyle(el).transitionDuration}));
        assert(metrics.transition.includes('0.18s'),JSON.stringify(metrics));
        await c.click(); assert.equal(await c.evaluate(el=>getComputedStyle(el).fontWeight), metrics.weight);
      }
      await page.emulateMedia({reducedMotion:'reduce'});
      assert.equal(await page.locator('.xigra-record-filters button').first().evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
      await page.emulateMedia({reducedMotion:'no-preference'});
      await b('设置与快捷键').click(); await require('./helpers/select-option.cjs').selectOption(page, '外观主题','light'); await b('关闭弹窗').click();
      for (const width of [1440,820,390]) {
        await win.evaluate((w,width)=>w.setContentSize(width,720),width);
        await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(width);
        await b('便笺列表').click();
        if(width<=900) await b('便签列表').click();
        await page.locator('.xigra-record-index .xigra-record-list button').first().click();
        await page.waitForTimeout(240);
        await page.screenshot({path:path.join(out,`records-light-${width}.png`)});
        await b('文件').click(); await expect(page.locator('.file-row')).toHaveCount(1); await page.waitForTimeout(240);
        await page.screenshot({path:path.join(out,`files-light-${width}.png`)});
      }
      await win.evaluate(w=>w.maximize());
      await expect.poll(()=>win.evaluate(w=>w.isMaximized())).toBe(true);
      await b('便笺列表').click(); await page.waitForTimeout(240);
      await page.screenshot({path:path.join(out,'records-maximized.png')});
      await b('文件').click(); await expect(page.locator('.file-row')).toHaveCount(1); await page.waitForTimeout(240);
      await page.screenshot({path:path.join(out,'files-maximized.png')});
      await win.evaluate(w=>{w.unmaximize(); w.setContentSize(720,520);});
      await b('便笺列表').click(); await b('便签正文').click();
      const box = await page.locator('.xigra-record-editor').boundingBox(); assert(box.height>200);
      await b('文件').click(); await expect(page.locator('.file-row')).toHaveCount(1);
      await page.locator('.file-row').scrollIntoViewIfNeeded();
      await page.screenshot({path:path.join(out,'files-minimum-720x520.png')});
    }
    assert(checks.every(c=>!c.overflow),JSON.stringify(checks)); assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({checks,errors},null,2));
    console.log('PASS polish '+phase+': screenshots at 1440/1100/820/720/390, stable type, editor width, menus and save');
  } finally {
    if(app) await app.close();
    const resolved = await fs.realpath(data); assert.equal(path.dirname(resolved),await fs.realpath(os.tmpdir()));
    await fs.rm(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
