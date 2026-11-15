const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { selectOption } = require('./helpers/select-option.cjs');

(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-color-'));
  const shots = path.resolve(process.env.ARASN_VISUAL_SHOTS || 'docs/screenshots/color-batch3/pass1');
  await fs.mkdir(shots, { recursive: true });
  await fs.writeFile(path.join(data, 'settings.json'), JSON.stringify({ theme: 'light', shortcut: 'Control+Alt+F23' }));
  const env = { ...process.env, ARASN_DATA_DIR: data, ARASN_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  let app, page; const checks = [], errors = [];
  const button = name => page.getByRole('button', { name, exact: true });
  const close = async () => { await button('关闭弹窗').click(); await expect(page.getByRole('dialog', { name: '设置', exact: true })).toBeHidden(); };
  const capture = async (name, width, height) => {
    const win = await app.browserWindow(page);
    await win.evaluate((w, size) => { w.setMinimumSize(320, 400); w.setContentSize(...size); }, [width, height]);
    await expect.poll(() => page.evaluate(() => [innerWidth, innerHeight])).toEqual([width, height]);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      const css = getComputedStyle(document.documentElement);
      const token = name => css.getPropertyValue('--' + name).trim();
      const color = document.createElement('span'); document.body.append(color);
      const resolve = name => { color.style.color = `var(--${name})`; return getComputedStyle(color).color; };
      const pairs = [['xigra-text','ui-text-primary'],['xigra-brand','ui-action'],['xigra-on-brand','ui-on-action'],['xigra-focus','ui-focus'],['xigra-selected','ui-nav-active'],['xigra-surface','ui-surface-card']].map(([a,b]) => [a,b,resolve(a),resolve(b)]);
      const lum = value => value.match(/[\d.]+/g).slice(0,3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s,v,i) => s+v*[.2126,.7152,.0722][i],0);
      const ratio = (a,b) => { const x=lum(a),y=lum(b); return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); };
      const contrast = [['ui-text-primary','ui-surface-card',4.5],['ui-text-secondary','ui-surface-app',4.5],['ui-text-muted','ui-surface-card',4.5],['ui-on-action','ui-action',4.5],['ui-nav-on-active','ui-nav-active',4.5],['ui-border-control','ui-surface-card',3],['ui-focus','ui-surface-card',3],['xigra-success','xigra-success-bg',4.5],['xigra-warning','xigra-warning-bg',4.5],['xigra-error','xigra-error-bg',4.5]].map(([a,b,min]) => ({ a,b,min,ratio:ratio(resolve(a),resolve(b)) }));
      color.remove();
      const primary = document.querySelector('.header-actions .new-note');
      const primaryContrast = primary ? ratio(getComputedStyle(primary).color,getComputedStyle(primary).backgroundColor) : null;
      return { theme: document.documentElement.dataset.theme, width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, pairs, contrast, primaryContrast, app: token('desk') };
    });
    checks.push({ name, ...result });
    await page.screenshot({ path: path.join(shots, name+'.png'), scale: 'css', animations: 'disabled' });
    assert(!result.overflow, name + ': overflow');
    for (const [a,b,x,y] of result.pairs) assert.equal(x,y,`${name}: ${a} must share ${b}`);
    for (const c of result.contrast) assert(c.ratio >= c.min, `${name}: ${c.a}/${c.b} = ${c.ratio}`);
    if (result.primaryContrast !== null) assert(result.primaryContrast >= 4.5, `${name}: primary text ${result.primaryContrast}`);
  };
  try {
    app = await electron.launch({ ...(process.env.ARASN_TEST_EXE ? { executablePath: process.env.ARASN_TEST_EXE, args: [] } : { args: ['.'] }), cwd: path.resolve(__dirname,'..'), env });
    page = await app.firstWindow(); page.on('pageerror', e => errors.push(e.message));
    const win = await app.browserWindow(page);
    await win.evaluate(w => { w.show(); w.focus(); });
    await page.locator('.quick-input:enabled').fill('配色验收\n正文与绘图颜色不随界面重写。');
    await expect(page.locator('.save-state')).toHaveText('已保存');
    await button('打开工作区').click();
    await button('打开关系画布').click(); await button('备份并启用关系画布').click();
    const board = () => page.evaluate(async () => (await fetch('/api/board', { headers: { Authorization: `Bearer ${sessionStorage.getItem('arasn-token')}` } })).json());
    await expect.poll(async () => Object.values((await board()).items).filter(item => item.value?.type === 'canvas-node').length).toBe(1);
    const original = await board();
    for (const theme of ['light','dark']) {
      await button('设置与快捷键').last().click(); await selectOption(page,'外观主题',theme);
      await expect(page.locator('html')).toHaveAttribute('data-theme',theme);
      await capture(`settings-${theme}`,1440,900); await close();
      for (const [key,name] of [['canvas','我的随手页'],['records','便笺列表'],['files','文件'],['relation','打开关系画布']]) {
        await button(name).click();
        await capture(`${key}-${theme}-1440`,1440,900);
        if (key === 'files') {
          await expect(button('下一页')).toBeDisabled();
          const target = button('便笺列表');
          const idle = await target.evaluate(el => getComputedStyle(el).backgroundColor);
          await target.hover();
          await expect.poll(() => target.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(idle);
          await expect(button('文件')).toHaveAttribute('aria-current','page');
          await target.focus(); await page.keyboard.press('Tab');
          assert(await page.locator(':focus-visible').count() > 0, 'keyboard focus remains visible');
          await capture(`navigation-states-${theme}`,1440,900);
        }
      }
      await capture(`relation-${theme}-820`,820,650);
      await capture(`relation-${theme}-390`,390,700);
      await capture(`back-${theme}`,1440,900);
    }
    assert.deepEqual(await board(),original);
    await button('切换到便签区').click(); await capture('compact-dark',500,540);
    assert.deepEqual(errors,[]);
    console.log('PASS color roles, specified contrast pairs, four pages, settings, compact, 1440/820/390 and unchanged board');
  } catch (error) { console.error(error); process.exitCode=1; }
  finally {
    await fs.writeFile(path.join(shots,'verification.json'),JSON.stringify({checks,errors},null,2));
    if(app) await app.close();
    const resolved=await fs.realpath(data); assert.equal(path.dirname(resolved),await fs.realpath(os.tmpdir()));
    assert(path.basename(resolved).startsWith('arasn-color-')); await fs.rm(resolved,{recursive:true,force:true});
  }
})();
