const path=require('node:path');
// Native OS input is confined to this explicitly-created Electron window.
// CDP mouse and the real cursor can otherwise produce conflicting capture events.
async function nativePointer(app,page) {
 const window=await app.browserWindow(page),id=await window.evaluate(w=>w.id);
 await app.evaluate(({BrowserWindow},args)=>{
  const req=process.getBuiltinModule('module').createRequire(args.file);
  const lib=req('koffi').load('user32.dll');
  const cursor=lib.func('int __stdcall SetCursorPos(int x,int y)'),getCursor=lib.func('int __stdcall GetCursorPos(void *p)');
  const client=lib.func('int __stdcall ClientToScreen(intptr_t hwnd,void *p)'),rect=lib.func('int __stdcall GetClientRect(intptr_t hwnd,void *p)');
  const mouse=lib.func('void __stdcall mouse_event(uint flags,uint dx,uint dy,uint data,uintptr_t extra)');
  const state=lib.func('short __stdcall GetAsyncKeyState(int key)'),foreground=lib.func('intptr_t __stdcall GetForegroundWindow()');
  const ancestor=lib.func('intptr_t __stdcall GetAncestor(intptr_t hwnd,uint flags)'),setForeground=lib.func('int __stdcall SetForegroundWindow(intptr_t hwnd)');
  const keyboard=lib.func('void __stdcall keybd_event(uint8_t key,uint8_t scan,uint flags,uintptr_t extra)');
  const w=BrowserWindow.fromId(args.id),buf=w.getNativeWindowHandle(),hwnd=buf.length===8?buf.readBigUInt64LE():buf.readUInt32LE();
  const original=Buffer.alloc(8);if(!getCursor(original))throw new Error('Cannot read native cursor');
  globalThis.__freeNative={w,hwnd,ancestor,setForeground,cursor,client,rect,mouse,state,foreground,keyboard,original,down:false};
 },{id,file:path.resolve(__filename)});
 return {
  async drag(x,y,dx,dy,steps=12) {
   await window.evaluate(w=>{w.show();w.focus();});
   const size=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
   await app.evaluate(async(_electron,args)=>{
    const n=globalThis.__freeNative;
    const ownRoot=n.ancestor(n.hwnd,2);if(String(n.ancestor(n.foreground(),2))!==String(ownRoot)){n.setForeground(ownRoot);await new Promise(r=>setTimeout(r,50));}if(String(n.ancestor(n.foreground(),2))!==String(ownRoot))throw new Error('Native input precondition: test window is not foreground');
    if(n.state(1)&0x8000)throw new Error('Native input precondition: left mouse already held');
    const area=Buffer.alloc(16);if(!n.rect(n.hwnd,area))throw new Error('Cannot read native client rectangle');
    const sx=area.readInt32LE(8)/args.size.width,sy=area.readInt32LE(12)/args.size.height;
    const ensureForeground=()=>{
     if(String(n.ancestor(n.foreground(),2))!==String(n.ancestor(n.hwnd,2)))throw new Error('Native input precondition: focus changed');
    };
    const move=(x,y)=>{
     ensureForeground();
     if(x<0||y<0||x>=args.size.width||y>=args.size.height)throw new Error('Native input outside isolated client');
     const p=Buffer.alloc(8);p.writeInt32LE(Math.round(x*sx),0);p.writeInt32LE(Math.round(y*sy),4);
     if(!n.client(n.hwnd,p)||!n.cursor(p.readInt32LE(0),p.readInt32LE(4)))throw new Error('Native cursor move unavailable');
    };
    move(args.x,args.y);await new Promise(r=>setTimeout(r,20));
    try {
     ensureForeground();
     if(n.state(1)&0x8000)throw new Error('Native input precondition: left mouse already held');
     n.mouse(2,0,0,0,0);n.down=true;
     if(!(n.state(1)&0x8000))throw new Error('Native mouse-down unavailable');
     for(let i=1;i<=args.steps;i++){move(args.x+args.dx*i/args.steps,args.y+args.dy*i/args.steps);await new Promise(r=>setTimeout(r,8));}
    } finally {if(n.down){n.mouse(4,0,0,0,0);n.down=false;}}
    await new Promise(r=>setTimeout(r,24));
   },{x,y,dx,dy,steps,size});
  },
  async undo() {
   await window.evaluate(w=>w.focus());
   await app.evaluate(async()=>{const n=globalThis.__freeNative;if(String(n.ancestor(n.foreground(),2))!==String(n.ancestor(n.hwnd,2)))throw new Error('Native keyboard window is not foreground');if((n.state(17)|n.state(90))&0x8000)throw new Error('Native keyboard already held');try{n.keyboard(17,0,0,0);n.keyboard(90,0,0,0);await new Promise(r=>setTimeout(r,20));}finally{n.keyboard(90,0,2,0);n.keyboard(17,0,2,0);}});
  },
  async restore() {
   await app.evaluate(()=>{const n=globalThis.__freeNative;if(!n)return;if(n.down){n.mouse(4,0,0,0,0);n.down=false;}n.cursor(n.original.readInt32LE(0),n.original.readInt32LE(4));});
  }
 };
}
module.exports={nativePointer};
