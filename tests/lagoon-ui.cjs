const { _electron: electron, expect } = require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'arasn-lagoon-'));const output=path.resolve('docs/screenshots/redesign/lagoon-native');await fs.mkdir(output,{recursive:true});
 const env={...process.env,ARASN_DATA_DIR:path.join(root,'data'),ARASN_SMOKE:'1'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await electron.launch({executablePath:path.resolve('release/ArasnNotebook-0.6.0-lagoon-win32-x64/ArasnNotebook.exe'),args:['--disable-gpu'],env});const errors=[],proof={};
 let page;
 const screenshotIssues=[];
 const shot=async name=>{try{await page.screenshot({path:path.join(output,name),animations:'disabled',timeout:3000})}catch(e){screenshotIssues.push({name,error:e.message.split('\n')[0]})}};
 try{
  page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
  await page.getByRole('tab',{name:'打字',exact:true}).waitFor();await shot('quick.png');
  await page.getByRole('button',{name:'展开完整页面',exact:true}).click();
  const win=await app.browserWindow(page);await win.evaluate(w=>{w.setResizable(true);w.setContentSize(1440,900)});
  await page.getByRole('button',{name:'写一张便笺',exact:true}).click();await page.getByRole('textbox',{name:'便笺文字'}).first().fill('轻泊 · 正式应用验证\n真实存储、文件与共享能力保留。');
  await page.waitForFunction(()=>document.querySelector('.save-state')?.textContent==='已保存');
  const pen=page.getByRole('button',{name:'自由绘图',exact:true});await pen.hover();
  await page.waitForFunction(()=>document.querySelector('[data-lagoon-icon=pen]')?.getAnimations().length>0);proof.hoverMotion=true;
  await page.emulateMedia({reducedMotion:'reduce'});await page.mouse.move(0,0);await pen.hover();assert.equal(await pen.locator('svg').evaluate(n=>n.getAnimations().length),0);proof.reducedMotion=true;await page.emulateMedia({reducedMotion:'no-preference'});
  await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'搜索命令'}).fill('文件');await page.keyboard.press('Enter');await page.getByRole('dialog',{name:'文件',exact:true}).waitFor();
  const source=path.join(root,'正式文件.txt');await fs.writeFile(source,'Real local file import');
  await page.evaluate(()=>{const i=document.createElement('input');i.type='file';i.id='native-file';document.body.append(i)});await page.locator('#native-file').setInputFiles(source);
  await page.evaluate(()=>{const dt=new DataTransfer();for(const f of document.querySelector('#native-file').files)dt.items.add(f);document.querySelector('.lagoon-files .file-station').dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true}))});
  await expect(page.locator('.lagoon-files .file-row')).toHaveCount(1);proof.realFileImport=true;await shot('files-desktop.png');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'适配内容',exact:true}).click();await shot('desktop.png');
  await page.getByRole('button',{name:'切换主题',exact:true}).click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await shot('desktop-dark.png');
  for(const width of [820,390]){await win.evaluate((w,width)=>{w.setResizable(true);w.setMinimumSize(320,500);w.setContentSize(width,844);w.show();w.focus()},width);await page.waitForTimeout(250);await page.getByRole('button',{name:'文件',exact:true}).click();await page.getByRole('dialog',{name:'文件',exact:true}).waitFor();const r=await page.locator('.lagoon-files').boundingBox();assert.ok(r.width>=Math.min(350,width-24));const viewport=await page.evaluate(()=>innerWidth);assert.ok(r.x>=0&&r.x+r.width<=viewport+1);proof['viewport'+width]=viewport;proof['drawer'+width]=r;await shot('files-'+width+'.png');await page.keyboard.press('Escape');await shot('workspace-'+width+'.png')}
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'checks.json'),JSON.stringify({proof,errors,screenshotIssues},null,2));console.log(JSON.stringify({proof,errors,screenshotIssues}));
 }finally{await app.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
