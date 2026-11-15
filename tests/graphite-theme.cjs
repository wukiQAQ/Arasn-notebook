const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = process.env.ARASN_TEST_SCREENSHOTS || path.join(root, 'test-results/graphite-theme');

async function review() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-graphite-'));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F13' }));
    app = await electron.launch({ args: ['.'], cwd: root, env });
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    await win.evaluate(window => { window.show(); window.focus(); });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const button = name => page.getByRole('button', { name, exact: true });
    const expand = () => button('打开工作区').click();
    const compact = () => button('切换到便签区').click();
    const editor = () => page.getByRole('textbox', { name: '便笺文字', exact: true });
    const report = {};
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const notes = [
      '交互稿 · 校对清单\n\n检查窗口缩到 400 px 时的阅读顺序。\n确认文件与收件入口的状态文案。',
      '周五评审材料\n\n把两种主题和三个窗口尺寸放到同一页。\n记录焦点、对比度和最小窗口的表现。',
      '本周工作安排\n\n周一  收集原型反馈\n周三  核对交接清单\n周五  评审视觉细节',
    ];

    for (const [index, note] of notes.entries()) {
      if (index > 0) await button('新建便笺').click();
      await editor().fill(note);
      await expect(page.locator('.xigra-save-state')).toHaveText('已保存');
    }
    await expand();
    const file = path.join(data, '窗口验收清单.txt');
    await fs.writeFile(file, '用于隔离工作区的视觉验证。');
    await app.evaluate(({ dialog }, file) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    }, file);
    await button('文件').click();
    await button('导入文件').click();
    await expect(page.locator('.file-row')).toContainText('窗口验收清单.txt');
    await button('关闭文件').click();
    await compact();

    async function capture(name, width, height, selectors) {
      await win.evaluate((window, dimensions) => { window.setMinimumSize(1, 1); window.setContentSize(...dimensions); }, [width, height]);
      await page.waitForFunction(([width, height]) => innerWidth === width && innerHeight === height, [width, height]);
      const layout = await page.evaluate(selectors => {
        const bounds = selectors.map(selector => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return { selector, fits: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1 };
        });
        const style = getComputedStyle(document.documentElement);
        const token = key => style.getPropertyValue(`--xigra-${key}`).trim();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const lum = color => {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(channel => {
            const x = channel / 255;
            return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
          }).reduce((l, x, index) => l + x * [.2126, .7152, .0722][index], 0);
        };
        const contrast = (a, b) => {
          const x = lum(a), y = lum(b);
          return Number(((Math.max(x, y) + .05) / (Math.min(x, y) + .05)).toFixed(2));
        };
        const levels = ['l0', 'l1', 'l2', 'l3'].map(key => style.getPropertyValue(`--graphite-${key}`).trim());
        const ratios = {
          editor: contrast(token('text'), levels[2]), metadata: contrast(token('muted'), levels[1]),
          primary: contrast(token('on-brand'), token('brand')), selected: contrast(token('on-selected'), token('selected')),
          focusOnSurface: contrast(token('focus'), levels[2]), mutedInPopup: contrast(token('muted'), levels[3]),
        };
        const normalize = color => { ctx.fillStyle = color; return ctx.fillStyle; };
        const surfaces = Object.entries({
          '.app-shell': 0, '.sidebar.lagoon-rail': 1, '.xigra-record-index': 1, '.xigra-record-paper': 2,
          '.quick-content': 2, '.lagoon-files': 3, '.xigra-lan-dialog': 3,
        }).flatMap(([selector, level]) => {
          const element = document.querySelector(selector);
          if (!element) return [];
          return [{ selector, actual: normalize(getComputedStyle(element).backgroundColor), expected: normalize(levels[level]) }];
        });
        return { bounds, noOverflow: document.documentElement.scrollWidth <= innerWidth, levels, ratios, surfaces };
      }, selectors);
      assert.ok(layout.noOverflow && layout.bounds.every(bound => bound.fits), JSON.stringify({ name, ...layout }));
      assert.equal(new Set(layout.levels).size, 4);
      assert.ok(layout.levels.every(color => /^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(color)), JSON.stringify(layout.levels));
      assert.ok(layout.surfaces.every(surface => surface.actual === surface.expected), JSON.stringify(layout.surfaces));
      assert.ok(Object.entries(layout.ratios).every(([key, ratio]) => ratio >= (key === 'focusOnSurface' ? 3 : 4.5)), JSON.stringify(layout.ratios));
      const png = await page.screenshot({ path: path.join(output, `${name}.png`), scale: 'css', animations: 'disabled' });
      assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [width, height]);
      report[name] = layout;
    }

    for (const theme of ['light', 'dark']) {
      await expand();
      if (await page.locator('html').getAttribute('data-theme') !== theme) await button('切换主题').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page.locator('.xigra-record-index').getByRole('button', { name: /^本周工作安排/ }).click();
      await expect(editor()).toHaveValue(notes[2]);
      await page.locator('.toast').waitFor({ state: 'hidden' });
      await capture(`graphite-${theme}-workbench-960x680`, 960, 680, ['.topbar', '.sidebar-bottom', '.xigra-record-paper', '.lagoon-tray']);
      await expect(button('写一张便笺')).toHaveCSS('transition-duration', '0s');
      if (theme === 'light') {
        const menu = button('管理当前便笺');
        await menu.press('Enter');
        await expect(page.getByRole('menuitem', { name: '置顶便笺', exact: true })).toBeFocused();
        await capture('graphite-light-menu', 960, 680, ['.xigra-record-menu']);
        await page.keyboard.press('Escape');
        await expect(menu).toBeFocused();
      }
      const files = button('文件');
      await files.focus();
      await page.keyboard.press('Tab');
      await expect(button('设备互传')).toBeFocused();
      await expect(button('设备互传')).toHaveCSS('outline-width', '2px');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: '设备互传' })).toBeVisible();
      if (theme === 'light') await capture('graphite-light-transfer', 960, 680, ['.device-hub']);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: '设备互传' })).toBeHidden();
      await files.click();
      await expect(page.locator('.file-row')).toContainText('窗口验收清单.txt');
      if (theme === 'dark') await capture('graphite-dark-files', 960, 680, ['.lagoon-files', '.file-row']);
      await button('关闭文件').click();
      await compact();
      await expect(editor()).toHaveValue(notes[2]);
      await editor().blur();
      for (const [width, height] of [[480, 560], [400, 460]]) {
        await capture(`graphite-${theme}-compact-${width}x${height}`, width, height, ['.quick-header', '.quick-content', '.quick-footer']);
        await expect(page.locator('.xigra-shell')).toHaveCSS('padding-left', width === 480 ? '24px' : '16px');
      }
    }
    const edited = `${notes[2]}\n已完成窗口检查。`;
    await editor().fill(edited);
    await expect(page.locator('.xigra-save-state')).toHaveText('已保存');
    await expand();
    await expect(editor()).toHaveValue(edited);
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(report, null, 2));
    console.log(`PASS ${Object.keys(report).length} Electron captures, shared record, file import, keyboard focus, transfer dialog and contrast`);
  } finally {
    if (app) await app.close();
    await fs.rm(data, { recursive: true, force: true });
  }
}

review().catch(error => { console.error(error); process.exitCode = 1; });
