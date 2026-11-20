const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');
const { nativePointer } = require('./helpers/native-pointer.cjs');

async function run() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-modal-titlebar-'));
  const output = path.resolve(process.env.ARASN_SCREENSHOTS || 'docs/screenshots/modal-titlebar');
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, pointer;
  try {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F22' }));
    app = await electron.launch({ args: ['.', '--force-device-scale-factor=1'], env });
    const page = await app.firstWindow();
    page.setDefaultTimeout(8000);
    const win = await app.browserWindow(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const button = name => page.getByRole('button', { name, exact: true });
    const title = page.locator('.quick-title');
    const body = page.locator('.quick-input');
    const modal = page.getByRole('dialog');
    const backdrop = page.locator('.desk-backdrop');
    await win.evaluate(w => { w.show(); w.focus(); w.webContents.setBackgroundThrottling(false); });
    const shot = async name => {
      const file = path.join(output, name + '.png');
      await captureNativeWindow(app, page, file);
      const difference = await app.evaluate(({ nativeImage }, file) => {
        const image = nativeImage.createFromPath(file);
        const { width } = image.getSize();
        const pixels = image.toBitmap();
        const at = (x, y) => [...pixels.subarray((y * width + x) * 4, (y * width + x) * 4 + 3)];
        const base = at(width - 150, 14);
        return Math.max(...[20, 60, 105].flatMap(offset =>
          at(width - offset, 14).map((value, channel) => Math.abs(value - base[channel]))));
      }, file);
      assert.ok(difference <= 3, `${name}: native caption background differs by ${difference}`);
    };
    let scrim;
    const checkModal = async name => {
      await expect(modal).toBeVisible();
      await expect(backdrop).toHaveCSS('opacity', '1');
      const state = await backdrop.evaluate(element => {
        const { top } = element.getBoundingClientRect();
        return { top, color: getComputedStyle(element).backgroundColor };
      });
      assert.equal(state.top, 0);
      scrim ??= state.color;
      assert.equal(state.color, scrim);
      await shot(name);
    };
    const close = async () => {
      await page.keyboard.press('Escape');
      await expect(backdrop).toHaveCount(0);
    };
    await expect(title).toBeEnabled();
    await expect(page.locator('.quick-support')).toHaveCount(0);
    await title.fill('验收便签甲');
    await body.fill('正文独有关键词');
    await expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
    await button('新建便笺').click();
    await title.fill('验收便签乙');
    await body.fill('第二条正文');
    await expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
    await expect(button('最近')).toHaveCount(0);
    await button('验收便签甲').click();
    await expect(body).toHaveValue('正文独有关键词');
    await shot('quick-light');
    for (const [query, result] of [['验收便签乙', '验收便签乙'], ['正文独有关键词', '验收便签甲']]) {
      await button('搜索便签').click();
      await checkModal('note-search-light');
      await modal.locator('input').fill(query);
      await page.keyboard.press('Enter');
      await expect(backdrop).toHaveCount(0);
      await expect(title).toHaveValue(result);
    }
    await page.keyboard.press('Control+k');
    await expect(page.locator('.command-popup')).toBeVisible();
    await win.evaluate(w => w.setContentSize(1000, 720));
    await checkModal('command-light');
    await close();

    const source = path.join(data, '窗口验收.png');
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 320;
      const context = canvas.getContext('2d');
      const colors = ['#243c4a', '#527e88', '#b2c9be', '#deae78', '#a25844'];
      colors.forEach((color, index) => {
        context.fillStyle = color;
        context.fillRect(index * 120, 0, 120, canvas.height);
      });
      return canvas.toDataURL().split(',')[1];
    });
    await fs.writeFile(source, Buffer.from(png, 'base64'));
    await app.evaluate(({ dialog }, source) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
    }, source);
    await button('文件').click();
    await button('导入文件').click();
    const preview = button('预览 窗口验收.png');
    await expect(preview).toBeVisible();
    const notification = page.locator('.app-notification-close');
    if (await notification.count()) await notification.click();
    for (const theme of ['light', 'dark']) {
      scrim = undefined;
      if (theme === 'dark') {
        await button('设置与快捷键').last().click();
        await button('深色').click();
        await close();
      }
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const state = theme === 'dark' ? 'maximized' : 'normal';
      if (theme === 'dark') {
        await win.evaluate(w => w.maximize());
        await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
      }
      await preview.click();
      await expect(page.locator('.image-preview-area img')).toBeVisible();
      await checkModal(`file-image-${theme}-${state}`);
      await close();
      await expect(preview).toBeFocused();
      const settings = button('设置与快捷键').last();
      await settings.click();
      await checkModal(`settings-${theme}-${state}`);
      const box = await page.locator('.window-navigation [aria-label="全局搜索"]').boundingBox();
      assert.ok(box);
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await expect(page.locator('.xigra-record-dialog')).toHaveCount(0);
      await expect(backdrop).toHaveCount(0);
      await expect(preview).toBeVisible();
      await shot(`restored-${theme}-${state}`);
      const alternate = theme === 'light' ? 'maximized' : 'normal';
      await win.evaluate((w, maximize) => maximize ? w.maximize() : w.unmaximize(), theme === 'light');
      await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(theme === 'light');
      await settings.click();
      await checkModal(`settings-${theme}-${alternate}`);
      await close();
      if (theme === 'light') {
        await win.evaluate(w => w.unmaximize());
        await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(false);
      }
    }

    await win.evaluate(w => w.unmaximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(false);
    await win.evaluate(w => { w.setSize(890, 650); w.center(); });
    pointer = await nativePointer(app, page);
    const dragX = await page.locator('.window-page-title').evaluate(element => element.getBoundingClientRect().x + 25);
    const position = await win.evaluate(w => w.getPosition());
    const native = (message, points) => win.evaluate((w, { message, points, modulePath }) => {
      const user = process.mainModule.require(modulePath).load('user32.dll');
      const clientToScreen = user.func('int __stdcall ClientToScreen(intptr_t hwnd, void *point)');
      const send = user.func('intptr_t __stdcall SendMessageW(intptr_t hwnd, uint message, uintptr_t wp, intptr_t lp)');
      const handle = w.getNativeWindowHandle();
      const hwnd = handle.length === 8 ? handle.readBigInt64LE() : handle.readInt32LE();
      if (message) return Number(send(hwnd, 0x0112, message, 0));
      return points.map(([x, y]) => {
        const point = Buffer.alloc(8);
        point.writeInt32LE(x, 0);
        point.writeInt32LE(y, 4);
        if (!clientToScreen(hwnd, point)) throw Error('ClientToScreen failed');
        const screenPoint = (point.readUInt16LE(4) << 16) | point.readUInt16LE(0);
        return Number(send(hwnd, 0x0084, 0, screenPoint));
      });
    }, { message, points, modulePath: require.resolve('koffi') });
    const width = await page.evaluate(() => innerWidth);
    const hits = await native(null, [[dragX, 20], [width + 2, 200], [width - 68, 22]]);
    assert.deepEqual(hits, [2, 11, 9], 'Windows drag, resize and maximize hit testing');
    let foreground = true;
    try {
      await pointer.drag(dragX, 20, 32, 24);
    } catch (error) {
      if (!error.message.includes('test window is not foreground')) throw error;
      foreground = false;
      console.log('OS foreground unavailable. Using Windows system commands and testing drag/resize hit regions and geometry.');
      await win.evaluate((w, [x, y]) => w.setPosition(x + 32, y + 24), position);
    }
    assert.notDeepEqual(await win.evaluate(w => w.getPosition()), position);
    await win.evaluate(w => w.setContentSize(850, 650));
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(width);
    const clickCaption = async offset => {
      const width = await page.evaluate(() => innerWidth);
      await pointer.drag(width - offset, 22, 0, 0, 1);
    };
    await (foreground ? clickCaption(68) : native(0xf030));
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    await (foreground ? clickCaption(68) : native(0xf120));
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(false);
    await (foreground ? clickCaption(115) : native(0xf020));
    await expect.poll(() => win.evaluate(w => w.isMinimized())).toBe(true);
    await win.evaluate(w => { w.restore(); w.show(); });
    await (foreground ? clickCaption(22) : native(0xf060));
    await expect.poll(() => win.evaluate(w => w.isVisible())).toBe(false);
    assert.deepEqual(errors, []);
    console.log('PASS native caption colors, modal scrim, note search and switching, drag, resize and caption buttons');
  } finally {
    try { await pointer?.restore(); }
    finally {
      await app?.close();
      await fs.rm(data, { recursive: true, force: true });
    }
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
