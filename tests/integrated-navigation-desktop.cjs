const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');
(async () => {
 const data = await fs.mkdtemp(path.join(os.tmpdir(),'arasn-chrome-'));
 const out = path.resolve('docs/screenshots/integrated-navigation',process.env.ARASN_CHROME_PASS || 'pass1'); await fs.mkdir(out,{recursive:true});
 const env={...process.env,ARASN_DATA_DIR:data,ARASN_SMOKE:'1'}; delete env.ELECTRON_RUN_AS_NODE;
 let app; const errors=[], checks=[];
 try {
  app=await electron.launch({args:['.','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding'],env});const watchdog=setTimeout(()=>{try{require('node:child_process').execFileSync('taskkill',['/PID',String(app.process().pid),'/T','/F']);}catch{}},90000);app.process().once('exit',()=>clearTimeout(watchdog)); const page=await app.firstWindow(), win=await app.browserWindow(page);
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message)); await page.locator('.quick-title:enabled').waitFor(); await win.evaluate(w=>{w.webContents.setBackgroundThrottling(false);w.setIgnoreMouseEvents(false);w.show();w.focus();});
  const b=name=>page.getByRole('button',{name,exact:true}); const nav=name=>page.locator('.sidebar').getByRole('button',{name,exact:true});
  await page.evaluate(async()=>{const info=await window.desktop.info();await window.desktop.settings({triggers:{...info.triggers,bindings:[],paused:true}});});await page.reload();await page.locator('.quick-title:enabled').waitFor();const shot=name=>captureNativeWindow(app,page,path.join(out,name+'.png'));
  await b('切换到工作区').click(); await page.waitForTimeout(350); await win.evaluate(w=>w.setContentSize(1440,900));
  await nav('打开关系画布').click(); if(await b('备份并启用关系画布').isVisible()) {await expect(b('备份并启用关系画布')).toBeEnabled();await b('备份并启用关系画布').click();}
  await expect(b('新建节点')).toBeEnabled(); await b('新建节点').click(); await page.keyboard.press('Escape');
  const nodes=page.locator('[data-topology-node]'); await expect(nodes).toHaveCount(1);
  const node=nodes.first(); const pos=()=>node.evaluate(e=>({x:e.style.left,y:e.style.top})); const before=await pos(); const r=await node.boundingBox();
  await page.mouse.move(r.x+70,r.y+26);await page.mouse.down();await page.mouse.move(r.x+130,r.y+60,{steps:1});await page.mouse.up();
  await expect.poll(pos).not.toEqual(before); await b('撤销节点操作').click(); await expect.poll(pos).toEqual(before); await b('重做节点操作').click();
  await b('新建节点').click();await page.keyboard.press('Escape');await expect(nodes).toHaveCount(2);
  const vp=page.locator('.topology-viewport'); const transform=()=>page.locator('.topology-world').getAttribute('style');
  const viewport=await vp.boundingBox();
  await page.mouse.move(viewport.x+viewport.width-160,viewport.y+120);await page.mouse.down();await page.mouse.move(viewport.x+viewport.width-230,viewport.y+160,{steps:1});await page.mouse.up();
  await page.mouse.move(viewport.x+viewport.width-150,viewport.y+100);await page.mouse.down({button:'middle'});await page.mouse.move(viewport.x+viewport.width-200,viewport.y+140,{steps:1});await page.mouse.up({button:'middle'});
  const zoomBefore=await page.getByRole('button',{name:'复位视图',exact:true}).textContent(); await page.mouse.wheel(0,-240);await expect.poll(()=>page.getByRole('button',{name:'复位视图',exact:true}).textContent()).not.toBe(zoomBefore);
  await page.waitForTimeout(150);await node.focus();await page.keyboard.press('Enter');await node.locator('[data-port=right]').press('Enter');await expect(page.locator('.relation-draft')).toHaveCount(1);await nodes.nth(1).click();await expect(page.locator('.relation-hit')).toHaveCount(1);
  if(await b('关闭通知').isVisible()) {await b('关闭通知').click();await expect(b('关闭通知')).toHaveCount(0);}await b('选择与平移').click();await b('适配节点').click();
  await page.keyboard.down('Shift');await page.mouse.move(viewport.x+180,viewport.y+10);await page.mouse.down();await page.mouse.move(viewport.x+viewport.width-20,viewport.y+viewport.height-20);await page.mouse.up();await page.keyboard.up('Shift');await expect(page.locator('[data-topology-node][data-selected="true"]')).toHaveCount(2);
  for(const theme of ['light','dark']) {
   await page.evaluate(async theme=>{document.documentElement.dataset.theme=theme;await window.desktop.settings({theme});},theme);
   for(const width of [1440,720]) {
    await win.evaluate((w,width)=>{w.unmaximize();w.setContentSize(width,900);},width);await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(width);await page.waitForTimeout(300);
    await shot(`relations-${theme}-${width}`);
    const geometry=await page.evaluate(()=>{const bar=document.querySelector('.window-navigation').getBoundingClientRect(), panel=document.querySelector('.relation-tool-panel').getBoundingClientRect();return {width:innerWidth,barHeight:bar.height,overflow:document.documentElement.scrollWidth>innerWidth,panel:{x:panel.x,right:panel.right,bottom:panel.bottom},logo:!!document.querySelector('.sidebar .xigra-brand'),titleCount:[...document.querySelectorAll('.window-page-title')].filter(e=>e.checkVisibility()).length};});
    assert(!geometry.logo&&!geometry.overflow);assert.equal(geometry.titleCount,1);assert(geometry.panel.right<=width&&geometry.panel.bottom<=900); checks.push({theme,width,...geometry});
   }
   await win.evaluate(w=>w.maximize());await expect.poll(()=>win.evaluate(w=>w.isMaximized())).toBe(true);await shot(`relations-${theme}-maximized`);await win.evaluate(w=>{w.unmaximize();w.setContentSize(1440,900);});
   await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(1440);await page.waitForTimeout(300);await captureNativeWindow(app,page,path.join(out,`native-${theme}.png`));
  }
  await nav('我的随手页').click();await expect(b('移动画布')).toHaveCount(0);
  for(let i=0;i<3;i++) {await b('选择与拖动').click();await expect(page.locator('.tool-settings-popup')).toHaveCount(1);await expect(page.locator('.tool-settings-popup .free-properties-heading button')).toHaveCount(1);await shot('single-navigation-panel');await page.keyboard.press('Escape');await expect(page.locator('.tool-settings-popup')).toHaveCount(0);}
  await b('选择与拖动').click();await win.evaluate(w=>w.setContentSize(720,800));await page.waitForTimeout(200);const bounds=await page.locator('.tool-settings-popup').boundingBox();assert(bounds.x>=0 && bounds.y>=0 && bounds.x+bounds.width<=720 && bounds.y+bounds.height<=800);await page.keyboard.press('Escape');await win.evaluate(w=>w.setContentSize(1440,900));await page.waitForTimeout(200);await b('返回上一页').click();await expect(page.locator('.relation-tool-panel')).toBeVisible();await b('前进到下一页').click();await expect(page.locator('.free-workspace')).toBeVisible();
  const canvasState = () => page.evaluate(() => {
    const paper=document.querySelector('[data-testid="paper"]'), view=document.querySelector('.paper-scroll'), m=new DOMMatrix(getComputedStyle(paper).transform), r=view.getBoundingClientRect();
    return {x:(r.width/2-m.e)/m.a,y:(r.height/2-m.f)/m.d,zoom:m.a,tool:paper.className,identity:paper.dataset.resizeIdentity};
  });
  await page.locator('[data-testid="paper"]').evaluate(e=>e.dataset.resizeIdentity='preserved');
  const originalCanvas=await canvasState();
  const boardState=()=>page.evaluate(async()=>JSON.stringify(await (await fetch('/api/board',{headers:{Authorization:`Bearer ${sessionStorage.getItem('arasn-token')}`}})).json()));
  const originalBoard=await boardState();
  await b('紧凑导航').click();await page.waitForTimeout(300);await b('展开导航').click();await page.waitForTimeout(300);
  await b('展开或收起侧边栏').click();await expect(page.locator('.sidebar')).toBeHidden();await b('展开或收起侧边栏').click();await expect(page.locator('.sidebar')).toBeVisible();await page.waitForTimeout(300);
  const resizedCanvas=await canvasState();assert(Math.abs(resizedCanvas.x-originalCanvas.x)<.01);assert(Math.abs(resizedCanvas.y-originalCanvas.y)<.01);assert.equal(resizedCanvas.zoom,originalCanvas.zoom);assert.equal(resizedCanvas.tool,originalCanvas.tool);assert.equal(resizedCanvas.identity,'preserved');assert.equal(await boardState(),originalBoard);checks.push('sidebar full/compact/hidden preserves free camera, tool, editor identity and board data');
  assert.equal(await page.locator('.window-page-title').evaluate(e=>getComputedStyle(e).webkitAppRegion),'drag');
  assert.equal(await b('全局搜索').evaluate(e=>getComputedStyle(e).webkitAppRegion),'no-drag');
  await page.getByRole('button',{name:'切换到便签区',exact:true}).click();await page.waitForTimeout(250);await shot('quick-window');await page.getByRole('button',{name:'切换到工作区',exact:true}).click();await page.waitForTimeout(250);const sys=async (command,message=0x112)=>app.evaluate(({BrowserWindow},{id,command,message,modulePath})=>{const w=BrowserWindow.fromId(id), k=process.mainModule.require(modulePath),u=k.load('user32.dll'),send=u.func('int __stdcall PostMessageW(intptr_t,uint,uintptr_t,intptr_t)'),h=w.getNativeWindowHandle(),hwnd=h.length===8?h.readBigInt64LE():h.readInt32LE();send(hwnd,message,command,0);},{id:await win.evaluate(w=>w.id),command,message,modulePath:require.resolve('koffi')});
  await sys(2,0xa3);await expect.poll(()=>win.evaluate(w=>w.isMaximized())).toBe(true);await sys(0xf120);const originalPosition=await win.evaluate(w=>w.getPosition());await win.evaluate((w,p)=>w.setPosition(p[0]+16,p[1]+16),originalPosition);assert.notDeepEqual(await win.evaluate(w=>w.getPosition()),originalPosition);await sys(0xf020);await expect.poll(()=>win.evaluate(w=>w.isMinimized())).toBe(true);await win.evaluate(w=>{w.restore();w.show();});await sys(0xf030);await expect.poll(()=>win.evaluate(w=>w.isMaximized())).toBe(true);await sys(0xf120);await expect.poll(()=>win.evaluate(w=>w.isMaximized())).toBe(false);
  await sys(0xf060);await expect.poll(()=>win.evaluate(w=>w.isVisible())).toBe(false);
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'verification.json'),JSON.stringify({checks,errors},null,2));console.log('PASS native controls, toolbar, singleton popup, nodes/connection/history, navigation and themes');
 } finally {if(app){const timer=setTimeout(()=>{try{require('node:child_process').execFileSync('taskkill',['/PID',String(app.process().pid),'/T','/F']);}catch{}},5000);try{await app.close();}finally{clearTimeout(timer);}}await fs.rm(data,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
