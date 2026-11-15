import {useEffect,useRef,useState} from 'react';
import {File,Download,X,GripHorizontal} from 'lucide-react';
import {ImagePreview} from './ImagePreview';
import type {FreeFileValue} from './board';
export function FreeFileCard({value,selected,select,change,remove,point,notify,interactive=true}:{interactive?:boolean;value:FreeFileValue;selected:boolean;select():void;change(v:FreeFileValue):void;remove():void;point(x:number,y:number):[number,number];notify(s:string):void}) {
 const [url,setUrl]=useState<string|null>(null),[loaded,setLoaded]=useState(false),[preview,setPreview]=useState<FreeFileValue|null>(null);
 const drag=useRef<{pointer:number;start:number[];value:FreeFileValue}|null>(null);
 useEffect(()=>{let active=true;if(value.category==='图片')void window.desktop?.files.thumbnail(value.contentRef.id).then(u=>{if(active){setUrl(u);setLoaded(true);if(!u)notify("图片预览不可用，可导出原文件");}}).catch(()=>{if(active)notify('图片预览不可用，可尝试导出原文件');});return()=>{active=false;};},[value.contentRef.id]);
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
  {url?<ImagePreview id={value.contentRef.id} name={value.name} trigger={<button className="free-image-preview" aria-label={`预览 ${value.name}`} onPointerDown={e=>e.stopPropagation()}><img src={url} alt={value.name} draggable={false}/></button>}/> :<div className="free-file-body"><File size={30}/><strong>{value.name}</strong><small>{value.category==='图片'?(loaded?'预览不可用，可导出原文件':'正在加载预览…'):`${value.category} · 本机托管副本`}</small></div>}
 {url&&<span className="free-image-caption">点击查看原图</span>}
 </article>;
}
