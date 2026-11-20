const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const phase = process.env.ARASN_TOPBAR_PHASE || 'after';
const output = path.resolve(process.env.ARASN_SCREENSHOTS || path.join('docs/screenshots/quick-topbar', phase));
(async () => {
  await fs.mkdir(output, { recursive: true });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-topbar-'));
  const checks = [];
  let app;
  try {
    for (const scale of (phase === 'before' ? [1] : [1, 1.25, 1.5, 2])) {
      const data = path.join(root, String(scale)); await fs.mkdir(data);
      await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'dark', shortcut: 'Control+Alt+F23' }));
      const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
      app = await electron.launch({ args: ['.', `--force-device-scale-factor=${scale}`], cwd: path.resolve(__dirname, '..'), env });
      const page = await app.firstWindow(); page.setDefaultTimeout(10000);
      const win = await app.browserWindow(page); await win.evaluate(w => { w.show(); w.focus(); });
      await page.locator('.quick-title:enabled').waitFor();
      await expect(page.locator('.quick-input')).toBeFocused();
      await page.locator('.quick-input').fill('先把想法记下来。\n稍后整理资料，再加入关系画布。');
      await page.locator('.quick-title').fill('今天的灵感');
      await expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
      if (phase !== 'before') {
        await expect(page.locator('.quick-panel .xigra-brand')).toHaveCount(0);
        await expect(page.locator('.quick-panel [data-hide-panel]')).toHaveCount(0);
        const controls = page.locator('.window-navigation-controls');
        await expect(controls.locator('[data-hide-panel]')).toHaveCount(0);
        await expect(controls.getByRole('button')).toHaveCount(0);
        const create = page.getByRole('button', { name: '新建便笺', exact: true });
        await expect(create).toHaveCount(1);
        await expect(page.locator('.quick-header').getByRole('button', { name: '新建便笺', exact: true })).toBeVisible();
        await expect(page.locator('.quick-header h1')).toHaveText('速记');
        await expect(page.locator('.window-navigation-actions').getByRole('button', { name: '切换到工作区', exact: true })).toBeVisible();
      }
      const windows = [];
      for (const [width, height] of [[620, 700], [500, 540]]) {
        await win.evaluate((w, size) => w.setContentSize(...size), [width, height]);
        await page.waitForFunction(([w, h]) => Math.abs(innerWidth - w) <= 2 && Math.abs(innerHeight - h) <= 2, [width, height]).catch(async e => { console.log(JSON.stringify({scale, requested:[width,height], actual:await page.evaluate(()=>[innerWidth,innerHeight,devicePixelRatio]), content:await win.evaluate(w=>w.getContentSize()), bounds:await win.evaluate(w=>w.getBounds())})); throw e; });
        const measure = await page.evaluate(() => {
          const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
          return { dpr: devicePixelRatio, width: innerWidth, height: innerHeight, header: rect(document.querySelector('.quick-header')),
            content: rect(document.querySelector('.quick-content')), footer: rect(document.querySelector('.quick-footer')),
            heading: rect(document.querySelector('.quick-header h1')),
            title: rect(document.querySelector('.quick-title')),
            create: rect(document.querySelector('.quick-heading-create') ?? document.querySelector('.quick-title')),
            createRadius: getComputedStyle(document.querySelector('.quick-heading-create') ?? document.querySelector('.quick-title')).borderTopLeftRadius,
            overflow: document.documentElement.scrollWidth > innerWidth,
            buttons: [...document.querySelectorAll('.quick-header button')].map(rect) };
        });
        assert.ok(!measure.overflow && measure.footer.bottom <= measure.height + 1);
        if (phase !== 'before') {
          assert.ok(measure.header.height <= 60);
          assert.ok(Math.abs(measure.title.x - measure.heading.x) <= 1);
          assert.ok(Math.abs(measure.create.right - measure.title.right) <= 1);
          assert.ok(Math.abs(measure.create.y + measure.create.height / 2 - measure.heading.y - measure.heading.height / 2) <= 1);
          assert.equal(measure.createRadius, '10px');
          assert.deepEqual([measure.create.width, measure.create.height], [36, 36]);
          for (const b of measure.buttons) assert.ok(b.right <= measure.width && b.y >= measure.header.y && b.bottom <= measure.header.bottom);
        }
        windows.push(measure);
        await page.screenshot({ path: path.join(output, `content-${width}-dpi${scale}.png`), scale: 'css', animations: 'disabled' });
        if (width === 620) {
          const nativeImage = await app.evaluate(async ({ desktopCapturer, BrowserWindow }, id) => {
            const w = BrowserWindow.fromId(id), bounds = w.getBounds();
            const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: Math.round(bounds.width * 2), height: Math.round(bounds.height * 2) } });
            const source = sources.find(s => s.id === w.getMediaSourceId());
            return source && !source.thumbnail.isEmpty() ? source.thumbnail.toPNG().toString('base64') : null;
          }, await win.evaluate(w => w.id));
          if (nativeImage) await fs.writeFile(path.join(output, `native-dpi${scale}.png`), Buffer.from(nativeImage, 'base64'));
        }
      }
      const captionPoint = await page.locator('.window-navigation-controls').evaluate(controls => ({
        x: controls.getBoundingClientRect().right + 16, y: 15, scale: devicePixelRatio,
      }));
      const native = await win.evaluate((w, point) => {
        const req = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json');
        const lib = req('koffi').load('user32.dll');
        const style = lib.func('long __stdcall GetWindowLongW(intptr_t hwnd,int index)');
        const hit = lib.func('intptr_t __stdcall SendMessageW(intptr_t hwnd,uint msg,uintptr_t wp,intptr_t lp)');
        const rect = lib.func('int __stdcall GetWindowRect(intptr_t hwnd,void *rect)');
        const dpi = lib.func('uint __stdcall GetDpiForWindow(intptr_t hwnd)');
        const handle = w.getNativeWindowHandle(); const hwnd = handle.length === 8 ? handle.readBigUInt64LE() : handle.readUInt32LE();
        const r = Buffer.alloc(16); rect(hwnd, r);
        const x = r.readInt32LE(0) + Math.round(point.x * point.scale), y = r.readInt32LE(4) + Math.round(point.y * point.scale);
        return { caption: (style(hwnd, -16) & 0x00c00000) === 0x00c00000, captionHit: Number(hit(hwnd, 0x84, 0, ((y & 65535) << 16) | (x & 65535))), title: w.getTitle(), movable: w.isMovable(), closable: w.isClosable(), dpi: dpi(hwnd) };
      }, captionPoint);
      assert.ok(native.caption && native.movable && native.closable); assert.equal(native.captionHit, 2); assert.equal(native.title, 'Arasn');
      let nativeDrag;
      if (phase !== 'before' && scale === 1) {
        await win.evaluate(w => w.focus());
        nativeDrag = await win.evaluate(async w => {
          const req = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json');
          const lib = req('koffi').load('user32.dll');
          const foreground = lib.func('intptr_t __stdcall GetForegroundWindow()');
          const ancestor = lib.func('intptr_t __stdcall GetAncestor(intptr_t hwnd,uint flags)');
          const windowAt = lib.func('intptr_t __stdcall WindowFromPoint(int64_t point)');
          const rect = lib.func('int __stdcall GetWindowRect(intptr_t hwnd,void *rect)');
          const getCursor = lib.func('int __stdcall GetCursorPos(void *point)');
          const cursor = lib.func('int __stdcall SetCursorPos(int x,int y)');
          const mouse = lib.func('void __stdcall mouse_event(uint flags,uint dx,uint dy,uint data,uintptr_t extra)');
          const state = lib.func('short __stdcall GetAsyncKeyState(int key)');
          const handle = w.getNativeWindowHandle(); const hwnd = handle.length === 8 ? handle.readBigUInt64LE() : handle.readUInt32LE();
          const own = String(ancestor(hwnd, 2));
          const r = Buffer.alloc(16); rect(hwnd, r);
          const x = r.readInt32LE(0) + 100, y = r.readInt32LE(4) + 15;
          if (String(ancestor(foreground(), 2)) !== own) return { blocked: 'test window is not OS foreground' };
          if (String(ancestor(windowAt((BigInt(y >>> 0) << 32n) | BigInt(x >>> 0)), 2)) !== own) return { blocked: 'caption point belongs to another window' };
          if (state(1) & 0x8000) return { blocked: 'left mouse is already held' };
          const original = Buffer.alloc(8); if (!getCursor(original)) return { blocked: 'cursor cannot be read' };
          const before = w.getPosition(); let down = false;
          try {
            cursor(x, y); mouse(2, 0, 0, 0, 0); down = true;
            for (let step = 1; step <= 8; step++) {
              if (String(ancestor(foreground(), 2)) !== own) throw new Error('caption drag lost foreground');
              cursor(x + step * 4, y + step * 2); await new Promise(resolve => setTimeout(resolve, 16));
            }
          } finally {
            if (down) mouse(4, 0, 0, 0, 0);
            cursor(original.readInt32LE(0), original.readInt32LE(4));
          }
          await new Promise(resolve => setTimeout(resolve, 60));
          const after = w.getPosition(); return { passed: before[0] !== after[0] || before[1] !== after[1], before, after };
        });
        if (!nativeDrag.blocked) assert.equal(nativeDrag.passed, true);
      }
      let nativeShortcut;
      if (phase !== 'before') {
        await page.locator('.quick-input').focus();
        await page.locator('.quick-input').evaluate(e => { e.setSelectionRange(2, 5); e.dispatchEvent(new Event('select', { bubbles: true })); });
        const position = await win.evaluate(w => w.getPosition());
        await win.evaluate((w, p) => w.setPosition(p[0] + 12, p[1] + 12), position);
        assert.notDeepEqual(await win.evaluate(w => w.getPosition()), position);
        await expect(page.locator('.quick-input')).toBeFocused();
        await win.evaluate(w => w.close());
        await expect.poll(() => win.evaluate(w => w.isVisible())).toBe(false);
        // Exercise the real reveal handler, without sending keys to another application.
        await app.evaluate(({ app }) => app.emit('second-instance'));
        await expect.poll(() => win.evaluate(w => w.isVisible())).toBe(true);
        await expect(page.locator('.quick-input')).toHaveValue('先把想法记下来。\n稍后整理资料，再加入关系画布。');
        await expect(page.locator('.quick-input')).toBeFocused();
        assert.equal(await page.locator('.quick-input').evaluate(e => e.selectionStart), 2);
        await page.getByRole('button', { name: '切换到工作区', exact: true }).click();
        await expect(page.getByRole('button', { name: '写一张便笺', exact: true })).toBeVisible();
        await expect(page.locator('.window-page-title > span')).toHaveText('便签');
        await expect(page.locator('.window-navigation-controls [data-hide-panel]')).toBeVisible();
        await expect(page.locator('.app-shell')).toHaveAttribute('data-layout-motion', 'idle');
        const quickView = page.getByRole('button', { name: '切换到便签区', exact: true });
        if (!await quickView.isVisible()) await page.getByRole('button', { name: '页面操作', exact: true }).click();
        await quickView.click();
        await expect(page.locator('.quick-input')).toBeVisible();
        await expect(page.locator('.quick-input')).toHaveValue('先把想法记下来。\n稍后整理资料，再加入关系画布。');
        await expect(page.locator('.quick-input')).toBeFocused();
      }
      if (phase !== 'before' && scale === 1) {
        const helper = spawn('powershell.exe', ['-NoProfile', '-STA', '-File', path.resolve('tests/xigra-p0c-windows.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        const replies = readline.createInterface({ input: helper.stdout })[Symbol.asyncIterator]();
        try {
          const source = Number((await replies.next()).value);
          assert.ok(source > 0);
          await win.evaluate(w => w.close());
          await expect.poll(() => win.evaluate(w => w.isVisible())).toBe(false);
          helper.stdin.write(`activate ${source}\n`);
          const activation = String((await replies.next()).value);
          if (!/^\d+$/.test(activation)) nativeShortcut = { blocked: activation };
          else {
            helper.stdin.write(`f23 ${source}\n`);
            const result = String((await replies.next()).value);
            if (!/^\d+$/.test(result)) nativeShortcut = { blocked: result };
            else {
              await expect.poll(() => win.evaluate(w => w.isVisible())).toBe(true);
              await expect(page.locator('.quick-input')).toBeFocused();
              await expect(page.locator('.quick-title')).toHaveValue('今天的灵感');
              nativeShortcut = { passed: true, shortcut: 'Control+Alt+F23', via: 'Win32 SendInput from dedicated foreground test window' };
            }
          }
        } finally {
          helper.stdin.end();
          await new Promise(resolve => { if (helper.exitCode !== null) resolve(); else helper.once('exit', resolve); });
        }
      }
      checks.push({ scale, native, windows, nativeDrag, nativeShortcut, closeHidesAndRevealRestores: phase !== 'before' });
      await app.close(); app = null;
    }
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(checks, null, 2));
    console.log('PASS topbar ' + phase + ': native caption/hit test, compact sizes, DPI, move, close/hide/reveal, workspace brand and focus');
  } finally {
    if (app) await app.close();
    const resolved = await fs.realpath(root);
    if (path.dirname(resolved) === await fs.realpath(os.tmpdir()) && path.basename(resolved).startsWith('arasn-topbar-')) await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
