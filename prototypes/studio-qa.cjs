const { chromium } = require('../node_modules/@playwright/test');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, 'dist'), output = path.resolve(__dirname, 'review/studio');
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', ({ '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.ttf': 'font/ttf' })[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 let browser;try{browser=await chromium.launch()}catch(e){server.close();throw e}
 const base=`http://127.0.0.1:${server.address().port}`,errors=[],metrics=[];
 try{
  for(const theme of ['light','dark']) for(const [width,height] of [[1440,900],[820,1000],[390,844],[320,700]]){
   const context=await browser.newContext({viewport:{width,height}});const page=await context.newPage();
   page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
   await page.goto(`${base}/studio.html?theme=${theme}`);await page.locator('.s-paper').first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(300);
   const shape=await page.evaluate(()=>{const frame=document.querySelector('.board-container').getBoundingClientRect();return{frame:{x:frame.x,y:frame.y,right:frame.right,bottom:frame.bottom},notes:[...document.querySelectorAll('.s-paper')].map(n=>{const r=n.getBoundingClientRect(),t=n.querySelector('textarea');return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,font:getComputedStyle(t).fontSize,transform:getComputedStyle(n).transform}}),pageWidth:document.documentElement.scrollWidth}});
   assert.ok(shape.pageWidth<=width,`${theme} ${width}: page width`);
   for(const n of shape.notes){assert.ok(n.x>=shape.frame.x-1&&n.right<=shape.frame.right+1,`${theme} ${width}: note horizontal containment`);assert.ok(n.y>=shape.frame.y-1&&n.bottom<=shape.frame.bottom+1,`${theme} ${width}: note vertical containment`);if(width<640){assert.equal(n.font,'16px');assert.equal(n.transform,'none');}}
   assert.equal(await page.locator('.studio-files').count(),0,'files initially closed');
   await page.screenshot({path:path.join(output,`${theme}-${width}-workspace.png`)});
   await page.getByRole('button',{name:'展开文件投递槽',exact:true}).click();await page.getByRole('dialog').waitFor();await page.waitForTimeout(250);
   const drawer=await page.locator('.studio-files').boundingBox();assert.ok(drawer.width>=Math.min(350,width-24),`${theme} ${width}: usable drawer width`);assert.ok(drawer.x>=0&&drawer.x+drawer.width<=width+.5,'drawer inside viewport');
   const title=await page.getByRole('heading',{name:'文件投递槽',exact:true}).boundingBox();assert.ok(title.width>100&&title.height<50,'horizontal drawer title');
   await page.getByLabel('选择原型文件').setInputFiles({name:'真实导入.txt',mimeType:'text/plain',buffer:Buffer.from('Studio real file read')});await page.waitForFunction(()=>document.querySelectorAll('.file-item').length===3);
   await page.waitForFunction(()=>[...document.querySelectorAll('.file-item')].every(n=>Number(getComputedStyle(n).opacity)>.99));
   await page.screenshot({path:path.join(output,`${theme}-${width}-files.png`)});
   await page.getByRole('button',{name:/布局草图.svg/}).click();await page.waitForFunction(()=>document.querySelector('.asset-preview img')?.naturalWidth>0 && Number(getComputedStyle(document.querySelector('.asset-preview')).opacity)>.99);
   await page.screenshot({path:path.join(output,`${theme}-${width}-preview.png`)});
   await page.getByRole('button',{name:'关闭文件预览',exact:true}).click();await page.getByRole('button',{name:/真实导入.txt/}).click();
   assert.equal(await page.getByRole('link',{name:'下载原文件'}).evaluate(async n=>await(await fetch(n.href)).text()),'Studio real file read');
   await page.getByRole('button',{name:'关闭文件预览',exact:true}).click();
   await page.keyboard.press('Tab');assert.ok(await page.evaluate(()=>!!document.activeElement.closest('.studio-files')),'drawer traps keyboard focus');
   await page.keyboard.press('Escape');await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(await page.getByRole('button',{name:'展开文件投递槽',exact:true}).evaluate(n=>n===document.activeElement),true,'focus restores to tray');
   if(width>=640){await page.keyboard.press('Control+k');await page.getByRole('combobox').fill('新建');await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelectorAll('.s-paper').length===3);await page.getByRole('button',{name:'删除新的想法',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.s-paper').length===2);
    const grip=page.locator('[data-note=capture] .paper-handle'),note=page.locator('[data-note=capture]');const before=await note.boundingBox(),h=await grip.boundingBox();await page.mouse.move(h.x+30,h.y+18);await page.mouse.down();await page.mouse.move(h.x+78,h.y+42,{steps:8});await page.mouse.up();await page.waitForFunction(x=>Math.abs(document.querySelector('[data-note=capture]').getBoundingClientRect().x-x-48)<2,before.x);
    await page.getByRole('button',{name:'适配全部便签',exact:true}).click();
    await page.keyboard.press('Control+k');await page.getByRole('combobox').fill('画笔');await page.keyboard.press('Enter');
    await page.waitForFunction(()=>document.querySelector('.studio-board').classList.contains('tool-pen'));
    await page.getByRole('dialog').waitFor({state:'hidden'});
    const canvas=await page.getByTestId('studio-board').boundingBox();await page.mouse.move(canvas.x+35,canvas.y+25);await page.mouse.down();await page.mouse.move(canvas.x+100,canvas.y+50,{steps:5});await page.mouse.up();await page.waitForFunction(()=>document.querySelectorAll('.studio-ink path').length===1,undefined,{timeout:3000}).catch(async e=>{console.log('draw-debug',theme,width,await page.locator('.studio-ink path').count(),await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.outerHTML.slice(0,180),{x:canvas.x+35,y:canvas.y+25}));throw e});
    await page.getByRole('button',{name:'模拟收起工作台',exact:true}).click();await page.getByRole('button',{name:'回到工作页',exact:true}).click();assert.equal(await page.locator('.studio-ink path').count(),1,'hide preserves drawings');
    await page.getByRole('button',{name:'选择工具',exact:true}).click();
    await page.keyboard.press('Control+k');await page.getByRole('combobox').waitFor();await page.keyboard.press('ArrowDown');await page.waitForTimeout(250);await page.screenshot({path:path.join(output,`${theme}-${width}-command.png`)});await page.keyboard.press('Escape');
   }else{
    const text=page.locator('.single-paper textarea');await text.fill('手机保持 16px 正文，直接编辑。');assert.equal(await page.locator('.single-paper footer').textContent(),'正在输入会话内容');await page.getByRole('button',{name:'打开便签列表',exact:true}).click();await page.getByRole('dialog').waitFor();await page.screenshot({path:path.join(output,`${theme}-${width}-list.png`)});await page.getByRole('button',{name:/先放在这里/}).click();assert.equal(await page.locator('.single-paper .paper-title').inputValue(),'先放在这里');await page.getByRole('button',{name:'画布总览',exact:true}).click();await page.locator('.studio-board').waitFor();await page.waitForTimeout(250);await page.screenshot({path:path.join(output,`${theme}-${width}-overview.png`)});await page.getByRole('button',{name:'返回编辑',exact:true}).click();
   }
   metrics.push({theme,width,height,shape,drawer,files:true,keyboard:true});await context.close();
  }
  const context=await browser.newContext({viewport:{width:820,height:1000},reducedMotion:'reduce',deviceScaleFactor:2});const page=await context.newPage();await page.goto(`${base}/studio.html`);await page.locator('.s-paper').first().waitFor();await page.waitForTimeout(150);await page.screenshot({path:path.join(output,'reduced-2x.png')});await context.close();
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify({metrics,errors},null,2));console.log(JSON.stringify({cases:metrics.length,errors,screenshots:output}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(e=>{console.error(e);process.exitCode=1});
