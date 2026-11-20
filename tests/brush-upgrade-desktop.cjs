const { _electron:electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');

(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'arasn-brush-'));
 const shots=path.resolve(process.env.ARASN_VISUAL_SHOTS||'docs/screenshots/brush-upgrade');
 await fs.mkdir(shots,{recursive:true});
 const old=randomUUID(),legacy={type:'stroke',color:'#4668c6',width:4,points:[[-30000,-30000],[-29900,-30000]]};
 createStore(path.join(data,'board.json')).apply({id:old,value:legacy,opId:randomUUID(),expected:0});
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({theme:'light',shortcut:'Control+Alt+F23'}));
 const env={...process.env,ARASN_DATA_DIR:data,ARASN_SMOKE:'1'};delete env.ELECTRON_RUN_AS_NODE;
 let app,page,win; const errors=[];
 const button=name=>page.getByRole('button',{name,exact:true});
 const label=name=>page.getByLabel(name,{exact:true});
 const panel=()=>page.locator('.tool-settings-popup');
 const snapshot=()=>page.evaluate(async()=>(await fetch('/api/board',{headers:{Authorization:`Bearer ${sessionStorage.getItem('arasn-token')}`}})).json());
 const strokes=async()=>Object.values((await snapshot()).items).map(i=>i.value).filter(v=>v?.type==='stroke'&&v!==null);
 const count=n=>expect.poll(async()=>(await strokes()).length).toBe(n);
 const capture=name=>page.screenshot({path:path.join(shots,name+'.png'),scale:'css',animations:'disabled'});
 const size=async(w,h=900)=>{
  await win.evaluate((win,[w,h])=>{win.unmaximize();win.setResizable(true);win.setMinimumSize(320,400);win.setContentSize(w,h);win.show();win.focus();},[w,h]);
  await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(w);
 };
 const launch=async()=>{
  app=await electron.launch({args:['.'],cwd:path.resolve(__dirname,'..'),env});page=await app.firstWindow();
  page.setDefaultTimeout(7500);page.on('pageerror',e=>errors.push(e.message));
  win=await app.browserWindow(page);
  await expect(button('我的随手页')).toBeEnabled();
  await button('我的随手页').click();
  await size(1440);
  await button('重置视图为100%').click();
 };
 const stop=async()=>{
  if(!app)return;
  const exit=new Promise(resolve=>app.process().once('exit',resolve));
  await app.evaluate(({app})=>app.exit(0));await exit;app=null;
 };
 const openPen=async()=>{await button('自由绘图').click();if(!await panel().isVisible())await button('自由绘图').click();await expect(panel()).toBeVisible();};
 const close=()=>button('关闭工具设置').click();
 const draw=async(x,y,w=280)=>{
  await page.mouse.move(x,y);await page.mouse.down();
  for(let i=1;i<=36;i++)await page.mouse.move(x+w*i/36,y-15*Math.sin(i/36*Math.PI*3));
  await page.mouse.up();
 };
 const brushNames=['硬笔','铅笔','马克笔','荧光笔','毛笔','虚线笔'];
 const kinds=['ink','pencil','marker','highlighter','calligraphy','dash'];
 try {
  await launch();await openPen();
  const slider=label('画笔粗细'),number=label('粗细数值（px）');
  await expect(slider).toHaveAttribute('step','0.5');
  const bar=await slider.boundingBox();
  await page.mouse.move(bar.x+bar.width*.1,bar.y+bar.height/2);await page.mouse.down();
  await page.mouse.move(bar.x+bar.width*.63,bar.y+bar.height/2,{steps:8});await page.mouse.up();
  assert(Number(await slider.inputValue())>20);
  await number.fill('7.5');await number.press('ArrowUp');await expect(number).toHaveValue('8');await number.press('Enter');
  await expect(slider).toHaveValue('8');
  await expect(page.getByRole('img',{name:'笔刷预览'}).locator('path')).toHaveAttribute('stroke-width','8');
  assert(await panel().evaluate(el=>el.scrollHeight<=el.clientHeight+2));
  await capture('slider-light');
  await button('自由绘图').click();await expect(panel()).toBeHidden();
  const canvas=await page.getByRole('region',{name:'自由画布'}).boundingBox();
  const x=Math.round(canvas.x+canvas.width*.36),y=Math.round(canvas.y+110);
  for(let i=0;i<kinds.length;i++){
   await openPen();await panel().getByRole('button',{name:brushNames[i],exact:true}).click();
   if(i===0)await expect(number).toHaveValue('8');
   if(i===5){
    await page.getByText('高级参数',{exact:true}).click();
    await label('虚线长度').fill('13');await label('虚线间距').fill('7');
   }
   await close();await draw(x+80,y+63*i);
   await count(i+2);
  }
  const original=await snapshot();assert.deepEqual(original.items[old].value,legacy);
  const six=(await strokes()).filter(s=>s.inkVersion);
  assert.deepEqual(six.map(s=>s.brush),kinds);assert.equal(six[0].width,8);assert.equal(six[3].opacity,.35);
  assert.equal(six[5].dashLength,13);assert.equal(six[5].dashGap,7);
  assert(new Set(six[4].points.map(p=>p[2])).size>5);
  await openPen();await panel().getByRole('button',{name:'硬笔',exact:true}).click();await expect(number).toHaveValue('8');
  await capture('six-brushes');
  await panel().getByRole('button',{name:'虚线笔',exact:true}).click();
  await page.getByText('画笔预设',{exact:true}).click();
  await label('预设名称').fill('流程草图');await button('保存当前笔刷').click();
  await expect(label('自定义预设')).toHaveValue('0');await button('重命名').click();
  await label('预设名称').fill('流程线');await button('保存名称').click();
  await expect(label('自定义预设').locator('option').last()).toHaveText('流程线');
  await capture('presets');
  await close();
  await button('橡皮擦').click();await button('橡皮擦').click();
  await page.getByRole('combobox',{name:'擦除模式'}).click();
  await page.locator('.app-select-item[data-value="partial"]').click();await close();
  await page.mouse.move(x+205,y+63);await page.mouse.down();await page.mouse.move(x+205,y+98,{steps:6});await page.mouse.up();
  await count(8);
  assert.equal((await strokes()).filter(v=>v.brush==='pencil').length,2);
  await button('撤销上次操作').click();await count(7);
  await button('重做上次操作').click();await count(8);
  await button('撤销上次操作').click();await count(7);
  await openPen();await panel().getByRole('button',{name:'毛笔',exact:true}).click();await close();
  const cdp=await page.context().newCDPSession(page);
  const pen=(type,x,y,force)=>cdp.send('Input.dispatchMouseEvent',{type,x,y,force,pointerType:'pen',button:type==='mouseMoved'?'none':'left',buttons:type==='mouseReleased'?0:1});
  await pen('mousePressed',x+415,y+130,.2);
  await pen('mouseMoved',x+438,y+130,.8);await pen('mouseMoved',x+462,y+130,.45);
  await pen('mouseReleased',x+462,y+130,0);await count(8);
  const samples=(await strokes()).at(-1).points.map(p=>p[2]);
  assert(samples.some(p=>p>.75)&&samples.some(p=>p<.3),JSON.stringify(samples));
  await button('撤销上次操作').click();await count(7);
  await button('橡皮擦').click();await button('橡皮擦').click();
  await page.getByRole('combobox',{name:'擦除模式'}).click();
  await page.locator('.app-select-item[data-value="stroke"]').click();await close();
  await page.mouse.click(x+130,y);await count(6);
  await button('撤销上次操作').click();await count(7);
  await button('截图 / 导出').click();
  await page.getByRole('combobox',{name:'导出倍率'}).click();
  await page.locator('.app-select-item[data-value="2"]').click();
  await button('生成预览').click();
  await expect(page.locator('.capture-preview img')).toBeVisible();
  const output=path.join(shots,'brush-export.png');
  await fs.rm(output,{force:true});
  await app.evaluate(({session},file)=>session.fromPartition('persist:arasn').once('will-download',(_event,item)=>item.setSavePath(file)),output);
  await button('保存 PNG').click();
  await expect.poll(()=>fs.readFile(output).then(bytes=>bytes.readUInt32BE(16)).catch(()=>0)).toBe(Math.round(canvas.width*2));
  const png=await fs.readFile(output);
  assert.equal(png.readUInt32BE(16),Math.round(canvas.width*2));
  assert.equal(png.readUInt32BE(20),Math.round(canvas.height*2));
  await button('关闭截图导出').click();
  await page.mouse.move(x+190,y+75);await page.mouse.wheel(0,-130);
  await expect(button('重置视图为100%')).not.toHaveText('100%');
  await button('重置视图为100%').click();
  await page.evaluate(async()=>{
   await window.desktop.settings({theme:'dark',appearance:{preset:'arasn',accent:'#5CA887',background:null,foreground:null,font:'system',scale:'standard'}});
  });
  await stop();await launch();await count(7);await openPen();
  assert.equal((await page.evaluate(()=>window.desktop.info())).appearance.accent,'#5CA887');
  await expect(panel().getByRole('button',{name:'毛笔',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.getByText('画笔预设',{exact:true}).click();
  await label('自定义预设').selectOption('0');
  await expect(label('画笔粗细')).toHaveValue('4');
  await button('恢复默认值').click();
  await page.getByText('画笔预设',{exact:true}).click();
  await size(820,590);await capture('panel-dark-820');
  await size(390,700);await expect(panel()).toBeVisible();
  const p=await panel().boundingBox();assert(p.x>=0&&p.x+p.width<=391&&p.y+p.height<=701);
  await capture('panel-dark-390');
  await size(1440);await page.getByText('画笔预设',{exact:true}).click();
  await button('删除').click();await expect(label('自定义预设')).toHaveCount(0);
  await close();await button('选择与拖动').click();
  const paper=page.getByTestId('paper'),before=await paper.getAttribute('style');
  await page.mouse.move(x+510,y+380);await page.mouse.down();await page.mouse.move(x+522,y+390,{steps:8});await page.mouse.up();
  await expect(paper).not.toHaveAttribute('style',before);

  const photo=path.join(data,'画笔校验图.png'),attachment=path.join(data,'画笔校验.txt');
  await fs.copyFile(output,photo);await fs.writeFile(attachment,'Existing file card behavior');
  await app.evaluate(({dialog},files)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:files});},[photo,attachment]);
  await button('添加图片或附件').click();await button('导入文件').click();
  await button('添加所选（2）').click();await expect(page.locator('.free-file-card')).toHaveCount(2);
  await button('写一张便笺').click();await expect(page.locator('.spatial-note')).toHaveCount(1);
  const note=label('便签完整正文');
  await note.fill('画笔升级后仍能编辑便签');await note.blur();
  await expect(note).toHaveValue('画笔升级后仍能编辑便签');
  await button('关闭便签详情').click();
  await expect(page.locator('.spatial-note')).toContainText('画笔升级后仍能编辑便签');

  const performance=await page.evaluate(async()=>{
   const headers={Authorization:`Bearer ${sessionStorage.getItem('arasn-token')}`,'Content-Type':'application/json'};
   for(let i=0;i<180;i++){
    const value={type:'stroke',inkVersion:1,brush:['ink','marker','pencil','calligraphy'][i%4],width:6,color:'#5CA887',smoothing:.2,
      points:Array.from({length:48},(_,j)=>[(i%15)*32-340+j*2,Math.floor(i/15)*25-150+Math.sin(j/6)*8])};
    const response=await fetch('/api/ops',{method:'POST',headers,body:JSON.stringify({id:crypto.randomUUID(),opId:crypto.randomUUID(),expected:0,value})});
    if(!response.ok)throw Error(await response.text());
   }
   return {seeded:180,points:180*48};
  });
  await expect(page.getByTestId('stroke')).toHaveCount(187,{timeout:12000});
  await button('自由绘图').click();
  await page.evaluate(()=>{
   window.__inkFrames=[];window.__inkMeasure=true;
   let last=performance.now();
   function frame(time){window.__inkFrames.push(time-last);last=time;if(window.__inkMeasure)requestAnimationFrame(frame);}
   requestAnimationFrame(frame);
  });
  await draw(x+40,y+430);
  Object.assign(performance,await page.evaluate(()=>{
   window.__inkMeasure=false;
   const frames=window.__inkFrames.sort((a,b)=>a-b);
   return {frames:frames.length,medianMs:frames[Math.floor(frames.length*.5)],p95Ms:frames[Math.floor(frames.length*.95)]};
  }));
  await count(188);
  await button('选择与拖动').click();
  const card=page.locator('.free-file-card').first(),header=await card.locator('header').boundingBox(),style=await card.getAttribute('style');
  await page.mouse.move(header.x+20,header.y+15);await page.mouse.down();
  await page.mouse.move(header.x+70,header.y+34,{steps:12});await page.mouse.up();
  await expect(card).not.toHaveAttribute('style',style);
  assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(shots,'result.json'),JSON.stringify({performance,pressureSamples:samples},null,2));
  console.log(JSON.stringify({passed:true,pressureSamples:samples,shots}));
 } catch(error) {if(page&&!page.isClosed())await capture('failure');throw error;}
 finally {
  await stop();const real=await fs.realpath(data);assert.equal(path.dirname(real),await fs.realpath(os.tmpdir()));
  await fs.rm(real,{recursive:true,force:true,maxRetries:20,retryDelay:100});
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
