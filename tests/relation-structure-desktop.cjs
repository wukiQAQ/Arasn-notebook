const { _electron: electron, expect } = require('@playwright/test');
const fs = require('node:fs/promises'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');
const { StorageEngine } = require('../desktop/engines/storage-engine.cjs');
const { selectOption } = require('./helpers/select-option.cjs');
const fixture = [
  ['研究问题', -490, -230], ['参考依据', -80, -230], ['实施条件', 330, -230],
  ['可选方案', -490, 50], ['确认结论', -80, 50], ['附加材料', 184, 50], ['来源记录', -80, 250],
];
const pairs = [[0,1,'related','none'],[1,2,'reference','forward'],[0,5,'dependency','forward'],[3,2,'resolves','forward'],[4,5,'attachment','both'],[6,1,'source','forward']];
const phase = process.env.ARASN_REL_PHASE || 'after';
(async () => {
  const data = await fs.mkdtemp(path.join(os.tmpdir(), 'arasn-rel-structure-'));
  const shots = path.resolve('docs/screenshots/relation-structure', phase); await fs.mkdir(shots, { recursive: true });
  const store = createStore(path.join(data, 'board.json'));
  const records = fixture.map(([text, x, y]) => { const id = randomUUID(); store.apply({ id, opId: randomUUID(), expected: 0, value: { type: 'text', text: `${text}\n用语义颜色与标签说明内容关系。`, color: '#263449', x: 0, y: 0, topology: { x, y, width: 240, height: 144, kind: 'note', status: 'open' } } }); return id; });
  const roomId = store.snapshot().roomId, engine = new StorageEngine(data); let nodeIds, edgeIds;
  try {
    const initial = (await engine.call('init')).state; await engine.call('canvasMigration', { dryRun: false, roomId, revision: initial.revision });
    const state = (await engine.call('init')).state;
    nodeIds = records.map(id => Object.keys(state.items).find(key => state.items[key].value?.type === 'canvas-node' && state.items[key].value.contentRef.id === id));
    edgeIds = pairs.map(() => randomUUID());
    for (let i=0;i<pairs.length;i++) { const [a,b,relationType,direction] = pairs[i]; await engine.call('board', { operation: { id: edgeIds[i], opId: randomUUID(), expected: 0, value: { type: 'canvas-edge', roomId, canvasId: roomId, fromNodeId: nodeIds[a], toNodeId: nodeIds[b], relationType, direction, label: '' } } }); }
  } finally { await engine.close(); }
  await fs.writeFile(path.join(data,'settings.json'), JSON.stringify({theme:'light',topologyViewport:{roomId,x:30,y:30,zoom:1}}));
  const env={...process.env,ARASN_DATA_DIR:data,ARASN_SMOKE:'1'};delete env.ELECTRON_RUN_AS_NODE;
  let app,page; const results=[],errors=[]; const button=name=>page.getByRole('button',{name,exact:true});
  const inspect=()=>page.locator('[data-edge]').evaluateAll(groups=>groups.map(g=>{
    const line=g.querySelector('.relation-line'), style=getComputedStyle(line), label=getComputedStyle(g.querySelector('.relation-label'));
    const marker=line.getAttribute('marker-end'), arrow=marker?document.querySelector(`${marker.slice(4,-1)} path`):null;
    const p=line.getPointAtLength(line.getTotalLength()),near=line.getPointAtLength(Math.max(0,line.getTotalLength()-.05));
    const context=document.createElement('canvas').getContext('2d');const lum=color=>{context.fillStyle=color;context.fillRect(0,0,1,1);return [...context.getImageData(0,0,1,1).data].slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0)};const a=lum(label.color),b=lum(label.backgroundColor);
    const scale=Math.hypot(line.getScreenCTM().a,line.getScreenCTM().b);
    return {type:g.dataset.relation,width:style.strokeWidth,screenWidth:parseFloat(style.strokeWidth)*scale,hitWidth:parseFloat(getComputedStyle(g.querySelector('.relation-hit')).strokeWidth)*scale,dash:style.strokeDasharray,path:line.getAttribute('d'),color:style.stroke,label:label.color,labelHeight:label.height,labelRadius:label.borderRadius,labelPadding:label.padding,labelContrast:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),arrow:arrow?getComputedStyle(arrow).stroke:null,arrowShape:arrow?.getAttribute('d'),orient:arrow?.parentElement.getAttribute('orient'),arrowPixels:arrow?Number(arrow.parentElement.getAttribute('markerWidth'))*scale:null,start:line.hasAttribute('marker-start'),end:Boolean(marker),tangent:[p.x-near.x,p.y-near.y]};
  }));
  const shot=async name=>{await page.mouse.move(210,20);await page.screenshot({path:path.join(shots,`${name}.png`),scale:'css',animations:'disabled'});const styles=await inspect();results.push({name,viewport:await page.evaluate(()=>[innerWidth,innerHeight]),zoom:await button('复位视图').innerText(),styles});if(phase!=='before')for(const row of styles){assert([2,2.5].some(width=>Math.abs(row.screenWidth-width)<.01));assert(Math.abs(row.hitWidth-18)<.01);assert.equal(row.dash,'none');assert.equal(row.color,row.label);if(row.arrow){assert.equal(row.color,row.arrow);assert.equal(row.orient,'auto-start-reverse');assert(Math.abs(row.arrowPixels-10)<.1)}assert(row.labelContrast>=4.5,`${row.type}: ${row.labelContrast}`)}};
  try {
    app=await electron.launch({args:['.'],cwd:path.resolve(__dirname,'..'),env});page=await app.firstWindow();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
    const win=await app.browserWindow(page);await win.evaluate(w=>{w.show();w.focus()});await button('打开工作区').click();await win.evaluate(w=>w.setContentSize(1440,900));await button('打开关系画布').click();await expect(page.locator('[data-edge]')).toHaveCount(6);
    await shot('light-100');
    if(phase!=='before'){assert((await inspect()).every(r=>r.width==='2px'));await expect(page.locator('.relation-edges animateMotion')).toHaveCount(0);const rows=await inspect();assert(!rows.find(r=>r.type==='related').end);assert(rows.find(r=>r.type==='attachment').start);assert.equal(new Set(rows.filter(r=>r.arrow).map(r=>r.arrowShape)).size,1);assert.equal(new Set(rows.map(r=>[r.labelHeight,r.labelRadius,r.labelPadding].join(','))).size,1)}
    await button('设置与快捷键').click();await selectOption(page,'外观主题','dark');await button('关闭弹窗').click();await expect(page.getByText('设置已保存',{exact:true})).toBeHidden();await shot('dark-100');
    const hit=page.locator(`[data-edge="${edgeIds[2]}"] .relation-hit`);await hit.focus();await page.keyboard.press('Enter');await expect(page.getByLabel('关系类型',{exact:true})).toContainText('依赖');await shot('dark-selected');
    await require('./helpers/select-option.cjs').selectOption(page, '关系方向', 'both');await expect(page.locator(`[data-edge="${edgeIds[2]}"] .relation-line`)).toHaveAttribute('marker-start',/url/);await require('./helpers/select-option.cjs').selectOption(page, '关系方向', 'forward');await button('关闭关系详情').click();
    if(phase!=='before')await expect(page.locator('.relation-flow, .relation-edges animateMotion')).toHaveCount(0);
    await button('缩小画布').click();await button('缩小画布').click();await button('缩小画布').click();await shot('dark-51');await button('复位视图').click();for(let i=0;i<4;i++)await button('放大画布').click();await shot('short-dark-200');
    await button('复位视图').click();await page.emulateMedia({reducedMotion:'reduce'});await shot('dark-reduced-100');
    await win.evaluate(w=>{w.setMinimumSize(350,460);w.setContentSize(390,720)});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('mobile-dark-100');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(shots,'comparison.json'),JSON.stringify({fixtureHash:createHash('sha256').update(JSON.stringify([fixture,pairs])).digest('hex'),fixture,pairs,results},null,2));
    console.log(`PASS ${phase}: six relation types, crossing and short connections, 51/100/200%, theme colors/contrast, arrows, keyboard/direction/reduced motion/mobile`);
  }catch(e){if(page&&!page.isClosed())await page.screenshot({path:path.join(shots,'failure.png'),scale:'css'}).catch(()=>{});throw e}
  finally{if(app)await app.close();const target=await fs.realpath(data);assert.equal(path.dirname(target),await fs.realpath(os.tmpdir()));await fs.rm(target,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});
