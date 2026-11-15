const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {validateValue,validFreeViewport,validTopologyViewport}=require('../desktop/server.cjs');
test('free world accepts old and signed coordinates with bounded finite validation',()=>{
 for(const [x,y] of [[0,0],[1600,1000],[-999999,999999]]) {
  const stroke={type:'stroke',color:'#4668c6',width:4,points:[[x,y]]};assert.deepEqual(validateValue(stroke),stroke);
  const note={type:'text',color:'#263449',text:'兼容',x,y};assert.deepEqual(validateValue(note),note);
 }
 for(const x of [NaN,Infinity,-Infinity,1000001,-1000001])assert.throws(()=>validateValue({type:'stroke',color:'#4668c6',width:4,points:[[x,0]]}));
 const c={roomId:randomUUID(),x:-50000,y:50000,zoom:4};assert(validFreeViewport(c));assert(!validTopologyViewport(c));assert(!validFreeViewport({...c,zoom:4.01}));
});
test('shared zoom preserves pointer anchor and relation limits',async()=>{
 const {zoomAt,screenToWorld}=await import('../src/topology.ts');
 const size={width:1440,height:900},point={x:123,y:759},camera={x:-50000,y:20000,zoom:.8};
 const anchor=screenToWorld(point,size,camera);
 for(const z of [.25,1,4]) {const next=zoomAt(camera,size,point,z,4),actual=screenToWorld(point,size,next);assert(Math.abs(actual.x-anchor.x)<1e-8);assert(Math.abs(actual.y-anchor.y)<1e-8);}
 assert.equal(zoomAt(camera,size,point,4).zoom,2);
});
