const {test}=require('node:test');const assert=require('node:assert/strict');
test('brush paths preserve legacy geometry and render smoothing, caps and dashes',async()=>{
 const {brushPath,brushDash,hexToHsl,hslToHex,validPreset}=await import('../src/brush.ts');
 const s={points:[[0,0],[10,20],[20,0]],width:4};
 assert.equal(brushPath(s),'M 0 0 L 10 20 L 20 0');
 assert.notEqual(brushPath({...s,smoothing:1}),brushPath(s));
 assert.deepEqual(brushDash({...s,brush:'dash'}),[12,10]);assert.deepEqual(brushDash(s),[]);
 for(const hex of ['#39796b','#ffffff','#000000','#d05a4b']){const h=hexToHsl(hex);assert.equal(hslToHex(...h),hex);}
 const p={name:'我的笔',color:'#39796b',width:4,opacity:.5,smoothing:.4,lineCap:'round',brush:'ink'};
 assert(validPreset(p));for(const bad of [{width:100},{name:'x'.repeat(33)},{opacity:NaN},{brush:'fake'},{lineCap:'fake'},{smoothing:2}])assert(!validPreset({...p,...bad}));
});
test('server preserves optional brush values and rejects invalid fields',()=>{
 const {createStore}=require('../desktop/server.cjs');const {randomUUID}=require('node:crypto');const store=createStore(null);
 const v={type:'stroke',color:'#39796b',width:4,points:[[0,0],[10,20]],brush:'dash',lineCap:'square',smoothing:.6,opacity:.5};const id=randomUUID();
 store.apply({id,value:v,expected:0,opId:randomUUID()});assert.deepEqual(store.snapshot().items[id].value,v);
 for(const patch of [{brush:'fake'},{lineCap:'fake'},{smoothing:NaN},{smoothing:2}])assert.throws(()=>store.apply({id:randomUUID(),value:{...v,...patch},expected:0,opId:randomUUID()}));
});
test('history accepts server field ordering but still rejects actual remote edits',async()=>{
 const {DrawingHistory}=await import('../src/drawing-history.ts');const h=new DrawingHistory();
 const before={type:'stroke',color:'#39796b',width:4,opacity:.5,smoothing:.6,lineCap:'square',brush:'dash',points:[[0,0],[10,20]]};
 const current={type:'stroke',color:before.color,width:4,points:before.points,brush:'dash',lineCap:'square',smoothing:.6,opacity:.5};
 h.record([{id:'a',before:null,after:before}]);let state=current;
 assert.equal(h.apply(false,()=>state,(_id,v)=>state=v,()=> 'fresh'),'ok');assert.equal(state,null);
 state={...current,width:7};assert.equal(h.apply(true,()=>state,()=>{},()=> 'fresh'),'conflict');
});
test('desktop preset boundary limits size, unknown fields and malformed values',async()=>{
 const {validBrushPresets}=require('../desktop/engines/brush-presets.cjs');const {BRUSH_PRESETS}=await import('../src/brush.ts');
 assert(validBrushPresets(BRUSH_PRESETS));assert(validBrushPresets([]));assert(!validBrushPresets(Array(13).fill(BRUSH_PRESETS[0])));
 for(const bad of [{name:''},{color:123},{opacity:Infinity},{smoothing:-1},{width:100},{extra:true}])assert(!validBrushPresets([{...BRUSH_PRESETS[0],...bad}]));
});

test('versioned fractional ink round-trips pressure and dash settings, with bounded input', async () => {
 const {createStore}=require('../desktop/server.cjs');
 const {randomUUID}=require('node:crypto');
 const {BRUSH_DEFAULTS,validPreset}=await import('../src/brush.ts');
 const {erasePath}=await import('../src/erase-path.ts');
 const {strokeBounds,transformStroke}=await import('../src/drawing.ts');
 const {validBrushPresets}=require('../desktop/engines/brush-presets.cjs');
 const store=createStore(null);
 const apply=value=>store.apply({id:randomUUID(),value,expected:0,opId:randomUUID()});
 const ink={type:'stroke',inkVersion:1,brush:'calligraphy',color:'#263449',width:5.5,points:[[0,0,.1],[20,0,.9]]};
 const result=apply(ink);
 assert.deepEqual(Object.values(result.items)[0].value,ink);
 const moved=transformStroke(ink.points,strokeBounds(ink.points),{x:50,y:20,width:40,height:0});
 assert.deepEqual(moved,[[50,20,.1],[90,20,.9]]);
 const pieces=erasePath(ink.points,[10,0],[10,0],2);
 assert.equal(pieces.length,2);
 assert(Math.abs(pieces[0].at(-1)[2]-.42)<1e-9);
 assert(Math.abs(pieces[1][0][2]-.58)<1e-9);
 const dash={...ink,brush:'dash',dashLength:13,dashGap:7,points:[[0,0],[20,0]]};
 assert(Object.values(apply(dash).items).some(v=>v.value.dashLength===13&&v.value.dashGap===7));
 for(const patch of [{width:.4},{width:40.5},{width:8.3},{inkVersion:undefined},{points:[[0,0,1.01]]},{dashGap:121}]){
  assert.throws(()=>apply({...ink,...patch}));
 }
 const presets=Object.values(BRUSH_DEFAULTS);
 assert(presets.every(validPreset));
 assert(validBrushPresets(presets));
});
