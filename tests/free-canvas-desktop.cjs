const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
(async () => {
 const root = path.resolve(__dirname,'..'), data = await fs.mkdtemp(path.join(os.tmpdir(),'arasn-free-'));
 const shots = path.resolve(process.env.ARASN_VISUAL_SHOTS || path.join(root,'docs/screenshots/free-canvas')); await fs.mkdir(shots,{recursive:true});
 const store = createStore(path.join(data,'board.json')), note=randomUUID(), stroke=randomUUID();
 const values = { [note]:{type:'text',text:'自由工作台\n旧便签坐标保持不变',x:650,y:350,color:'#39796b'}, [stroke]:{type:'stroke',color:'#4668c6',width:4,points:[[400,580],[700,620],[1000,570]]} };
 for(const [id,value] of Object.entries(values)) store.apply({id,value,opId:randomUUID(),expected:0});
 const env={...process.env,ARASN_DATA_DIR:data,ARASN_SMOKE:'1'}; delete env.ELECTRON_RUN_AS_NODE;
 let app,page;
 const button = name => page.getByRole('button',{name,exact:true});
 const board = () => page.evaluate(async()=> (await fetch('/api/board',{headers:{Authorization:`Bearer ${sessionStorage.getItem('arasn-token')}`}})).json());
 const camera = () => page.locator('.paper').evaluate(e=>{const m=new DOMMatrix(getComputedStyle(e).transform),v=e.closest('.paper-scroll');return {x:(v.clientWidth/2-m.e)/m.a,y:(v.clientHeight/2-m.f)/m.a,zoom:m.a};});
 const size=async(w,h=900)=>{const win=await app.browserWindow(page);await win.evaluate((win,[w,h])=>{win.unmaximize();win.setResizable(true);win.setMinimumSize(320,400);win.setContentSize(w,h);win.show();win.focus();},[w,h]);await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(w);};
 const open=async()=>{ app=await electron.launch({args:['.'],cwd:root,env}); page=await app.firstWindow();page.setDefaultTimeout(10000);page.on("pageerror",e=>console.log("PAGEERROR",e.message)); await size(1440); if(await button('打开工作区').isVisible()) await button('打开工作区').click(); await button('我的随手页').click();await expect(page.locator('.paper-scroll')).toBeVisible(); await expect(button('写一张便笺')).toBeEnabled(); await size(1440); if(await page.evaluate(()=>document.documentElement.dataset.theme!=='dark')) await page.evaluate(async()=>{await window.desktop.settings({theme:'dark'});document.documentElement.dataset.theme='dark';}); await page.waitForTimeout(300);};
 const drag=async(x,y,dx,dy)=>{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();};
 try {
 await open();
 await page.screenshot({path:path.join(shots,'pass1-desktop.png'),scale:'css'});
 const before=await board(); const c0=await camera(), r=await page.locator('.paper-scroll').boundingBox();
 await button('选择与拖动').click(); await page.evaluate(()=>{window.__events=[];for(const name of ['pointerdown','pointerup','pointercancel','lostpointercapture','blur'])window.addEventListener(name,e=>window.__events.push({name,target:e.target?.className,x:e.clientX,y:e.clientY}),true);}); await drag(r.x+r.width*.7,r.y+r.height*.3,140,100);
 await expect.poll(async()=>Math.abs((await camera()).x-c0.x)).toBeGreaterThan(100);
 console.log("pan passed");const c1=await camera();
 // A cancelled gesture rolls back without changing content or leaving capture active.
 await page.mouse.move(r.x+r.width*.7,r.y+r.height*.25);await page.mouse.down();await page.mouse.move(r.x+r.width*.7+90,r.y+r.height*.25+50,{steps:5});
 await page.locator('.paper-scroll').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();
 await expect.poll(async()=>Math.abs((await camera()).x-c1.x)).toBeLessThan(.02);
assert.deepEqual((await board()).items,before.items);
 const anchor={x:r.width*.65,y:r.height*.5}; const world=c=>({x:c.x+(anchor.x-r.width/2)/c.zoom,y:c.y+(anchor.y-r.height/2)/c.zoom});
 await page.mouse.move(r.x+anchor.x,r.y+anchor.y);await page.mouse.wheel(0,-250);
 await expect.poll(async()=> (await camera()).zoom).toBeGreaterThan(c1.zoom);
 const c2=await camera(); assert(Math.abs(world(c1).x-world(c2).x)*c2.zoom<1);assert(Math.abs(world(c1).y-world(c2).y)*c2.zoom<1);
 console.log("zoom passed");
 // Move far beyond the old left/top bounds, then draw using real mouse events.
 await button('选择与拖动').click();for(let i=0;i<4;i++)await drag(r.x+r.width*.4,r.y+r.height*.35,500,220);
 console.log("negative pan finished");const negative=await camera(); assert(negative.x<0 && negative.y<0);
 console.log('draw start');await button('自由绘图').click();const drawCamera=await camera();
 const from={x:r.x+r.width*.5,y:r.y+r.height*.55};await drag(from.x,from.y,130,55);
 await expect.poll(async()=>Object.values((await board()).items).filter(i=>i.value?.type==='stroke').length).toBe(2);
 const fresh=Object.entries((await board()).items).find(([id,i])=>id!==stroke && i.value?.type==='stroke')[1].value;
 assert(Math.abs(fresh.points[0][0]-(drawCamera.x+(from.x-r.x-r.width/2)/drawCamera.zoom))<1);
 assert(fresh.points[0][0]<0);assert.deepEqual((await board()).items[note].value,values[note]);
 console.log('draw passed');const propertiesCamera=await camera(), stageBefore=await page.locator('.paper-scroll').boundingBox(); await button('工具属性').click();assert.deepEqual(propertiesCamera,await camera());assert.deepEqual(stageBefore,await page.locator('.paper-scroll').boundingBox());await page.screenshot({path:path.join(shots,'pass1-properties.png')});await button('关闭工具属性').click();
 await button('适配内容').click(); await page.waitForTimeout(220);await page.screenshot({path:path.join(shots,'pass1-fit.png')});
 const exportPath=path.join(data,'export.png'); await app.evaluate(({session},target)=>session.fromPartition('persist:arasn').once('will-download',(_event,item)=>item.setSavePath(target)),exportPath); await button('截图 / 导出').click();await page.getByRole('radio',{name:/完整画布/}).check();await button('生成预览').click();await button('保存 PNG').click();await expect.poll(()=>fs.stat(exportPath).then(s=>s.size).catch(()=>0)).toBeGreaterThan(0);const image=await fs.readFile(exportPath);
 await button('关闭截图导出').click();assert.equal(image.toString('ascii',1,4),'PNG'); assert(image.readUInt32BE(16)>1600,'export spans negative and legacy content'); assert(image.readUInt32BE(20)>0);
 const saved=await camera();await page.waitForTimeout(250);await app.close();app=null;await open();await expect.poll(async()=>Math.abs((await camera()).x-saved.x)).toBeLessThan(.02);assert(Math.abs((await camera()).zoom-saved.zoom)<.001);
 assert.equal(Object.values((await board()).items).filter(i=>i.value?.type==='stroke').length,2);
 console.log('restart passed');for(const w of [820,390]){await size(w);console.log('size',w);if(w===390)await button('画布总览').click();await page.screenshot({path:path.join(shots,`pass1-${w}.png`)});assert(await page.locator('.paper-scroll').evaluate(e=>e.scrollWidth===e.clientWidth));}
 await size(1440);await button('适配内容').click();await page.waitForTimeout(220);
 await page.screenshot({path:path.join(shots,'final-desktop.png')});
 console.log('PASS: legacy content, unbounded pan/cancel, pointer zoom anchor, negative-world drawing/save, properties stable, PNG export, restart, 1440/820/390 overflow');
 } catch(e) { if(page) { console.log(await page.evaluate(()=>({events:window.__events,focus:document.hasFocus(),size:[innerWidth,innerHeight],rect:document.querySelector('.paper-scroll')?.getBoundingClientRect().toJSON()}))); await page.screenshot({path:path.join(shots,'failure.png')}); } throw e; } finally {if(app)await app.close();await fs.rm(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
