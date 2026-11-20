const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { selectOption } = require('./helpers/select-option.cjs');
(async () => {
  const output = path.resolve('docs/screenshots/adaptive-layout', process.env.ARASN_ADAPTIVE_PASS || 'final');
  await fs.mkdir(output, { recursive: true });
  const metrics = [];
  for (const scale of (process.env.ARASN_ADAPTIVE_SCALES || '1,1.5,2').split(',').map(Number)) {
    const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-adaptive-'));
    const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
    let app, page; const errors = [];
    try {
      const store = createStore(path.join(data, 'board.json'));
      store.apply({ id: randomUUID(), opId: randomUUID(), expected: 0, value: { type: 'text', text: '响应式验收示例\n缩放、位置和正文保持不变。', x: 650, y: 350, color: '#4668c6' } });
      app = await electron.launch({ args: [`.`, `--force-device-scale-factor=${scale}`], cwd: path.resolve(__dirname, '..'), env });
      page = await app.firstWindow(); page.setDefaultTimeout(12000);
      page.on('pageerror', e => errors.push(e.message));
      await page.locator('.quick-title:enabled').waitFor();
      const win = await app.browserWindow(page);
      await win.evaluate(w => { w.setIgnoreMouseEvents(true); w.show(); w.focus(); });
      const b = name => page.getByRole('button', { name, exact: true });
      const focusWithTab = async loc => {
        await loc.evaluate(el => { const prior = document.createElement('button'); prior.id = 'adaptive-focus-prior'; el.before(prior); prior.focus(); });
        await page.keyboard.press('Tab');
        await page.locator('#adaptive-focus-prior').evaluate(el => el.remove());
        await expect(loc).toBeFocused();
      };
      await b('打开工作区').click(); await b('我的随手页').click();
      const shell = page.locator('.adaptive-shell'), rail = page.locator('.free-tool-rail');
      await expect(page.locator('.paper-scroll')).toBeVisible();
      await page.evaluate(() => { window.adaptivePaper = document.querySelector('.paper'); });
      const camera = () => page.locator('.paper').evaluate(e => { const m = new DOMMatrix(getComputedStyle(e).transform), v = e.closest('.paper-scroll'); return { x: (v.clientWidth/2-m.e)/m.a, y: (v.clientHeight/2-m.f)/m.a, zoom: m.a }; });
      const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
      const baseline = await board();
      const before = await camera();
      const size = async (w,h) => {
        await win.evaluate((win, dims) => { win.unmaximize(); win.setContentSize(...dims); }, [w,h]);
        await page.waitForTimeout(330);
      };
      const shot = async name => {
        await page.mouse.move(1,1);
        await page.screenshot({ path: path.join(output, `dpr${scale}-${name}.png`), scale: 'css', animations: 'disabled' });
      };
      const check = async label => {
        const info = await page.evaluate(() => {
          const shell = document.querySelector('.adaptive-shell'), canvas = document.querySelector('.paper-scroll');
          const rail = document.querySelector('.free-tool-rail'), r = rail.getBoundingClientRect(), c = canvas.getBoundingClientRect();
          const s = document.querySelector('.sidebar').getBoundingClientRect();
          return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, nav: shell.dataset.navMode, toolbar: shell.dataset.toolbarMode,
            canvas: { width: c.width, height: c.height }, rail: { x:r.x,y:r.y,bottom:r.bottom,width:r.width,height:r.height },
            canvasBottom:c.bottom, sidebar:s.width, overflow:document.documentElement.scrollWidth>innerWidth,
            remounted:window.adaptivePaper !== document.querySelector('.paper') };
        });
        assert(!info.overflow && !info.remounted, JSON.stringify(info));
        assert(info.rail.bottom <= info.canvasBottom + 1, JSON.stringify(info));
        assert(info.canvas.width >= 240 && info.canvas.height >= 200, JSON.stringify(info));
        await expect(page.locator('.sidebar .nav-item[data-selected]')).toHaveCount(1);
        const after = await camera();
        for (const k of ['x','y','zoom']) assert(Math.abs(after[k]-before[k])<.01, `camera changed ${k}: ${JSON.stringify({before,after})}`);
        assert.deepEqual(await board(), baseline);
        metrics.push({ scale, label, ...info });
        await shot(label);
      };
      for (const theme of ['light','dark']) {
        await page.locator('.sidebar [aria-label="设置与快捷键"]').click();
        await selectOption(page,'外观主题',theme); await b('关闭弹窗').click();
        await expect(page.getByText('设置已保存',{exact:true})).toBeHidden();
        await b('自由绘图').click();
        await win.evaluate(w => w.maximize()); await page.waitForTimeout(330); await check(`${theme}-maximized`);
        for (const [w,h] of [[1440,900],[1200,800],[1000,700],[800,600],[720,520]]) {
          await size(w,h); await check(`${theme}-${w}x${h}`);
          await expect(b('自由绘图')).toHaveAttribute('aria-pressed','true');
        }
        assert.equal(await rail.getAttribute('data-mode'),'minimal');
        const canvasBefore = await page.locator('.paper-scroll').boundingBox();
        await b('展开主导航').click();
        await expect(page.locator('.sidebar [aria-label="文件"] .nav-item-label')).toBeVisible();
        assert.deepEqual(await page.locator('.paper-scroll').boundingBox(),canvasBefore);
        await shot(`${theme}-navigation-expanded`);
        await b('收起主导航').click();
        await b('展开主导航').click(); await page.keyboard.press('Escape');
        await expect(b('展开主导航')).toBeFocused();
        await focusWithTab(page.locator('.sidebar [aria-label="文件"]'));
        await expect(page.getByRole('tooltip')).toContainText('文件');
        await shot(`${theme}-navigation-tooltip`);
        await focusWithTab(b('选择与拖动'));
        await expect(page.getByRole('tooltip')).toContainText('选择');
        await focusWithTab(b('更多工具'));
        await expect(page.getByRole('tooltip')).toContainText('更多工具');
        await b('更多工具').click();
        await expect(page.getByRole('dialog',{name:'更多工具'})).toBeVisible();
        for (const name of ['图形工具','添加图片或附件','撤销上次操作','重做上次操作','工具属性','删除选中对象']) await expect(b(name)).toBeVisible();
        await expect(b('撤销上次操作')).toBeDisabled(); await expect(b('删除选中对象')).toBeDisabled();
        await shot(`${theme}-more-tools`);
        await b('工具属性').click();
        await expect(page.locator('.free-properties')).toBeVisible();
        await shot(`${theme}-properties`);
        await b('关闭工具属性').click();
      }
      await page.emulateMedia({reducedMotion:'reduce'});
      await size(1200,800); await check('reduced-motion');
      await page.emulateMedia({reducedMotion:'no-preference'});
      await size(720,520);
      await b('选择与拖动').click();
      await page.locator('.note-handle').first().click({position:{x:70,y:12}});
      await expect(page.locator('.note.focused')).toHaveCount(1);
      await page.locator('.note.focused').evaluate(el=>{window.adaptiveSelectedNote=el;});
      await size(1000,700);
      await expect(page.locator('.note.focused')).toHaveCount(1);
      assert(await page.locator('.note.focused').evaluate(el=>el===window.adaptiveSelectedNote));
      await size(720,520);
      assert.deepEqual(await board(),baseline);
      await b('自由绘图').click();
      const area = await page.locator('.paper-scroll').boundingBox();
      const start = { x: area.x + area.width - 110, y: area.y + area.height - 130 };
      await page.mouse.move(start.x,start.y); await page.mouse.down();
      await page.mouse.move(start.x+40,start.y+15,{steps:8}); await page.mouse.up();
      const strokes = async () => Object.values((await board()).items).filter(i=>i.value?.type==='stroke').length;
      await expect.poll(strokes).toBe(1);
      const more = () => page.getByRole('button',{name:/^更多工具/});
      await more().click(); await expect(b('撤销上次操作')).toBeEnabled(); await b('撤销上次操作').click();
      await expect.poll(strokes).toBe(0);
      await more().click(); await expect(b('重做上次操作')).toBeEnabled(); await b('重做上次操作').click();
      await expect.poll(strokes).toBe(1);
      await b('选择与拖动').click(); await page.mouse.click(start.x+20,start.y+7);
      await more().click(); await expect(b('删除选中对象')).toBeEnabled(); await b('删除选中对象').click();
      await expect.poll(strokes).toBe(0);
      await more().click(); await b('撤销上次操作').click(); await expect.poll(strokes).toBe(1);
      await more().click(); await b('图形工具').click();
      await expect(page.locator('.free-more')).toHaveClass(/selected/);
      await expect(page.locator('.free-properties')).toBeVisible(); await b('关闭工具属性').click();
      await more().click(); await b('添加图片或附件').click();
      await expect(page.getByRole('dialog',{name:'选择附件'})).toBeVisible(); await b('关闭文件选择').click();
      await shot('minimal-actions-verified');
      // Hold a real canvas pointer gesture across resizing; modes stay fixed until pointer-up.
      await size(1440,900); await b('选择与拖动').click();
      const oldModes = await shell.evaluate(el=>[el.dataset.navMode,el.dataset.toolbarMode]);
      const large = await page.locator('.paper-scroll').boundingBox();
      await page.mouse.move(large.x+large.width*.9,large.y+large.height*.75); await page.mouse.down();
      await size(720,520);
      assert.deepEqual(await shell.evaluate(el=>[el.dataset.navMode,el.dataset.toolbarMode]),oldModes);
      await page.mouse.up();
      await expect(shell).toHaveAttribute('data-nav-mode','collapsed');
      await expect(rail).toHaveAttribute('data-mode','minimal');
      assert.equal(await page.evaluate(()=>window.adaptivePaper === document.querySelector('.paper')),true);
      metrics.push({scale,actions:'minimal draw/undo/redo/delete/undo/shapes/attachment passed; gesture resize locked until pointer-up'});
      assert.deepEqual(errors,[]);
      console.log(`PASS adaptive scale ${scale}: maximized, 1440/1200/1000/800/720, both themes, 3 modes, accessible extras, nav overlay/tooltip, stable mounted canvas/camera/data`);
    } catch(e) {
      if(page&&!page.isClosed()) await page.screenshot({path:path.join(output,`failure-dpr${scale}.png`)}).catch(()=>{});
      throw e;
    } finally {
      if(app) await app.close();
      const target=await fs.realpath(data); assert.equal(path.dirname(target),await fs.realpath(os.tmpdir())); await fs.rm(target,{recursive:true,force:true});
    }
  }
  await fs.writeFile(path.join(output,'metrics.json'),JSON.stringify(metrics,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
