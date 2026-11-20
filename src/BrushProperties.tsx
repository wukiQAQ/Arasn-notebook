import { Button } from './Button';
import { useState } from 'react';
import { contrast } from './appearance';
import { AppSelect } from './xigra/AppSelect';
import { BRUSH_DEFAULTS, BRUSH_NAMES, BRUSH_PRESETS, defaultBrush, hexToHsl, hslToHex, validWidth, type BrushKind, type BrushPreset, type BrushStyle } from './brush';
import { InkStroke } from './InkStroke';
import type { Shape } from './drawing';

const palette=['#263449','#4668c6','#39796b','#d05a4b','#e8c56a','#f0f2f6'];
const previewPoints=Array.from({length:25},(_,i)=>{
 const t=i/24;
 return [23+194*t,30-6*Math.sin(t*Math.PI*2.5),.12+.75*Math.sin(t*Math.PI)];
});
const cardPoints=[[8,15,.13],[24,10,.75],[40,12,.92],[55,14,.53],[67,8,.14]];
type Props={dark:boolean;inkVersion?:1;color:string;width:number;style:BrushStyle;change(p:Partial<BrushPreset>):void;ink:boolean;shape?:Shape;setShape?(s:Shape):void;presets:BrushPreset[];save(p:BrushPreset[]):Promise<void>;text?:{fontSize?:number;bold?:boolean};changeText?(p:{fontSize?:number;bold?:boolean}):void};

export function BrushProperties(p:Props) {
 const [widthText,setWidthText]=useState<string|null>(null);
 const [name,setName]=useState(''),[editing,setEditing]=useState<number|null>(null);
 const [presetIndex,setPresetIndex]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const hsl=hexToHsl(p.color), kind=p.style.brush;
 const previewBackground=contrast(p.color,'#E8ECF2')>=contrast(p.color,'#22262E')?'#E8ECF2':'#22262E';
 const persist=async(next:BrushPreset[],index:string)=>{
  setBusy(true);setError('');
  try {await p.save(next);setName('');setEditing(null);setPresetIndex(index);}
  catch {setError('方案保存失败，请重试');}
  finally {setBusy(false);}
 };
 const widthChange=(width:number)=>{if(width!==p.width)p.change({width});};
 const selected=p.presets[Number(presetIndex)];
 return <div className="brush-properties">
  {p.ink&&<>
   <svg className="brush-preview" style={{backgroundColor:previewBackground}} viewBox="0 0 240 54" role="img" aria-label="笔刷预览">
    <InkStroke ink={{...p.style,width:p.width,color:p.color,points:previewPoints,inkVersion:p.inkVersion}}/>
   </svg>
   {p.setShape&&<div className="tool-select-row"><span>图形</span><AppSelect label="绘图工具" value={p.shape!} options={[{value:'line',label:'直线'},{value:'rect',label:'矩形'},{value:'ellipse',label:'椭圆'},{value:'arrow',label:'箭头'},{value:'triangle',label:'三角形'}]} onValueChange={v=>p.setShape!(v as Shape)}/></div>}
   <div className="brush-width">
    <span>粗细</span>
    <input aria-label="画笔粗细" type="range" min={.5} max={40} step={.5} value={p.width}
     onChange={e=>{setWidthText(null);widthChange(e.target.valueAsNumber);}}/>
    <input className="ui-field" aria-label="粗细数值（px）" type="number" min={.5} max={40} step={.5}
     value={widthText??p.width} onChange={e=>{setWidthText(e.target.value);if(validWidth(e.target.valueAsNumber))widthChange(e.target.valueAsNumber);}}
     onBlur={e=>{const v=e.target.valueAsNumber;if(Number.isFinite(v))widthChange(Math.max(.5,Math.min(40,Math.round(v*2)/2)));setWidthText(null);}}
     onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>
    <span className="brush-unit">px</span>
   </div>
   {!p.setShape&&<div className="brush-kinds" role="group" aria-label="笔刷类型">
    {(Object.entries(BRUSH_NAMES) as [BrushKind,string][]).map(([brush,label])=>{
     const settings=BRUSH_DEFAULTS[brush];
     return <button type="button" key={brush} aria-pressed={brush===kind} onClick={()=>p.change({brush})}>
      <svg viewBox="0 0 76 24" aria-hidden="true"><InkStroke ink={{...settings,width:Math.min(9,settings.width),color:'currentColor',points:cardPoints,inkVersion:1}}/></svg>
      {label}
     </button>;
    })}
   </div>}
  </>}
  <div className="brush-colors">
   <div className="colors" role="group" aria-label="快速色板">{palette.map((c,i)=><Button key={c} className={`color ${c===p.color?'chosen':''}`} style={{background:c}} aria-label={['墨色','靛蓝','松绿','朱红','暖黄','纸白'][i]} aria-pressed={c===p.color} onClick={()=>p.change({color:c})}/>)}</div>
   <input type="color" title="自定义颜色" aria-label="自定义颜色" value={p.color} onChange={e=>p.change({color:e.target.value})}/>
  </div>
  {p.text&&<><div className="tool-select-row"><span>字号</span><AppSelect label="文字字号" value={String(p.text.fontSize??18)} options={[14,18,24,32].map(v=>({value:String(v),label:`${v} px`}))} onValueChange={v=>p.changeText?.({fontSize:Number(v)})}/></div><Button className="brush-action" aria-label="文字加粗" aria-pressed={!!p.text.bold} onClick={()=>p.changeText?.({bold:!p.text?.bold})}>加粗</Button></>}
  {p.ink&&<label className="tool-range-row brush-opacity">不透明度<output>{Math.round(p.style.opacity*100)}%</output><input aria-label="画笔不透明度" type="range" min="10" max="100" value={Math.round(p.style.opacity*100)} onChange={e=>p.change({opacity:e.target.valueAsNumber/100})}/></label>}
  <details><summary>{p.ink?'高级参数':'HSL 调色'}</summary>
   {p.ink&&<>
    {kind!=='calligraphy'&&kind!=='pencil'&&<div className="tool-select-row"><span>端点</span><AppSelect label="笔迹端点" value={p.style.lineCap} options={[{value:'round',label:'圆头'},{value:'butt',label:'平头'},{value:'square',label:'方头'}]} onValueChange={v=>p.change({lineCap:v as BrushStyle['lineCap']})}/></div>}
    {!p.setShape&&<label className="tool-range-row">平滑<output>{Math.round(p.style.smoothing*100)}%</output><input aria-label="笔迹平滑" type="range" min="0" max="100" value={Math.round(p.style.smoothing*100)} onChange={e=>p.change({smoothing:e.target.valueAsNumber/100})}/></label>}
    {kind==='calligraphy'&&p.shape==='free'&&<label><span>使用设备压感</span><input type="checkbox" checked={p.style.pressure!==false} onChange={e=>p.change({pressure:e.target.checked})}/></label>}
    {kind==='dash'&&(['dashLength','dashGap'] as const).map((field,i)=>{
     const label=i?'虚线间距':'虚线长度',value=p.style[field]??p.width*(i?2.5:3);
     return <label className="tool-range-row" key={field}>{label}<output>{value} px</output><input aria-label={label} type="range" min="1" max="120" value={value} onChange={e=>p.change({[field]:e.target.valueAsNumber})}/></label>;
    })}
   </>}
   {['色相','饱和度','明度'].map((label,i)=><label className="tool-range-row" key={label}>{label}<output>{Math.round(hsl[i])}{i?'%':'°'}</output><input aria-label={label} type="range" min="0" max={i?100:360} value={hsl[i]} onChange={e=>{const next=[...hsl] as [number,number,number];next[i]=e.target.valueAsNumber;p.change({color:hslToHex(...next)});}}/></label>)}
  </details>
  {p.ink&&<details className="brush-presets"><summary>画笔预设</summary>
   <div className="brush-preset-grid">{BRUSH_PRESETS.filter(v=>!p.setShape||v.brush!=='marker').map(v=><Button className="brush-action" key={v.name} onClick={()=>p.change(v)}>{v.name}</Button>)}</div>
   {p.presets.length>0&&<div className="brush-preset-manage">
    <select className="ui-field" aria-label="自定义预设" value={presetIndex} onChange={e=>{const index=e.target.value;setPresetIndex(index);setEditing(null);setName('');if(index!=='')p.change(p.presets[Number(index)]);}}>
     <option value="">选择自定义预设</option>{p.presets.map((v,i)=><option key={i} value={i}>{v.name}</option>)}
    </select>
    {presetIndex!==''&&selected&&<div className="brush-preset-grid">
     <Button className="brush-action" disabled={busy} onClick={()=>p.change(selected)}>应用</Button>
     <Button className="brush-action" disabled={busy} onClick={()=>{setEditing(Number(presetIndex));setName(selected.name);}}>重命名</Button>
     <Button className="brush-action" disabled={busy} onClick={()=>void persist(p.presets.filter((_,i)=>i!==Number(presetIndex)),'')}>删除</Button>
    </div>}
   </div>}
   <form className="brush-preset-manage brush-preset-form" onSubmit={e=>{
    e.preventDefault();
    if(busy||!name.trim()||(editing===null&&p.presets.length>=12))return;
    const {opacity,smoothing,lineCap,brush,dashLength,dashGap,pressure}=p.style;
    const preset={opacity,smoothing,lineCap,brush,dashLength,dashGap,pressure,color:p.color,width:p.width,name:name.trim()};
    void persist(editing===null?[...p.presets,preset]:p.presets.map((v,i)=>i===editing?{...v,name:name.trim()}:v),String(editing??p.presets.length));
   }}>
    <input className="ui-field" aria-label="预设名称" placeholder="预设名称" maxLength={32} value={name} onChange={e=>setName(e.target.value)}/>
    <button type="submit" className="brush-action" disabled={busy||!name.trim()||(editing===null&&p.presets.length>=12)}>{editing===null?'保存当前笔刷':'保存名称'}</button>
    <div className="brush-preset-grid">
     {editing!==null&&<Button className="brush-action" onClick={()=>{setEditing(null);setName('');}}>取消</Button>}
     <Button className="brush-action" onClick={()=>p.change(defaultBrush(kind,p.dark))}>恢复默认值</Button>
    </div>
   </form>
  </details>}
  {error&&<p role="alert">{error}</p>}
 </div>;
}
