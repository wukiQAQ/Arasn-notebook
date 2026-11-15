import type {Bounds,Point,Size} from './topology';
export function placeRelationTooltip(anchor:Point,size:Size,obstacles:Bounds[]) {
 const width=Math.min(200,size.width-16),height=94;if(width<120||size.height<height+16)return undefined;
 const candidates=[{x:anchor.x-width/2,y:anchor.y-height-16},{x:anchor.x-width/2,y:anchor.y+16},{x:anchor.x+20,y:anchor.y-height/2},{x:anchor.x-width-20,y:anchor.y-height/2}];
 for(let offset=40;offset<=Math.min(size.height,400);offset+=40)candidates.push({x:anchor.x-width/2,y:anchor.y-height-offset},{x:anchor.x-width/2,y:anchor.y+offset});
 for(const candidate of candidates){const box={x:Math.max(8,Math.min(size.width-width-8,candidate.x)),y:Math.max(8,Math.min(size.height-height-8,candidate.y)),width,height};if(!obstacles.some(b=>box.x<b.x+b.width+10&&box.x+width+10>b.x&&box.y<b.y+b.height+10&&box.y+height+10>b.y))return box;}
 return undefined;
}
