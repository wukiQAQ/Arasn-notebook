const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path'), assert = require('node:assert/strict');
const { createStore } = require('../desktop/server.cjs');
const { randomUUID } = require('node:crypto');
const { captureNativeWindow } = require('./helpers/native-window-capture.cjs');
(async () => {
 const out=path.resolve('docs/screenshots/search-sidebar',process.env.ARASN_PASS || 'final');await fs.mkdir(out,{recursive:true});const checks=[];
 for(const theme of ['light','dark']) {
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'arasn-search-sidebar-'));let app;
 try {
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({theme,shortcut:'Control+Alt+F22'}));
 const store=createStore(path.join(data,'board.json'));
 for(let i=0;i<16;i++)store.apply({id:randomUUID(),value:{type:'text',title:`专项验收便签 ${String(i+1).padStart(2,'0')}`,text:'这是搜索结果的正文摘要，验证双层信息、滚动和键盘查找。',x:100+i*20,y:100,width:280,height:180,color:'#5945ed'},opId:randomUUID(),expected:0});
 const env={...process.env,ARASN_DATA_DIR:data,ARASN_SMOKE:'1'};delete env.ELECTRON_RUN_AS_NODE;
 app=await electron.launch({args:['.',`--force-device-scale-factor=${process.env.ARASN_DPR || 1}`],env});const p=await app.firstWindow(),w=await app.browserWindow(p), errors=[];p.on('pageerror',e=>errors.push(e.message));
 const b=name=>p.getByRole('button',{name,exact:true}); await p.locator('.quick-title:enabled').waitFor();
 await w.evaluate(w=>{w.setIgnoreMouseEvents(true);w.show();w.focus();w.webContents.setBackgroundThrottling(false)});
 const size=async(width,height)=>{await w.evaluate((w,s)=>{w.unmaximize();w.setContentSize(...s)},[width,height]);await expect.poll(()=>p.evaluate(()=>innerWidth)).toBe(width);await p.waitForTimeout(250)};
 const shot=async(name)=>{await p.mouse.move(4,350);await p.waitForTimeout(200);await p.screenshot({path:path.join(out,`${theme}-${name}.png`)});};
 await expect(b('全局搜索')).toHaveCount(0);await p.keyboard.press('Control+k');await expect(p.locator('.command-popup')).toBeVisible();await p.keyboard.press('Escape');await expect(p.locator('.command-popup')).toBeHidden();if(!await p.locator('.quick-title').isVisible()){if(!await b('切换到便签区').isVisible())await b('页面操作').click();await b('切换到便签区').click();await expect(p.locator('.quick-title')).toBeVisible();}
 await p.locator('.quick-title').fill('保留草稿验收');await p.locator('.quick-input').fill('弹窗开关必须保留这段正文');await expect(p.locator('.quick-panel .save-state')).toHaveText('已保存');
 for(const [width,height] of [[820,700],[500,540],[1440,900]]) {
 await size(width,height);await p.getByRole('button',{name:'搜索便签',exact:true}).click();const dialog=p.locator('.xigra-record-dialog'),input=dialog.locator('input');await expect(input).toBeFocused();
 const rect=await dialog.boundingBox();assert(Math.abs(rect.width-Math.min(560,width-32))<2,JSON.stringify(rect));
 assert.equal(await p.locator('.record-search-backdrop').evaluate(e=>e.getBoundingClientRect().top),0);
 assert(await dialog.locator('ul').evaluate(e=>e.scrollHeight>e.clientHeight));
 await input.fill('专项验收');await p.keyboard.press('ArrowDown');await expect(dialog.locator('button[data-search-active]')).toContainText('专项验收');await shot(`search-${width}`);
 if(width===820) {
 const hit=await app.evaluate(({BrowserWindow,screen},{id,modulePath})=>{const w=BrowserWindow.fromId(id),k=process.mainModule.require(modulePath),u=k.load('user32.dll'),rect=u.func('int __stdcall GetWindowRect(intptr_t,void*)'),send=u.func('intptr_t __stdcall SendMessageW(intptr_t,uint,uintptr_t,intptr_t)'),h=w.getNativeWindowHandle(),hwnd=h.length===8?h.readBigInt64LE():h.readInt32LE(),r=Buffer.alloc(16);rect(hwnd,r);const factor=screen.getDisplayMatching(w.getBounds()).scaleFactor;return Number(send(hwnd,0x84,0,((r.readInt32LE(4)+Math.round(24*factor))<<16)|((r.readInt32LE(0)+Math.round(250*factor))&65535)));},{id:await w.evaluate(w=>w.id),modulePath:require.resolve('koffi')});
 assert.equal(hit,2,'Search must preserve native caption hit testing');
 }
 if(width===820)await captureNativeWindow(app,p,path.join(out,`${theme}-search-native.png`));
 await p.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(p.locator('.quick-input')).toHaveValue('弹窗开关必须保留这段正文');
 }
 await p.getByRole('button',{name:'搜索便签',exact:true}).click();await p.locator('.xigra-record-dialog input').fill('专项验收便签 05');await p.keyboard.press('Enter');await expect(p.locator('.xigra-record-dialog')).toBeHidden();await expect(p.locator('.quick-title')).toHaveValue('专项验收便签 05');
 await b('切换到工作区').click();await expect(b('全局搜索')).toBeVisible();await size(1440,900);
 const rail=p.locator('.sidebar');await expect(rail).toHaveCSS('width','200px');
 const handle=p.getByRole('separator',{name:'调整侧边栏宽度'});const box=await handle.boundingBox();await p.mouse.move(box.x+4,box.y+150);await p.mouse.down();await p.mouse.move(252,box.y+150,{steps:8});await p.mouse.up();await expect(rail).toHaveCSS('width','252px');
 await handle.focus();await p.keyboard.press('ArrowRight');await expect(rail).toHaveCSS('width','262px');await shot('sidebar-full');
 const editor=p.locator('.xigra-record-editor');if(await editor.count())await editor.evaluate(e=>e.dataset.testIdentity='kept');
 await b('紧凑导航').click();await expect(rail).toHaveCSS('width','64px');await shot('sidebar-compact');
 await b('展开或收起侧边栏').click();await expect(rail).toHaveCSS('width','0px');await shot('sidebar-hidden');await b('展开或收起侧边栏').click();await expect(rail).toHaveCSS('width','64px');await b('展开导航').click();await expect(rail).toHaveCSS('width','262px');
 if(await editor.count())assert.equal(await editor.getAttribute('data-test-identity'),'kept');
 await p.reload();await expect(b('全局搜索')).toBeVisible();await expect(rail).toHaveCSS('width','262px');
 await size(720,560);assert(parseFloat(await rail.evaluate(e=>getComputedStyle(e).width))<=280);await shot('sidebar-min');await size(1440,900);
 await b('设置与快捷键').last().click();await p.locator('.settings-categories').getByRole('button',{name:/启动/}).click();await p.getByRole('checkbox',{name:'开机启动时隐藏到托盘',exact:true}).click();
 const notice=p.locator('.app-notification');await expect(notice).toHaveAttribute('data-tone','success');await expect(notice).toHaveCSS('background-color',theme==='light'?'rgb(240, 250, 244)':'rgb(24, 51, 41)');await notice.hover();await p.waitForTimeout(2300);await expect(notice).toBeVisible();await p.screenshot({path:path.join(out,`${theme}-toast-success.png`)});await p.mouse.move(4,350);await expect(notice).toHaveCount(0,{timeout:4000});await b('关闭弹窗').click();
 await w.evaluate(w=>w.maximize());await p.waitForTimeout(300);await b('全局搜索').click();await expect(p.locator('.xigra-record-dialog')).toBeVisible();await shot('maximized-search');await p.keyboard.press('Escape');
 await w.evaluate(w=>w.minimize());assert(await w.evaluate(w=>w.isMinimized()));await w.evaluate(w=>{w.restore();w.show();w.focus()});
 await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('.app-shell').evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await expect.poll(async()=> (await p.evaluate(()=>window.desktop.info())).sidebar?.width).toBe(262);
 await app.close();app=await electron.launch({args:['.',`--force-device-scale-factor=${process.env.ARASN_DPR || 1}`],env});const restarted=await app.firstWindow();await restarted.locator('.window-navigation').waitFor();await expect.poll(async()=> (await restarted.evaluate(()=>window.desktop.info())).sidebar?.width).toBe(262);
 assert.deepEqual(errors,[]);checks.push({theme,dpr:await restarted.evaluate(()=>devicePixelRatio),searchWidths:[560,468,560],sidebar:'drag, keyboard, 3 modes, reload persistence, minimum window',native:'minimize/maximize API; native caption screenshot',errors});
 } finally {await app?.close();await fs.rm(data,{recursive:true,force:true});}
 }
 await fs.writeFile(path.join(out,'verification.json'),JSON.stringify(checks,null,2));console.log('PASS search/sidebar/toast two-theme Electron verification');
})().catch(e=>{console.error(e);process.exitCode=1});
