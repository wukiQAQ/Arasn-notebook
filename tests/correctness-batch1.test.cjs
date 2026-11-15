const {test}=require('node:test'),assert=require('node:assert/strict');
test('export preserves trailing paragraphs and explicit logical-pixel multipliers',async()=>{
 const {wrapText,exportSize}=await import('../src/canvas-export.ts');
 assert.deepEqual(wrapText('abcd\nEND\n',2,s=>s.length),['ab','cd','EN','D','']);
 for(const m of [1,2,4])assert.deepEqual(exportSize({width:300,height:200},24,m),{width:348*m,height:248*m,factor:m});
 assert.equal(exportSize({width:600,height:400},0,2,.5).width,600);
 for(const b of [{width:1e6,height:10},{width:8000,height:8000},{width:NaN,height:10}])assert.throws(()=>exportSize(b,24,4),/安全尺寸/);
});
test('layout uses direction and dimensions, handles cycles and preserves obstacles',async()=>{
 const {arrangeGraph}=await import('../src/graph-layout.ts');
 const nodes=['a','b','c','d','locked'].map((id,i)=>({id,layout:{x:0,y:0,width:i===1?600:280,height:i===2?330:140,locked:id==='locked'}}));
 const edges=[['a','b'],['b','c'],['c','b'],['b','d']].map(([fromNodeId,toNodeId])=>({fromNodeId,toNodeId,direction:'forward'}));
 const saved=JSON.stringify([nodes,edges]),p=arrangeGraph(nodes,edges);assert(p.a.x<p.b.x);assert.equal(p.b.x,p.c.x);assert(p.d.x>=p.b.x+700);assert(!p.locked);
 const boxes=nodes.map(n=>({...n.layout,...p[n.id]}));for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);}
 assert.equal(JSON.stringify([nodes,edges]),saved);assert.deepEqual(arrangeGraph(nodes,edges),p);assert.deepEqual(Object.keys(arrangeGraph(nodes,edges,new Set(['b']))),['b']);
});
test('layout preserves optional lock through server validation',()=>{
 const {createStore}=require('../desktop/server.cjs'),{randomUUID}=require('node:crypto'),store=createStore(null);
 const v={type:'text',text:'x',color:'#263449',x:0,y:0,topology:{x:0,y:0,width:280,height:140,kind:'note',status:'open',locked:true}};
 const id=randomUUID();store.apply({id,value:v,opId:randomUUID(),expected:0});assert.equal(store.snapshot().items[id].value.topology.locked,true);
 assert.throws(()=>store.apply({id:randomUUID(),value:{...v,topology:{...v.topology,locked:'yes'}},opId:randomUUID(),expected:0}));
});
test('original-image reader rejects unavailable, oversized and excessive-pixel sources',async()=>{
 const {originalImage,dimensions}=require('../desktop/engines/export-image.cjs');
 await assert.rejects(()=>originalImage({call:async()=>null},'invalid'),/原图不可用/);
 const png=Buffer.alloc(24);png.writeUInt32BE(1200,16);png.writeUInt32BE(800,20);assert.deepEqual(dimensions(png,'png'),{width:1200,height:800});
 assert.throws(()=>dimensions(Buffer.alloc(12),'jpg'),/像素尺寸/);
 const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');const dir=await fs.mkdtemp(path.join(os.tmpdir(),'arasn-export-unit-')),file=path.join(dir,'image.png');
 try{png.writeUInt32BE(100000,16);await fs.writeFile(file,png);const storage={call:async()=>({path:file,extension:'png'})};await assert.rejects(()=>originalImage(storage,'id'),/安全解码限制/);
 png.writeUInt32BE(1200,16);await fs.writeFile(file,png);assert.equal(await originalImage(storage,'id'),'data:image/png;base64,'+png.toString('base64'));
 const handle=await fs.open(file,'r+');await handle.truncate(33*1024*1024);await handle.close();await assert.rejects(()=>originalImage(storage,'id'),/安全读取限制/);
 }finally{const target=await fs.realpath(dir);assert.equal(path.dirname(target),await fs.realpath(os.tmpdir()));await fs.rm(target,{recursive:true,force:true});}
});
