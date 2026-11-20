import { memo } from 'react';
import { inkLayers } from './ink-renderer';

export const InkStroke = memo(function InkStroke({ink,selected,testId}:{
 ink:Parameters<typeof inkLayers>[0]; selected?:boolean; testId?:string;
}) {
 const layers=inkLayers(ink);
 const path=(layer:typeof layers[number],key?:number)=><path key={key}
  data-legacy-ink={!ink.inkVersion||undefined}
  data-testid={layers.length===1?testId:undefined} data-box-selected={layers.length===1&&selected||undefined}
  d={layer.path} fill={layer.fill?ink.color:'none'} stroke={layer.fill?undefined:ink.color}
  strokeWidth={layer.width} strokeLinecap={layer.cap} strokeLinejoin="round"
  strokeDasharray={layer.dash.join(' ')} strokeDashoffset={layer.offset} opacity={layer.alpha}
  transform={layer.x||layer.y?`translate(${layer.x??0} ${layer.y??0})`:undefined}/>;
 if(layers.length===1)return path(layers[0]);
 return <g data-testid={testId} data-box-selected={selected||undefined}>{layers.map(path)}</g>;
});
