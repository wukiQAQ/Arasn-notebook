const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createStore } = require('../desktop/server.cjs');

const stage = process.argv[2] || 'after';
assert(['before','after'].includes(stage));
const shots = path.resolve(process.env.ARASN_UI_SHOTS || 'docs/screenshots/record-library-density');
const long = '周四设计走查与开发交接——记录下所有需要在下次版本发布前复核的工作项';
const titles = ['本周工作要点','发布前检查清单',long,'待确认的开放问题','下周议程','草图与灵感','会议前准备','文档目录','项目联系人','交接备忘', ...Array.from({length:18},(_,i)=>`日常记录 ${String(i+1).padStart(2,'0')}`)];
const entries = titles.map((title,i)=>[randomUUID(),{
  type:'text',color:'#263449',x:i*10,y:0,text:i===3?`${title}\n跨设备检查字体、间距和状态。`:title,
}]);

async function verify(theme) {
  const data = await fs.mkdtemp(path.join(os.tmpdir(),'arasn-record-library-'));
  let app;
  try {
    const store = createStore(path.join(data,'board.json'));
    for (const [id,value] of entries) store.apply({id,value,opId:randomUUID(),expected:0});
    await fs.writeFile(path.join(data,'settings.json'),JSON.stringify({theme,sidebar:{mode:'full',width:200},appearance:{preset:'arasn',accent:'#C94E85',background:null,foreground:null,font:'system',scale:'standard'}}));
    const env = {...process.env,ARASN_DATA_DIR:data,ARASN_SMOKE:'1'}; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({args:['.','--force-device-scale-factor=1'],cwd:path.resolve(__dirname,'..'),env});
    const page = await app.firstWindow();
    const win = await app.browserWindow(page);
    await page.emulateMedia({reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    page.setDefaultTimeout(8000);
    const size = async (w,h) => {
      await win.evaluate((window,[w,h])=>{window.unmaximize();window.setResizable(true);window.setMinimumSize(320,400);window.setContentSize(w,h);window.show();window.focus();},[w,h]);
      await expect.poll(()=>page.evaluate(()=>[innerWidth,innerHeight])).toEqual([w,h]);
    };
    const button = name => page.getByRole('button',{name,exact:true});
    const library = page.getByRole('complementary',{name:'便签库'});
    const rows = library.locator('.xigra-record-list button');
    const row = name => library.getByRole('button',{name,exact:true});
    const pinned = library.getByRole('region',{name:'置顶'});
    const search = library.getByRole('searchbox',{name:'搜索便签'});
    const scroll = library.locator('.xigra-record-scroll');
    const shot = name => page.screenshot({path:path.join(shots,`${stage}-${theme}${name||''}.png`),animations:'disabled',scale:'css'});
    const measure = () => library.evaluate(el=>{
      const scroll=el.querySelector('.xigra-record-scroll'),viewport=scroll.getBoundingClientRect();
      const buttons=[...scroll.querySelectorAll('li button')];
      const first=buttons[0].getBoundingClientRect(),second=buttons[1].getBoundingClientRect();
      const summary=buttons.find(button=>button.querySelector('small')).getBoundingClientRect();
      return {row:first.height, gap:second.top-first.bottom, summary:summary.height,
        visible:buttons.filter(button=>button.getBoundingClientRect().bottom<=viewport.bottom+1).length};
    });
    await size(1440,820);
    await page.locator('#workbench-sidebar').getByRole('button',{name:'便笺列表',exact:true}).click();
    await expect(rows).toHaveCount(titles.length);
    async function pin(title,checked) {
      await row(title).click();await button('管理当前便笺').click();
      await page.getByRole('menuitem',{name:checked?'置顶便笺':'取消置顶',exact:true}).click();
    }
    await pin(titles[1],true);await pin(titles[0],true);
    await expect(pinned.locator('strong')).toHaveText(titles.slice(0,2));
    await page.mouse.move(8,8);await shot();
    const metrics = await measure();
    if(stage==='after') {
      assert.equal(metrics.row,46);assert.equal(metrics.gap,4);assert(metrics.summary>metrics.row);
      const regular=await row(long).boundingBox();
      assert.equal(regular.height,metrics.row);
      const title=row(long).locator('strong');
      await expect(title).toHaveAttribute('title',long);
      assert(await title.evaluate(el=>el.scrollWidth>el.clientWidth&&getComputedStyle(el).textOverflow==='ellipsis'));
      const weight=await title.evaluate(el=>getComputedStyle(el).fontWeight);
      await row(long).hover();
      assert.deepEqual(await row(long).boundingBox(),regular);
      await expect(title).toHaveCSS('font-weight',weight);
      await row(long).focus();await row(long).press('Tab');
      assert(await rows.evaluateAll(els=>els.some(el=>el.matches(':focus-visible')&&getComputedStyle(el).outlineStyle==='solid')));
      const fixed=await search.boundingBox();
      await scroll.hover();await page.mouse.wheel(0,640);
      await expect.poll(()=>scroll.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
      assert.deepEqual(await search.boundingBox(),fixed);
      await search.fill('设计走查');await expect(rows).toHaveCount(1);await expect(row(long)).toBeVisible();
      await search.fill('');
      await library.getByRole('button',{name:'最近',exact:true}).click();await expect(pinned).toHaveCount(0);
      await library.getByRole('button',{name:/^全部/}).click();await expect(pinned.locator('strong')).toHaveText(titles.slice(0,2));
      const filter=library.getByRole('combobox',{name:'记录关联筛选'});
      await filter.click();await page.getByRole('option',{name:'已加入关系画布'}).click();
      await expect(rows).toHaveCount(0);
      await filter.click();await page.getByRole('option',{name:'所有记录'}).click();
      await expect(rows).toHaveCount(titles.length);
      await pin(titles[0],false);await expect(pinned.locator('strong')).toHaveText([titles[1]]);
      await pin(titles[0],true);await expect(pinned.locator('strong')).toHaveText(titles.slice(0,2));
      const board=await page.evaluate(async()=>fetch('/api/board',{headers:{Authorization:`Bearer ${sessionStorage.getItem('arasn-token')}`}}).then(r=>r.json()));
      for(const [id,value] of entries) assert.deepEqual(board.items[id].value,value);
      await button('展开或收起侧边栏').click();
      await size(390,700);
      const workspace=page.getByRole('region',{name:'便签工作区'});
      await expect(workspace).toHaveAttribute('data-library-overlay','true');
      const expand=button('展开便签库');
      if(await expand.isVisible()) await expand.click();
      await expect(workspace).toHaveAttribute('data-library-open','true');
      await expect(library).toHaveCSS('opacity','1');
      await expect(row(long)).toBeVisible();
      assert(await title.evaluate(el=>el.scrollWidth>el.clientWidth));
      const box = await library.boundingBox();
      assert(box.x>=0&&box.x+box.width<=391);
      await page.mouse.move(8,40);await shot('-390');
      await expect(library).toBeVisible();
    }
    assert.deepEqual(errors,[]);
    return metrics;
  } finally {
    if(app){
      const exit=new Promise(resolve=>app.process().once('exit',resolve));
      await app.evaluate(({app})=>app.exit(0));await exit;
    }
    const real=await fs.realpath(data);
    assert.equal(path.dirname(real),await fs.realpath(os.tmpdir()));
    await fs.rm(real,{recursive:true,force:true,maxRetries:20,retryDelay:100});
  }
}
(async()=>{
  await fs.mkdir(shots,{recursive:true});
  const metrics = {light:await verify('light'),dark:await verify('dark')};
  await fs.writeFile(path.join(shots,`${stage}-metrics.json`),JSON.stringify(metrics,null,2));
  console.log(stage,JSON.stringify(metrics));
})().catch(error=>{console.error(error);process.exitCode=1;});
