const {test}=require('node:test'); const assert=require('node:assert/strict');
test('relation hit ranking uses distance, stable ties and constant screen tolerance under zoom/pan',async()=>{
 const {rankRelationHits}=await import('../src/relation-hit.ts');
 const line=(id,y)=>({id,start:{x:0,y},c1:{x:30,y},c2:{x:70,y},end:{x:100,y}});
 const curves=[line('z',0),line('a',4),line('b',4)];
 assert.deepEqual(rankRelationHits({x:50,y:3.8},curves,1).map(x=>x.id),['a','b','z']);
 assert.deepEqual(rankRelationHits({x:50,y:20},curves,1),[]);
 for(const zoom of [.25,.5,1,2])assert.equal(rankRelationHits({x:50,y:-8/zoom},[line('z',0)],zoom).length,1);
 const moved=curves.map(c=>Object.fromEntries(Object.entries(c).map(([k,v])=>[k,k==='id'?v:{x:v.x+1000,y:v.y-700}])));
 assert.deepEqual(rankRelationHits({x:1050,y:-696.2},moved,1).map(x=>x.id),['a','b','z']);
 assert.deepEqual(rankRelationHits({x:0,y:0},[],1),[]);
});

test('stacked cards route outside their bodies and track resized bounds', async () => {
  const { relationGeometry } = await import('../src/topology.ts');
  const source = { x: 10, y: 20, width: 300, height: 150 };
  const target = { x: 80, y: 300, width: 220, height: 164 };
  for (const zoom of [.25, 1, 2]) {
    const previous = relationGeometry(source, target, zoom);
    const next = relationGeometry({ ...source, height: 190 }, target, zoom);
    assert.equal(next.start.x, source.x + source.width / 2);
    assert(next.start.y > 210 && next.start.y > previous.start.y);
    assert(next.start.y <= next.c1.y && next.c1.y <= next.c2.y && next.c2.y <= next.end.y);
    assert(next.end.y < target.y);
    assert.equal(next.end.x, target.x + target.width / 2);
    assert.equal(next.sourceAnchor.y, 210);
    assert.equal(next.targetAnchor.y, 300);
    const reverse = relationGeometry(target, { ...source, height: 190 }, zoom);
    assert.equal(reverse.sourceAnchor.y, 300);
    assert.equal(reverse.targetAnchor.y, 210);
    assert(reverse.start.y > reverse.end.y);
  }
});
