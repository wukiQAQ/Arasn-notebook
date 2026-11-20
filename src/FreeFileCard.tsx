import {useEffect,useRef,useState} from 'react';
import {Download,X,GripHorizontal} from 'lucide-react';
import {FilePreviewCard} from './FilePreviewCard';
import {CardResizeHandle} from './CardResizeHandle';
import type {FreeFileValue} from './board';
const FILE_CARD_LIMITS = {minWidth:120,minHeight:96,maxWidth:1200,maxHeight:1200};
export function FreeFileCard({value,selected,select,change,remove,point,notify,scale,interactive=true}:{interactive?:boolean;value:FreeFileValue;selected:boolean;select():void;change(v:FreeFileValue):void;remove():void;point(x:number,y:number):[number,number];notify(s:string):void;scale:number}) {
 const [preview,setPreview]=useState<FreeFileValue|null>(null);
 const drag=useRef<{pointer:number;start:number[];value:FreeFileValue}|null>(null);
 useEffect(()=>{const cancel=()=>{drag.current=null;setPreview(null);};window.addEventListener('blur',cancel);return()=>window.removeEventListener('blur',cancel);},[]);
 const v=preview??value;
 return <article inert={!interactive} className={`free-file-card ${selected?'focused':''}`} data-free-file={value.contentRef.id} style={{left:v.x,top:v.y,width:v.width,height:v.height,opacity:v.opacity??1}} onPointerDown={e=>{e.stopPropagation();select();}}>
  <header onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={pointer:e.pointerId,start:point(e.clientX,e.clientY),value};}}
   onPointerMove={e=>{const g=drag.current;if(g?.pointer!==e.pointerId)return;const p=point(e.clientX,e.clientY);setPreview({...g.value,x:Math.max(-1e6,Math.min(1e6,g.value.x+p[0]-g.start[0])),y:Math.max(-1e6,Math.min(1e6,g.value.y+p[1]-g.start[1]))});}}
   onPointerUp={e=>{const g=drag.current;if(g?.pointer===e.pointerId){const p=point(e.clientX,e.clientY);if(JSON.stringify(g.value)!==JSON.stringify(value))notify('附件已变化，请重试拖动');else if(p[0]!==g.start[0]||p[1]!==g.start[1])change({...g.value,x:Math.max(-1e6,Math.min(1e6,g.value.x+p[0]-g.start[0])),y:Math.max(-1e6,Math.min(1e6,g.value.y+p[1]-g.start[1]))});}drag.current=null;setPreview(null);}}
   onPointerCancel={()=>{drag.current=null;setPreview(null);}} onLostPointerCapture={()=>{drag.current=null;setPreview(null);}}>
    <GripHorizontal size={16}/><span title={value.name}>{value.name}</span>
    <button aria-label={`导出附件 ${value.name}`} onPointerDown={e=>e.stopPropagation()} onClick={()=>void window.desktop?.files.action('export',{id:value.contentRef.id,name:value.name}).catch(e=>notify(String(e)))}><Download size={15}/></button>
    <button aria-label={`移除附件 ${value.name}`} onPointerDown={e=>e.stopPropagation()} disabled={!selected || !interactive} onClick={remove}><X size={15}/></button>
  </header>
  <FilePreviewCard key={value.contentRef.id} id={value.contentRef.id} name={value.name} category={value.category} canvas
    small={Math.max(value.width, value.height) * scale * window.devicePixelRatio <= 160} disabled={!interactive} />
  {selected && interactive && <CardResizeHandle width={value.width} height={value.height} zoom={scale}
    label={`调整附件 ${value.name} 尺寸`} limits={FILE_CARD_LIMITS}
    onPreview={size => setPreview({...value, ...size})}
    onCommit={size => {setPreview(null); if (size.width !== value.width || size.height !== value.height) change({...value, ...size});}}
    onCancel={() => setPreview(null)} />}
 </article>;
}
