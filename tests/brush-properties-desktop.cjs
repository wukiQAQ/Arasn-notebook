const {_electron:electron,expect}=require('@playwright/test');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {createStore}=require('../desktop/server.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'arasn-brush-')),shots=path.resolve(process.env.ARASN_VISUAL_SHOTS||'docs/screenshots/brush-properties-pass1');await fs.mkdir(shots,{recursive:true});
 const store=createStore(path.join(data,'board.json')),old=randomUUID(),legacy={type:'stroke',color:'#4668c6',width:4,points:[[800,500],[1000,500]]};store.apply({id:old,value:legacy,opId:randomUUID(),expected:0});
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({theme:'dark',shortcut:'Control+Alt+F23'}));
 const env={...process.env,ARASN_DATA_DIR:data,ARASN_SMOKE:'1'};delete env.ELECTRON_RUN_AS_NODE;let app,page;const errors=[];
 const b=name=>page.getByRole('button',{name,exact:true}),label=name=>page.getByLabel(name,{exact:true});
 const board=()=>page.evaluate(async()=>(await fetch('/api/board',{headers:{Authorization:`Bearer ${sessionStorage.getItem('arasn-token')}`}})).json());
 const size=async(w,h=900)=>{const win=await app.browserWindow(page);await win.evaluate((win,[w,h])=>{win.unmaximize();win.setResizable(true);win.setMinimumSize(320,400);win.setContentSize(w,h);win.show();win.focus();},[w,h]);await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(w);};
 const open=async()=>{app=await electron.launch({args:['.'],cwd:path.resolve(__dirname,'..'),env});page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));if(await b('打开工作区').isVisible())await b('打开工作区').click();await b('我的随手页').click();await size(1440);};
 const capture=async name=>page.screenshot({path:path.join(shots,name+'.png'),scale:'css',animations:'disabled'});
 const choose=async(name,v)=>{await page.getByRole('combobox',{name,exact:true}).click();await page.locator(`.app-select-item[data-value="${v}"]`).click();};
 const draw=async()=>{const r=await page.locator('.paper-scroll').boundingBox(),x=r.x+r.width*.65,y=r.y+170;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+120,y+35,{steps:15});await page.mouse.up();};
 try {
  await open();await b('工具属性').click();await expect(page.getByText('选择笔迹、便签或附件后，在这里调整对象。')).toBeVisible();await expect(label('自定义颜色')).toHaveCount(0);
  await b('选择与拖动').click();await expect(page.getByText('画布导航',{exact:true})).toBeVisible();await expect(label('自定义颜色')).toHaveCount(0);
  await b('橡皮擦').click();await expect(label('橡皮擦大小')).toBeVisible();await expect(label('自定义颜色')).toHaveCount(0);
  await b('添加文字').click();await expect(page.getByRole('combobox',{name:'文字字号'})).toBeVisible();await expect(page.getByRole('combobox',{name:'画笔粗细'})).toHaveCount(0);
  await b('自由绘图').click();await b('记号笔').click();await expect(label('画笔不透明度')).toHaveValue('35');await capture('marker-1440');
  await b('虚线笔').click();await page.getByText('笔刷细节',{exact:true}).click();await choose('笔迹端点','square');await label('笔迹平滑').fill('60');await page.getByText('HSL 调色',{exact:true}).click();await label('色相').fill('220');
  await label('预设名称').fill('我的虚线');await b('保存为预设').click();await expect(b('我的虚线')).toBeVisible();await expect.poll(()=>page.evaluate(()=>window.desktop.info().then(v=>v.brushPresets?.length))).toBe(1);
  const preset=(await page.evaluate(()=>window.desktop.info())).brushPresets[0];assert.equal(preset.smoothing,.6);assert.equal(preset.lineCap,'square');
  await page.locator('.free-properties').evaluate(e=>e.scrollTop=0);await capture('details-1440');await b('关闭工具属性').click();await draw();await expect(page.getByTestId('stroke')).toHaveCount(2);
  await expect.poll(async()=>Object.values((await board()).items).filter(i=>i.value?.type==='stroke').length).toBe(2);const snap=await board(),created=Object.entries(snap.items).find(([id,i])=>id!==old&&i.value?.type==='stroke');assert(created);assert.equal(created[1].value.brush,'dash');assert.equal(created[1].value.smoothing,.6);assert.equal(created[1].value.lineCap,'square');assert.deepEqual(snap.items[old].value,legacy);
  await expect(page.getByTestId('stroke').last()).toHaveAttribute('stroke-dasharray','12 10');await expect(page.getByTestId('stroke').last()).toHaveAttribute('stroke-linecap','square');
  await b('撤销上次操作').click();await expect(page.getByTestId('stroke')).toHaveCount(1);await b('重做上次操作').click();await expect(page.getByTestId('stroke')).toHaveCount(2);
  await expect(page.locator('.topbar .save-state')).toHaveText('已保存');await app.close();app=null;await open();await expect(page.getByTestId('stroke')).toHaveCount(2);await b('自由绘图').click();await b('工具属性').click();await expect(b('我的虚线')).toBeVisible();await b('我的虚线').click();await expect(label('画笔不透明度')).toHaveValue('100');
  await assert.rejects(()=>page.evaluate(()=>window.desktop.settings({brushPresets:[{name:'bad'}]})));assert.equal((await page.evaluate(()=>window.desktop.info())).brushPresets.length,1);
  for(const [w,h] of [[1440,900],[820,590],[390,700]]){await size(w,h);if(await b('画布总览').isVisible())await b('画布总览').click();await page.locator('.free-properties').evaluate(e=>e.scrollTop=0);const box=await page.locator('.free-properties').boundingBox();assert(box.x>=0&&box.x+box.width<=w+1&&box.y+box.height<=h+1);await capture('panel-'+w);await b('保存为预设').scrollIntoViewIfNeeded();await capture('presets-'+w);}
  await size(1440);await b('删除预设我的虚线').click();await expect(b('我的虚线')).toHaveCount(0);assert.equal((await page.evaluate(()=>window.desktop.info())).brushPresets.length,0);
  await app.evaluate(({ipcMain})=>{global.__brushOriginalSettings=ipcMain._invokeHandlers.get('app:settings');ipcMain.removeHandler('app:settings');ipcMain.handle('app:settings',()=>{throw new Error('isolated save failure');});});
  await label('预设名称').fill('失败不会假保存');await b('保存为预设').click();await expect(page.getByRole('alert')).toHaveText('方案保存失败，请重试');assert.equal((await page.evaluate(()=>window.desktop.info())).brushPresets.length,0);await capture('save-failure');await app.evaluate(({ipcMain})=>{ipcMain.removeHandler('app:settings');ipcMain.handle('app:settings',global.__brushOriginalSettings);delete global.__brushOriginalSettings;});
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(shots,'result.json'),JSON.stringify({status:'passed',errors,preset,scope:'isolated Electron/CDP, not physical input'},null,2));console.log('PASS tool-specific properties, brush render, HSL, undo/redo, legacy protection, restart, validated persistence/delete/failure, 1440/820/390');
 }catch(e){if(page&&!page.isClosed())await capture('failure');throw e;}finally{console.log('cleanup: closing isolated app');if(app){await app.evaluate(({ipcMain})=>{if(global.__brushOriginalSettings){ipcMain.removeHandler('app:settings');ipcMain.handle('app:settings',global.__brushOriginalSettings);delete global.__brushOriginalSettings;}}).catch(()=>{});await app.close();}console.log('cleanup: removing isolated data');const real=await fs.realpath(data);assert.equal(path.dirname(real),await fs.realpath(os.tmpdir()));await fs.rm(real,{recursive:true,force:true,maxRetries:20,retryDelay:100});console.log('cleanup: complete');}
})().catch(e=>{console.error(e);process.exitCode=1;});
