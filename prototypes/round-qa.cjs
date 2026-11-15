const { chromium } = require('../node_modules/@playwright/test');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, 'dist'), output = path.resolve(__dirname, 'review/round');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try { browser = await chromium.launch(); } catch (error) { server.close(); throw error; }
  const base = `http://127.0.0.1:${server.address().port}`, errors = [], report = [];
  try {
    for (const concept of ['mellow','cove','afterglow']) {
      const context = await browser.newContext({viewport:{width:1440,height:1000}});
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(`${concept}: ${error.message}`));
      page.on('console', msg => {if(msg.type()==='error') errors.push(`${concept}: ${msg.text()}`)});
      await page.goto(`${base}/round.html?concept=${concept}`);
      await page.locator('.note').first().waitFor(); await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(500);
      assert.equal(await page.locator('.note').count(),2);
      assert.equal(await page.locator('.arasn-glyph').count() >= 10,true);
      await page.screenshot({path:path.join(output,`${concept}-desktop.png`)});
      await page.getByRole('button',{name:'查看原型说明'}).click();
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+k');
      await page.getByRole('combobox').fill('新建'); await page.keyboard.press('Enter');
      await page.waitForFunction(()=>document.querySelectorAll('.note').length===3);
      await page.getByRole('button',{name:'删除新的想法',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.note').length===2);
      const note=page.locator('[data-note=capture]'), grip=note.locator('.note-grip');
      const before=await note.boundingBox(), handle=await grip.boundingBox();
      await page.mouse.move(handle.x+30,handle.y+20); await page.mouse.down(); await page.mouse.move(handle.x+78,handle.y+44,{steps:8});await page.mouse.up();
      await page.waitForFunction(x=>Math.abs(document.querySelector('[data-note=capture]').getBoundingClientRect().x-x-48)<2,before.x);
      await page.getByLabel('便签正文 capture').fill('真实编辑的便签内容');
      await page.getByRole('button',{name:'放大画布',exact:true}).click();
      assert.ok((await note.boundingBox()).width>before.width);
      await page.getByRole('button',{name:'重置画布视角',exact:true}).click();
      await page.getByLabel('选择原型文件').setInputFiles({name:'演示导入.txt',mimeType:'text/plain',buffer:Buffer.from('Real round demo import')});
      await page.waitForFunction(()=>document.querySelectorAll('.file-item').length===3);
      await page.locator('.file-item').filter({hasText:'演示导入.txt'}).click();
      await page.getByRole('link',{name:'下载原文件'}).waitFor();
      await page.getByRole('button',{name:'关闭文件预览'}).click();
      await page.keyboard.press('Control+k');await page.getByRole('combobox').fill(''); await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);await page.screenshot({path:path.join(output,`${concept}-command.png`)});await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'模拟收起工作台',exact:true}).click();
      await page.getByRole('button',{name:'继续工作',exact:true}).click();
      assert.equal(await page.getByLabel('便签正文 capture').inputValue(),'真实编辑的便签内容');
      for(const width of [820,390]) {
        await page.setViewportSize({width,height:width===390?844:1000});await page.waitForTimeout(600);
        await page.screenshot({path:path.join(output,`${concept}-${width}-files.png`)});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${concept} ${width} width`);
        await page.getByRole('button',{name:'收起文件中转站',exact:true}).click();await page.waitForTimeout(300);
        await page.screenshot({path:path.join(output,`${concept}-${width}-canvas.png`)});
        const toggle=page.getByRole('button',{name:'切换投递槽',exact:true}); await toggle.first().click();await page.waitForTimeout(300);
      }
      report.push({concept,commands:true,drag:true,edit:true,zoom:true,realFileRead:true,hidePreservesContent:true,responsive:true});
      await context.close();
    }
    const context=await browser.newContext({viewport:{width:820,height:1000},deviceScaleFactor:2,reducedMotion:'reduce'});
    const page=await context.newPage();await page.goto(`${base}/round.html?concept=cove`);await page.locator('.note').first().waitFor();
    await page.screenshot({path:path.join(output,'cove-reduced-2x.png')});await context.close();
    assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({report,errors},null,2));
    console.log(JSON.stringify({variants:report.length,errors,screenshots:output}));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
