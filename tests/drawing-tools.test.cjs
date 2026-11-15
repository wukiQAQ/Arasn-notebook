const {test}=require('node:test');const assert=require('node:assert/strict');
test('swept eraser hits crossings, isolated dots, not distant paths',async()=>{
 const {strokeHit,transformStroke,strokeBounds}=await import('../src/drawing.ts');
 assert(strokeHit([[0,-100],[0,100]],[-100,0],[100,0],1));
 assert(strokeHit([[0,0]],[-100,0],[100,0],1));
 assert(!strokeHit([[200,200],[300,300]],[-100,0],[100,0],10));
 const points=[[-100,-100],[0,0]], box=strokeBounds(points);
 assert.deepEqual(transformStroke(points,box,{x:20,y:30,width:200,height:50}),[[20,30],[220,80]]);
 assert.deepEqual(transformStroke([[0,0],[100,0]],{x:0,y:0,width:100,height:0},{x:0,y:0,width:150,height:50}),[[0,0],[150,50]]);
});
test('group history restores with fresh IDs across repeated redo and preserves remote changes',async()=>{
 const {DrawingHistory}=await import('../src/drawing-history.ts');const h=new DrawingHistory(), data=new Map();let serial=0;
 const read=id=>data.get(id)??null,write=(id,value)=>data.set(id,value),fresh=()=>`fresh${++serial}`;
 const a={type:'stroke',color:'#263449',width:4,points:[[0,0],[10,10]]},b={...a,points:[[30,30],[40,40]]};
 h.record([{id:'a',before:null,after:a}]);write('a',a);
 h.record([{id:'a',before:a,after:b}]);write('a',b);
 for(let i=0;i<3;i++) {assert.equal(h.apply(false,read,write,fresh),'ok');assert.equal(h.apply(false,read,write,fresh),'ok');assert.equal(h.apply(true,read,write,fresh),'ok');assert.equal(h.apply(true,read,write,fresh),'ok');assert.deepEqual(read(h.resolve('a')),b);}
 h.record([{id:h.resolve('a'),before:b,after:null},{id:'c',before:a,after:null}]);write(h.resolve('a'),null);write('c',null);
 assert.equal(h.apply(false,read,write,fresh),'ok');assert.deepEqual(read(h.resolve('c')),a);
 write(h.resolve('a'),a);assert.equal(h.apply(true,read,write,fresh),'conflict');assert.deepEqual(read(h.resolve('c')),a);
});
