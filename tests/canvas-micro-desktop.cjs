const {_electron:electron,expect}=require('@playwright/test');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {createStore}=require('../desktop/server.cjs');
const {StorageEngine}=require('../desktop/engines/storage-engine.cjs');
const {selectOption}=require('./helpers/select-option.cjs');
(async()=>{
 const data=await fs.mkdtemp(path.join(os.tmpdir(),'arasn-micro-'));
 const shots=path.resolve(process.env.ARASN_VISUAL_SHOTS||'docs/screenshots/canvas-micro/pass1');await fs.mkdir(shots,{recursive:true});
 const store=createStore(path.join(data,'board.json'));
 const fixtures=[['起点甲\n真实摘要第一行\n真实摘要第二行\n第三行不应展开',-520,-230],['终点乙',310,190],['起点丙\n另一条真实摘要',-520,190],['终点丁',310,-230]];
 const records=fixtures.map(([text,x,y])=>{const id=randomUUID();store.apply({id,opId:randomUUID(),expected:0,value:{type:'text',text,color:'#263449',x,y,topology:{x,y,width:210,height:120,kind:'note',status:'open'}}});return id;});
 const roomId=store.snapshot().roomId,engine=new StorageEngine(data);let nodes,edgeIds;
 try{const initial=(await engine.call('init')).state;await engine.call('canvasMigration',{dryRun:false,roomId,revision:initial.revision});const state=(await engine.call('init')).state;
 nodes=records.map(record=>Object.keys(state.items).find(id=>state.items[id].value?.type==='canvas-node'&&state.items[id].value.contentRef.id===record));
 edgeIds=[randomUUID(),randomUUID(),randomUUID()];
 for(const [i,[a,b,type]]of [[0,1,'related'],[2,3,'dependency'],[0,1,'reference']].entries())await engine.call('board',{operation:{id:edgeIds[i],opId:randomUUID(),expected:0,value:{type:'canvas-edge',roomId,canvasId:roomId,fromNodeId:nodes[a],toNodeId:nodes[b],relationType:type,direction:'forward',label:`连接${i+1}`}}});
 }finally{await engine.close();}
 await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({theme:'light',topologyViewport:{roomId,x:0,y:0,zoom:1}}));
 const env={...process.env,ARASN_DATA_DIR:data,ARASN_SMOKE:'1'};delete env.ELECTRON_RUN_AS_NODE;
 let app,page;const errors=[],checks=[];const button=name=>page.getByRole('button',{name,exact:true});
 const edge=i=>page.locator(`[data-edge="${edgeIds[i]}"]`),node=i=>page.locator(`[data-topology-node="${nodes[i]}"]`);
 const closeRelation=async()=>{await button('关闭关系详情').click();await expect(page.getByRole('dialog',{name:'关系详情',exact:true})).toBeHidden();};
 const point=async(i,t=.5)=>edge(i).locator('.relation-line').evaluate((p,t)=>{const q=p.getPointAtLength(p.getTotalLength()*t).matrixTransform(p.getScreenCTM());return{x:q.x,y:q.y}},t);
 const board=()=>page.evaluate(async()=> (await fetch('/api/board',{headers:{Authorization:`Bearer ${sessionStorage.getItem('arasn-token')}`}})).json());
 const shot=async name=>{await page.screenshot({path:path.join(shots,name+'.png'),scale:'css',animations:'disabled'});checks.push({name,focus:await page.locator(':focus').evaluateAll(els=>els.map(el=>({tag:el.tagName,class:el.getAttribute('class'),outline:getComputedStyle(el).outline}))) });};
 try{
 app=await electron.launch({args:['.'],cwd:path.resolve(__dirname,'..'),env});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>document.addEventListener('keydown',event=>{if(!event.ctrlKey&&!event.altKey&&!event.metaKey&&(event.key.length===1||['Backspace','Delete'].includes(event.key)))event.preventDefault();},true));
 const win=await app.browserWindow(page);await win.evaluate(w=>w.setIgnoreMouseEvents(true));await win.evaluate(w=>{w.show();w.focus();w.setContentSize(1440,900)});
 await button('打开工作区').click();await button('打开关系画布').click();await expect(page.locator('[data-edge]')).toHaveCount(3);
 await win.evaluate(w=>w.setContentSize(1440,900));await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(1440);
 const original=await board();
 await expect(node(1).locator('.topology-node-summary')).toHaveCount(0);await expect(node(0).locator('.topology-node-summary')).toContainText('真实摘要');
 await expect(page.locator('.topology-record-source')).toHaveCount(0);assert(!await page.locator('.topology-node').allTextContents().then(x=>x.join('').includes('双击查看正文')));
 await expect(node(0).getByRole('img',{name:'已保存'})).toBeVisible();
 await expect(button('撤销节点操作')).toBeDisabled();await expect(button('重做节点操作')).toBeDisabled();
 await button('撤销节点操作').evaluate(el=>el.click());assert.deepEqual(await board(),original);
 for(const theme of ['light','dark']){
 await button('设置与快捷键').last().click();await selectOption(page,'外观主题',theme);await button('关闭弹窗').click();await expect(page.getByRole('dialog',{name:'设置',exact:true})).toBeHidden();
 await button('复位视图').click();await expect(button('复位视图')).toHaveText('100%');
 let p=await point(1,.27);await page.mouse.move(p.x,p.y);await expect(edge(1)).toHaveAttribute('data-hovered','true');await expect(page.locator('[data-edge][data-hovered]')).toHaveCount(1);
 await expect(node(2)).toHaveAttribute('data-relation-focus','true');await expect(node(3)).toHaveAttribute('data-relation-focus','true');
 assert.equal(await edge(0).evaluate(el=>Number(getComputedStyle(el).opacity)),.24);
 await page.mouse.click(p.x,p.y);await expect(edge(1)).toHaveAttribute('data-selected','true');await expect(page.getByRole('dialog',{name:'关系详情',exact:true})).toBeVisible();await closeRelation();
 p=await point(0,.5);await page.mouse.click(p.x,p.y);await expect(page.getByRole('dialog',{name:'选择交叉连接'})).toBeVisible();await shot(`${theme}-crossing-chooser`);
 await page.getByRole('dialog',{name:'选择交叉连接'}).getByRole('button').filter({hasText:'引用'}).click();await expect(edge(2)).toHaveAttribute('data-selected','true');await expect(page.locator('.relation-selection-halo')).toHaveCount(1);
 await expect(node(0)).toHaveAttribute('data-relation-focus','true');await expect(node(1)).toHaveAttribute('data-relation-focus','true');
 await shot(`${theme}-selected-1440`);await closeRelation();
 // Exact overlapping curves remain selectable after camera scale and translation changes.
 await button('缩小画布').click();await expect(button('复位视图')).toHaveText('80%');await button('缩小画布').click();await expect(button('复位视图')).toHaveText('64%');await page.locator('.topology-viewport').focus();await page.keyboard.press('ArrowRight');await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 p=await point(0,.25);await page.mouse.click(p.x,p.y);await expect(page.getByRole('dialog',{name:'选择交叉连接'})).toBeVisible();
 await page.getByRole('dialog',{name:'选择交叉连接'}).getByRole('button').filter({hasText:'关联'}).click();await expect(edge(0)).toHaveAttribute('data-selected','true');
 assert.equal(await edge(0).locator('.relation-hit').evaluate(el=>parseFloat(getComputedStyle(el).strokeWidth)),18);
 await closeRelation();await edge(1).locator('.relation-hit').focus();await page.keyboard.press('Enter');await expect(edge(1)).toHaveAttribute('data-selected','true');
 assert.equal(await edge(1).locator('.relation-hit').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
 const updatedLabel=`修改后说明-${theme}`;await page.getByRole('textbox',{name:'连接说明',exact:true}).fill(updatedLabel);await expect(button('撤销节点操作')).toBeEnabled();await closeRelation();
 await button('撤销节点操作').click();await expect(button('重做节点操作')).toBeEnabled();await button('重做节点操作').focus();await page.keyboard.press('Enter');
 await expect.poll(async()=> (await board()).items[edgeIds[1]].value.label).toBe(updatedLabel);
 await shot(`${theme}-history-1440`);
 await button('缩小画布').click();await expect(button('复位视图')).toHaveText('51%');await button('缩小画布').click();await expect(button('复位视图')).toHaveText('41%');
 await expect(node(0)).toHaveAttribute('data-compact','true');assert(await node(0).locator('strong').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize)*new DOMMatrix(getComputedStyle(el.closest('.topology-world')).transform).a)>=10.99);
 await shot(`${theme}-far-zoom`);
 await win.evaluate(w=>{w.unmaximize();w.setContentSize(820,650)});await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(820);await shot(`${theme}-820`);
 await win.evaluate(w=>{w.setMinimumSize(320,500);w.setContentSize(390,700)});await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(390);await shot(`${theme}-390`);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await win.evaluate(w=>w.setContentSize(1440,900));await expect.poll(()=>page.evaluate(()=>innerWidth)).toBe(1440);
 }
 const after=await board();for(const id of [...records,...nodes])assert.deepEqual(after.items[id],original.items[id],'display/selection preserve original records and layouts');
 const beforeDelete=(await board()).items[edgeIds[1]].value;await edge(1).locator('.relation-hit').focus();await page.keyboard.press('Enter');await button('删除连接').click();await expect(edge(1)).toHaveCount(0);await button('撤销节点操作').click();await expect(page.locator('[data-edge]')).toHaveCount(3);
 await expect.poll(async()=>Object.values((await board()).items).some(item=>JSON.stringify(item.value)===JSON.stringify(beforeDelete))).toBe(true);
 await node(0).focus();await page.keyboard.press('Enter');await button('编辑节点').click();
 await page.route('**/api/ops',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'injected node save failure'})}));
 await page.getByRole('textbox',{name:'节点正文',exact:true}).fill('保存失败验收\n真实未保存内容');
 await expect(node(0).locator('.topology-compact-status')).toBeVisible();await shot('node-save-pending-far');
 await button('复位视图').click();await expect(button('复位视图')).toHaveText('100%');await expect(node(0).locator('.node-sync')).toContainText(/已暂存|尚未落盘|保存需要处理/);await shot('node-save-pending-readable');
 assert.equal((await board()).items[records[0]].value.text,original.items[records[0]].value.text,'failed save does not overwrite durable source');
 await page.unroute('**/api/ops');await page.getByRole('textbox',{name:'节点正文',exact:true}).fill(original.items[records[0]].value.text);
 await expect(node(0).locator('.node-sync').getByRole('img',{name:'已保存'})).toBeVisible();
 assert.deepEqual(errors,[]);console.log('PASS micro: real crossing/overlap hits after zoom/pan, single hover, endpoint focus, density, native disabled, keyboard, edit/undo/redo/delete, 1440/820/390, source preservation');
 }catch(error){if(page&&!page.isClosed())await page.screenshot({path:path.join(shots,'failure.png'),scale:'css'}).catch(()=>{});throw error;}
 finally{await fs.writeFile(path.join(shots,'checks.json'),JSON.stringify({checks,errors},null,2));if(app)await app.close();const real=await fs.realpath(data);assert.equal(path.dirname(real),await fs.realpath(os.tmpdir()));assert(path.basename(real).startsWith('arasn-micro-'));await fs.rm(real,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
