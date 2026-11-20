import {erasePath} from './erase-path';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { BoardClient, StrokeValue, Value } from './board';
import { shapePoints, strokeBounds, strokeHit, transformStroke, type Shape } from './drawing';
import { uid } from './board';
import { strokeCenterline, type BrushStyle } from './brush';
import { sameValue } from './drawing-history';
type Props = { client: BoardClient; canvasId?: string; tool: string; shape: Shape; color: string; width: number; brushStyle: BrushStyle; scale: number; selected: string; select(id: string): void; point(x: number,y: number): [number,number]; commit(changes: {id: string; value: Value | null}[]): void };
type Gesture = { pointer: number; kind: 'draw' | 'erase' | 'move' | 'resize'; start: number[]; last: number[]; time?:number; id?: string; original?: StrokeValue; draft?: StrokeValue; erased: Set<string>; snapshots?: Map<string, StrokeValue>; fragments?: Map<string, StrokeValue[]> };
export function useDrawingTools(p: Props) {
  const gesture = useRef<Gesture | null>(null), frame=useRef(0);
  const [,render]=useState(0);
  const [eraserSize,setEraserSize]=useState(32);
  const [eraserMode,setEraserMode]=useState<'stroke'|'partial'>('stroke');
  const cursor=useRef<HTMLDivElement>(null);
  const refresh=()=> {if (!frame.current) frame.current=requestAnimationFrame(()=>{frame.current=0;render(n=>n+1);});};
  const cancel=()=>{gesture.current=null;refresh();};
  useEffect(()=>{ window.addEventListener('blur',cancel);return()=>{window.removeEventListener('blur',cancel);cancelAnimationFrame(frame.current);frame.current=0;};},[]);
  useLayoutEffect(()=>{cancel();},[p.tool,p.shape,p.client.base.roomId,p.canvasId,eraserMode]);
  const all=()=>Object.entries(p.client.view()).flatMap(([id,item])=>item.value?.type==='stroke' && item.value.canvasId === p.canvasId ? [{id,value:item.value}] : []);
  const erase=(g: Gesture, point: number[])=>{
    for (const {id,value} of all()) {
      if(eraserMode==='stroke') {if(!g.erased.has(id)&&strokeHit(strokeCenterline(value),g.last,point,eraserSize/2/p.scale+value.width/2)){g.erased.add(id);g.snapshots!.set(id,value);}continue;}
      const existing=g.fragments!.get(id),parts=existing??[{...value,points:strokeCenterline(value),smoothing:0}];
      let changed=false;const fragments:StrokeValue[]=[];
      for(const part of parts){const radius=eraserSize/2/p.scale+part.width/2;if(!strokeHit(part.points,g.last,point,radius)){fragments.push(part);continue;}const kept=erasePath(part.points,g.last,point,radius);if(kept.length!==1||kept[0]!==part.points)changed=true;
        for(const points of kept)for(let offset=0;offset<points.length;offset+=2999){const chunk=points.slice(offset,offset+3000);if(chunk.length>1||points.length===1)fragments.push({...part,points:chunk});}
      }
      if(changed){g.snapshots!.set(id,g.snapshots!.get(id)??value);g.fragments!.set(id,fragments);}
    }
    g.last=point;refresh();
  };
  const sampleInk=(g:Gesture,sample:{pressure:number;pointerType:string;timeStamp:number},point:number[],finish=false)=>{
    const draft=g.draft!,points=draft.points;
    const distance=Math.hypot(point[0]-g.last[0],point[1]-g.last[1]);
    if(points.length && distance*p.scale<(finish?.05:.6))return;
    if(draft.brush==='calligraphy') {
      const last=points.at(-1)?.[2]??.12;
      const speed=distance*p.scale/Math.max(1,sample.timeStamp-(g.time??sample.timeStamp));
      const reported=p.brushStyle.pressure!==false&&sample.pointerType==='pen'&&sample.pressure>0;
      const target=reported?sample.pressure:.18+.72/(1+speed*1.4);
      point.push(reported?target:finish?.12:points.length?last*.55+target*.45:.12);
    }
    if(points.length>=3000)draft.points=points.filter((_,i)=>i%2===0||i===points.length-1);
    draft.points.push(point);
    g.last=point;g.time=sample.timeStamp;
  };
  const down=(e: PointerEvent, resize=false)=>{
    if(e.button!==0 || !e.isPrimary || gesture.current || !p.client.ready)return false;
    const point=p.point(e.clientX,e.clientY);
    if(p.tool==='erase') {
      const g:Gesture={pointer:e.pointerId,kind:'erase',start:point,last:point,erased:new Set(),snapshots:new Map(),fragments:new Map()};gesture.current=g;erase(g,point);
    } else if(p.tool==='pen') {
      const {brush,opacity,lineCap,smoothing,dashLength,dashGap}=p.brushStyle;
      const g:Gesture={pointer:e.pointerId,kind:'draw',start:point,last:point,draft:{
        type:'stroke',color:p.color,width:p.width,brush,opacity,lineCap,
        smoothing:p.shape==='free'?smoothing:0,inkVersion:1,
        ...(brush==='dash'&&dashLength!==undefined?{dashLength}:{}),
        ...(brush==='dash'&&dashGap!==undefined?{dashGap}:{}),points:[],
      },erased:new Set()};
      sampleInk(g,e,[...point]);gesture.current=g;p.select('');
    } else if(p.tool==='select') {
      const hit=resize ? all().find(s=>s.id===p.selected) : all().reverse().find(s=>strokeHit(strokeCenterline(s.value),point,point,6/p.scale+s.value.width/2));
      if(!hit)return false;
      p.select(hit.id);gesture.current={pointer:e.pointerId,kind:resize?'resize':'move',start:point,last:point,id:hit.id,original:hit.value,draft:hit.value,erased:new Set()};
    } else return false;
    e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);refresh();return true;
  };
  const move=(e: PointerEvent)=>{
    if(cursor.current){const rect=e.currentTarget.getBoundingClientRect();cursor.current.style.transform=`translate(${e.clientX-rect.left-eraserSize/2}px,${e.clientY-rect.top-eraserSize/2}px)`;cursor.current.style.visibility='visible';}
    const g=gesture.current;if(!g || g.pointer!==e.pointerId)return false;
    const samples=e.nativeEvent.getCoalescedEvents?.() ?? [];
    for(const sample of samples.length?samples:[e]) {
      const point=p.point(sample.clientX,sample.clientY);
      if(g.kind==='erase'){erase(g,point);continue;}
      if(g.kind==='draw') {
        if(p.shape==='free') {sampleInk(g,sample,point);continue;}
        else g.draft={...g.draft!,points:shapePoints(p.shape,g.start,point)};
      } else {
        const box=strokeBounds(g.original!.points),dx=point[0]-g.start[0],dy=point[1]-g.start[1];
        const next=g.kind==='move'?{...box,x:box.x+dx,y:box.y+dy}:{...box,width:Math.max(2/p.scale,box.width+dx),height:Math.max(2/p.scale,box.height+dy)};
        g.draft={...g.original!,points:transformStroke(g.original!.points,box,next)};
      }
      g.last=point;
    }
    refresh();return true;
  };
  const up=(e: PointerEvent)=>{
    const g=gesture.current;if(!g || g.pointer!==e.pointerId)return false;
    if(e.type==='pointerup') {
      if(g.kind==='erase') {
        const changes:{id:string;value:Value|null}[]=[];
        for(const id of new Set([...g.erased,...g.fragments!.keys()])){if(!sameValue(p.client.view()[id]?.value,g.snapshots!.get(id)))continue;changes.push({id,value:null});for(const value of g.fragments!.get(id)??[])changes.push({id:uid(),value});}
        p.commit(changes);
      }
      else if(g.kind==='draw'){
        const end=p.point(e.clientX,e.clientY);
        if(p.shape==='free'){
          sampleInk(g,e,end,true);
          const points=g.draft!.points;
          if(g.draft!.brush==='calligraphy'&&e.pointerType!=='pen'&&points.length>1) {
            points[points.length-1][2]=.12;
            if(points.length>2)points[points.length-2][2]*=.73;
          }
        } else g.draft!.points=shapePoints(p.shape,g.start,end);
        p.commit([{id:uid(),value:g.draft!}]);
      }
      else if(sameValue(g.original,p.client.view()[g.id!]?.value) && g.draft!==g.original)p.commit([{id:g.id!,value:g.draft!}]);
    }
    cancel();return true;
  };
  const g=gesture.current;
  const chosen=p.client.view()[p.selected]?.value;
  const selectedStroke=chosen?.type==='stroke' ? (g?.id===p.selected?g.draft!:chosen) : null;
  return {down,move,up,cancel,cursor,eraserSize,setEraserSize,eraserMode,setEraserMode,fragments:g?.fragments,
    active:()=>gesture.current!==null, draft:g?.kind==='draw'?{...g.draft!}:null, erased:g?.erased??new Set<string>(),
    previewId:g?.id, preview:g?.draft, selectedStroke,
    bounds:selectedStroke?strokeBounds(selectedStroke.points):null};
}
