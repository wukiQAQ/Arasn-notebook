const { selectOption } = require("./helpers/select-option.cjs");
const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const baseline = process.argv.includes('--baseline');
const output = path.join(root, 'docs/screenshots/xigra-unified', baseline ? 'before' : 'after');
const report = {};

async function review() {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'xigra-theme-'));
  let app;
  try {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F13' }));
    const sample = path.join(data, '交付清单.txt');
    await fs.writeFile(sample, 'XIGRA 视觉验收样本');
    app = await electron.launch({ args: ['.'], cwd: root, env: { ...process.env, ARASN_SMOKE: '1', ARASN_DATA_DIR: data } });
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await win.evaluate(w => { w.show(); w.focus(); });
    const workbench = () => page.getByRole('button', { name: '打开工作区', exact: true });
    const collapse = () => page.getByRole('button', { name: '切换到便签区', exact: true });
    const files = () => page.getByRole('button', { name: '文件', exact: true });
    const share = () => ({ click: async () => { await page.getByRole("button", { name: "设备互传", exact: true }).click(); await page.getByRole("button", { name: "打开白板共享", exact: true }).click(); } });
    const close = () => page.getByRole('button', { name: '关闭弹窗', exact: true });
    const size = async (width, height) => {
      // Validate design viewports without altering the app's production sizing rules.
      await win.evaluate((w, dimensions) => { w.setMinimumSize(1, 1); w.setContentSize(...dimensions); }, [width, height]);
      await page.waitForFunction(([w, h]) => innerWidth === w && innerHeight === h, [width, height]);
    };
    const capture = async (name, selectors, bounds = []) => {
      const metrics = await page.evaluate(({ selectors, bounds }) => {
        function effectiveBackground(element) {
          while (element) {
            const color = getComputedStyle(element).backgroundColor;
            if (color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') return color;
            element = element.parentElement;
          }
          return 'rgb(255, 255, 255)';
        }
        const context = document.createElement('canvas').getContext('2d');
        const lum = color => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(c => {
            const x = c / 255;
            return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
          }).reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
        };
        const contrast = (first, second) => {
          const a = lum(first), b = lum(second);
          return +((Math.max(a, b) + .05) / (Math.min(a, b) + .05)).toFixed(2);
        };
        const samples = Object.fromEntries(Object.entries(selectors).map(([key, selector]) => {
          const element = document.querySelector(selector);
          if (!element) throw Error(`Missing ${selector}`);
          const style = getComputedStyle(element);
          const bg = effectiveBackground(element);
          return [key, { color: style.color, background: bg, border: style.borderColor, radius: style.borderRadius, size: style.fontSize, weight: style.fontWeight, font: style.fontFamily, shadow: style.boxShadow, ratio: contrast(style.color, bg) }];
        }));
        const clipped = bounds.filter(selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return r.right > innerWidth + 1 || r.bottom > innerHeight + 1 || r.left < -1 || r.top < -1 || r.height === 0;
        });
        const colors = getComputedStyle(document.documentElement);
        const token = name => colors.getPropertyValue(`--xigra-${name}`).trim();
        const nonText = {
          focusOnSurface: contrast(token('focus'), token('surface')),
          focusOnWindow: contrast(token('focus'), token('window')),
          controlOnSurface: contrast(token('control-border'), token('surface')),
          controlOnWindow: contrast(token('control-border'), token('window')),
        };
        return { viewport: [innerWidth, innerHeight], samples, nonText, clipped, horizontalOverflow: document.documentElement.scrollWidth > innerWidth };
      }, { selectors, bounds });
      await page.screenshot({ path: path.join(output, `${name}.png`), scale: 'css', animations: 'disabled', mask: [page.locator('.share-link input')], maskColor: '#71857c' });
      report[name] = metrics;
      if (!baseline) {
        assert.deepEqual(metrics.clipped, [], name);
        assert.equal(metrics.horizontalOverflow, false, name);
        for (const [label, sample] of Object.entries(metrics.samples)) assert.ok(sample.ratio >= 4.5, `${name} ${label}: ${sample.ratio}`);
        for (const [label, ratio] of Object.entries(metrics.nonText)) assert.ok(ratio >= 3, `${name} ${label}: ${ratio}`);
      }
    };
    const editor = page.locator('.quick-input');
    await editor.fill('会议之后，把确认的事项放进工作站。\n明早核对交付清单。');
    await expect(page.locator('.xigra-save-state')).toHaveText('已保存');
    await page.evaluate(() => {
      const input = document.createElement('input');
      input.type = 'file'; input.id = 'theme-fixture'; input.hidden = true;
      document.body.append(input);
    });
    await page.locator('#theme-fixture').setInputFiles(sample);
    await page.evaluate(() => {
      const input = document.querySelector('#theme-fixture');
      const transfer = new DataTransfer();
      transfer.items.add(input.files[0]);
      document.querySelector('.quick-panel').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
      input.remove();
    });
    await expect(page.locator('.xigra-import-message')).toHaveText('已存入 1 个文件');
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') {
        await workbench().click();
        await page.locator('.sidebar').getByRole('button', { name: '设置与快捷键' }).click();
        await selectOption(page, "外观主题", theme);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await close().click();
        await page.locator('.toast').waitFor({ state: 'hidden' });
        await collapse().click();
      }
      for (const [w, h] of [[480, 560], [400, 460]]) {
        await size(w, h);
        await editor.focus();
        await capture(`${theme}-quick-${w}x${h}`, { editor: '.quick-input', title: '.xigra-note-heading h1', workbench: '.xigra-view-switch', saved: '.xigra-save-state' }, ['.quick-header', '.quick-content', '.quick-footer']);
      }
      if (!baseline) {
        await page.keyboard.press('Tab');
        const add = page.getByRole('button', { name: '添加文件', exact: true });
        await expect(add).toBeFocused();
        assert.equal(await add.evaluate(button => button.matches(':focus-visible') && getComputedStyle(button).outlineWidth === '2px'), true);
      }
      await workbench().click();
      await page.getByRole('button', { name: '我的随手页', exact: true }).click();
      await size(960, 680);
      await capture(`${theme}-workbench-960x680`, { nav: '.lagoon-rail .space.active', title: '.breadcrumb strong', primary: '.new-note', note: '.note textarea' }, ['.topbar', '.workspace', '.lagoon-tray']);
      await files().click();
      await expect(page.locator('.file-row')).toHaveCount(1);
      await capture(`${theme}-files`, { item: '.file-row strong', meta: '.file-row small', field: '.file-search input', primary: '.file-primary' }, ['.lagoon-files']);
      if (!baseline) {
        await page.getByRole('textbox', { name: '搜索文件', exact: true }).fill('没有匹配的项目');
        await expect(page.locator('.xigra-empty')).toHaveText('没有符合筛选条件的文件。');
        await capture(`${theme}-files-empty`, { empty: '.xigra-empty', field: '.file-search input' }, ['.lagoon-files']);
      }
      await page.getByRole('button', { name: '关闭文件', exact: true }).click();
      await share().click();
      await capture(`${theme}-share-idle`, { state: '.share-state span', primary: '.share-state button', notice: '.privacy-note' }, ['.modal']);
      await page.getByRole('button', { name: '开启共享', exact: true }).click();
      await expect(page.getByRole('button', { name: '停止共享', exact: true })).toBeEnabled();
      const linkControls = (await page.locator('.share-link').count()) ? { link: '.share-link input', copy: '.share-link button' } : {};
      await capture(`${theme}-share-active`, { state: '.share-state span', stop: '.share-state button', notice: '.privacy-note', ...linkControls }, ['.modal']);
      await page.getByRole('button', { name: '停止共享', exact: true }).click();
      await expect(page.getByRole('button', { name: '开启共享', exact: true })).toBeEnabled();
      await close().click();
      await collapse().click();
    }
    assert.deepEqual(errors, []);
    console.log(`Captured ${Object.keys(report).length} ${baseline ? 'baseline' : 'verified'} Electron screenshots`);
  } finally {
    await fs.writeFile(path.join(output, 'checks.json'), JSON.stringify(report, null, 2));
    if (app) await app.close();
    const target = await fs.realpath(data);
    if (path.dirname(target) === await fs.realpath(os.tmpdir()) && path.basename(target).startsWith('xigra-theme-')) await fs.rm(target, { recursive: true, force: true });
  }
}
review().catch(error => { console.error(error); process.exitCode = 1; });
