const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');
const { selectOption } = require('./helpers/select-option.cjs');

const output = path.resolve(process.env.ARASN_SCREENSHOTS || 'docs/screenshots/quick-window');
const titles = ['周末阅读清单', '会议纪要与下周需要交付的材料', '草稿想法', '资料整理和待核对的参考文件', '近期项目进度及下一步讨论安排', '产品讨论与后续行动清单'];
const draft = '把今天讨论的几个想法先记下来。\n接下来核对资料，整理成工作站里的项目清单。';

async function verify(scale, theme) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-quick-window-'));
  const data = path.join(root, 'data');
  await fs.mkdir(data);
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ shortcut: 'Control+Alt+F23', startMinimized: false }));
  const file = path.join(root, '讨论资料.png');
  await fs.writeFile(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a4ZsAAAAASUVORK5CYII=', 'base64'));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const errors = [];
  let app, page, win;
  async function launch() {
    app = await electron.launch({ args: ['.', `--force-device-scale-factor=${scale}`], env });
    page = await app.firstWindow();
    page.setDefaultTimeout(8500);
    page.on('pageerror', error => errors.push(error.message));
    win = await app.browserWindow(page);
    await expect(page.locator('.quick-title')).toBeEnabled();
    await app.evaluate(({ app }) => app.emit('second-instance'));
  }
  const button = name => page.getByRole('button', { name, exact: true });
  const bounds = () => win.evaluate(w => w.getBounds());
  const size = async (width, height) => {
    await win.evaluate((w, size) => w.setBounds({ ...w.getBounds(), ...size }), { width, height });
    await expect.poll(async () => {
      const current = await bounds();
      return Math.max(Math.abs(current.width - width), Math.abs(current.height - height));
    }).toBeLessThanOrEqual(1);
  };
  const saved = () => expect(page.locator('.quick-panel .save-state')).toHaveText('已保存');
  const settings = async () => {
    await button('全局快捷操作').click();
    await page.getByRole('option', { name: /设置与快捷键/ }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  };
  const switchMode = async expanded => {
    const mode = page.locator('.mode-switch-button');
    await mode.click();
    await expect(mode).toHaveAttribute('aria-label', expanded ? '切换到便签区' : '切换到工作区');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-layout-motion', 'idle');
  };
  const capture = label => captureNativeWindow(app, page, path.join(output, `${theme}-${label}.png`));
  const regular = () => expect.poll(() => win.evaluate(w => w.isAlwaysOnTop())).toBe(false);
  try {
    await launch();
    assert.equal(await page.evaluate(() => devicePixelRatio), scale);
    assert.equal(await page.evaluate(async () => (await window.desktop.info()).alwaysOnTop), false);
    await regular();
    const initial = await bounds();
    assert(Math.abs(initial.width - 640) <= 1 && Math.abs(initial.height - 520) <= 1, JSON.stringify(initial));
    const title = page.locator('.quick-title');
    const editor = page.locator('.quick-input');
    const settingsDialog = await settings();
    await settingsDialog.getByRole('button', { name: /^外观/ }).click();
    await selectOption(page, '外观主题', theme);
    await button('关闭弹窗').click();
    assert.deepEqual(await bounds(), initial);

    for (const [index, name] of titles.entries()) {
      if (index) await button('新建便笺').click();
      await expect(editor).toBeFocused();
      await title.fill(name);
      await editor.fill(index === titles.length - 1 ? draft : `待整理事项 ${index + 1}`);
      await saved();
      assert.deepEqual(await bounds(), initial);
    }
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, file);
    await button('0 个附件').click();
    let attachment = page.getByRole('dialog', { name: '当前便签附件' });
    await attachment.getByRole('button', { name: '本地导入' }).click();
    await expect(button('1 个附件')).toBeVisible();
    await expect(button('添加文件')).toHaveCount(0);
    await button('1 个附件').click();
    await expect(attachment.getByText('讨论资料.png')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(attachment).toHaveCount(0);
    await expect(button('1 个附件')).toBeFocused();
    assert.deepEqual(await bounds(), initial);
    await page.mouse.move(75, 200);
    await editor.focus();

    const verifyLayout = async () => {
      const measure = () => page.locator('.quick-panel').evaluate(panel => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect();
        const input = panel.querySelector('.quick-input');
        const body = rect('.quick-input'), bar = rect('.note-status-bar'), track = rect('.quick-recent-track');
        const style = getComputedStyle(input);
        const card = rect('.quick-content'), title = rect('.quick-title'), create = rect('.quick-title-create');
        const save = rect('.quick-panel .save-state'), count = rect('.quick-panel .note-word-count');
        const attachment = rect('.quick-panel .attachment-entry');
        const header = rect('.window-navigation'), heading = rect('.window-page-title span');
        const mid = box => box.top + box.height / 2;
        const near = (a, b) => Math.abs(a - b) <= 1;
        const safeArea = navigator.windowControlsOverlay?.getTitlebarAreaRect();
        return {
          width: innerWidth, height: innerHeight, bodyHeight: body.height, footerHeight: bar.height,
          lineWidth: body.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          inset: title.left - card.left,
          aligned: near(title.left, body.left + parseFloat(style.paddingLeft)) && near(title.left, save.left)
            && near(title.left, heading.left) && near(create.right, attachment.right)
            && near(title.left - card.left, card.right - create.right) && near(body.width, card.width - 2),
          centered: header.height === 48 && near(mid(heading), mid(header)) && near(mid(title), mid(create))
            && near(mid(save), mid(count)) && near(mid(save), mid(attachment))
            && [...document.querySelectorAll('.window-navigation-actions button')].every(button => {
              const box = button.getBoundingClientRect();
              return near(mid(box), mid(header)) && (!safeArea?.width || box.right <= safeArea.right);
            }),
          ordered: body.bottom <= bar.top + 1 && bar.bottom < track.top && track.bottom <= innerHeight,
          complete: [...panel.querySelectorAll('.compact li')].every(chip => {
            const rect = chip.getBoundingClientRect();
            return rect.left >= track.left - 1 && rect.right <= track.right + 1 || getComputedStyle(chip).opacity === '0';
          }),
        };
      });
      await expect.poll(measure).toMatchObject({ aligned: true, centered: true, ordered: true, complete: true });
      const layout = await measure();
      assert(layout.inset >= 18 && layout.inset <= 29, JSON.stringify(layout));
      assert(layout.bodyHeight > 150 && layout.footerHeight <= 40 && layout.lineWidth <= 681, JSON.stringify(layout));
    };
    for (const [width, height] of [[600, 480], [900, 650], [520, 420]]) {
      await size(width, height);
      await verifyLayout();
      if (width >= 600) await capture(`${width}x${height}`);
    }
    await size(900, 650);
    const beforeMaximize = await bounds();
    await win.evaluate(w => w.maximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    await verifyLayout();
    await capture('maximized');
    await win.evaluate(w => w.unmaximize());
    await expect.poll(bounds).toEqual(beforeMaximize);
    await verifyLayout();
    await size(600, 480);
    const fastForward = button('下一条最近便签');
    const track = page.locator('.quick-recent-track');
    await expect(fastForward).toBeEnabled();
    await fastForward.click();
    await expect.poll(() => track.evaluate(e => e.scrollLeft)).toBeGreaterThan(0);
    for (let i = 0; i < titles.length && await fastForward.isEnabled(); i++) {
      const before = await track.evaluate(e => e.scrollLeft);
      await fastForward.click();
      await expect.poll(() => track.evaluate(e => e.scrollLeft)).toBeGreaterThan(before);
      await track.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }
    await expect(fastForward).toBeDisabled();
    await expect(button(titles[0])).toBeVisible();
    await button(titles[0]).click();
    await expect(title).toHaveValue(titles[0]);
    const long = '需要继续编辑的内容。\n'.repeat(180);
    await editor.fill(long);
    await saved();
    await editor.evaluate(e => { e.setSelectionRange(100, 103); e.scrollTop = e.scrollHeight; });
    await size(640, 520);
    assert.deepEqual(await editor.evaluate(e => [e.selectionStart, e.selectionEnd, e.scrollTop > 0]), [100, 103, true]);
    const quick = await bounds();
    await button('搜索便签').click();
    await expect(page.getByRole('combobox', { name: '搜索便笺正文' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(editor).toBeFocused();
    assert.deepEqual(await bounds(), quick);

    await win.evaluate(w => w.minimize());
    await app.evaluate(({ BrowserWindow }, modulePath) => {
      const other = new BrowserWindow({ width: 300, height: 200 });
      other.focus();
      const key = process.mainModule.require(modulePath).load('user32.dll').func('void __stdcall keybd_event(uint8_t, uint8_t, uint, uintptr_t)');
      for (const code of [0x11, 0x12, 0x86]) key(code, 0, 0, 0);
      for (const code of [0x86, 0x12, 0x11]) key(code, 0, 2, 0);
    }, require.resolve('koffi'));
    await expect.poll(() => win.evaluate(w => !w.isMinimized() && w.isFocused())).toBe(true);
    await expect(editor).toBeFocused();
    await expect.poll(() => editor.evaluate((e, expected) => e.value === expected, long)).toBe(true);
    await regular();
    await app.evaluate(({ BrowserWindow }, id) => BrowserWindow.getAllWindows().filter(w => w.id !== id).forEach(w => w.destroy()), await win.evaluate(w => w.id));

    await switchMode(true);
    await regular();
    await win.evaluate(w => w.maximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    await switchMode(false);
    assert.deepEqual(await bounds(), quick);
    await switchMode(true);
    assert(await win.evaluate(w => w.isMaximized()));
    await switchMode(false);
    assert.deepEqual(await bounds(), quick);
    await app.close();
    app = null;

    await launch();
    attachment = page.getByRole('dialog', { name: '当前便签附件' });
    assert.deepEqual(await bounds(), quick);
    await regular();
    await button(titles.at(-1)).click();
    await expect(page.locator('.quick-input')).toHaveValue(draft);
    await button('1 个附件').click();
    await expect(attachment.getByText('讨论资料.png')).toBeVisible();
    await page.keyboard.press('Escape');
    await button('新建便笺').click();
    await page.locator('.quick-input').fill('交叉引用同一张图片。');
    await saved();
    await button('0 个附件').click();
    await attachment.getByRole('button', { name: '文件中心引用' }).click();
    await page.getByRole('checkbox', { name: '选择附件 讨论资料.png' }).check();
    await button('添加所选（1）').click();
    await expect(button('1 个附件')).toBeVisible();
    assert.deepEqual(await bounds(), quick);
    await button('1 个附件').click();
    await attachment.getByRole('button', { name: '查看文件中心' }).click();
    const previewTrigger = button('预览 讨论资料.png');
    await expect(previewTrigger).toBeVisible();
    const fileBounds = await bounds();
    await previewTrigger.click();
    const preview = page.getByRole('dialog', { name: '讨论资料.png' });
    await expect(preview.getByRole('img', { name: '讨论资料.png' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(previewTrigger).toBeFocused();
    assert.deepEqual(await bounds(), fileBounds);
    await switchMode(false);
    await win.evaluate(w => w.maximize());
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    await switchMode(true);
    await switchMode(false);
    assert(await win.evaluate(w => w.isMaximized()));
    await app.close();
    app = null;
    await launch();
    await expect.poll(() => win.evaluate(w => w.isMaximized())).toBe(true);
    await win.evaluate(w => w.unmaximize());
    await expect.poll(bounds).toEqual(quick);
    assert.deepEqual(errors, []);
    console.log(`PASS DPR ${scale} ${theme}: native bounds, layout, recents, caret, attachment, settings, shortcut, maximize and restart`);
  } finally {
    await app?.close().catch(() => {});
    assert.equal(path.dirname(await fs.realpath(root)), await fs.realpath(os.tmpdir()));
    await fs.rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

(async () => {
  await fs.mkdir(output, { recursive: true });
  await verify(1, 'light');
  await verify(1.5, 'dark');
})().catch(error => { console.error(error); process.exitCode = 1; });
