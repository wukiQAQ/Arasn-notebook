// Subtract a swept circular eraser (capsule) from a rendered polyline.
// Segment boundary roots preserve exact intersection points, including sparse paths.
export function erasePath(points:number[][], a:number[], b:number[], radius:number):number[][][] {
 if(!points.length)return [];
 const dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy,r2=radius*radius;
 const inside=(p:number[])=>{const t=length?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)):0;return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2<r2-1e-8;};
 if(points.length===1)return inside(points[0])?[]:[points];
 const result:number[][][]=[],same=(p:number[],q:number[])=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-6;
 let current:number[][]=[],removed=false;
 const flush=()=>{if(current.length>1)result.push(current);current=[];};
 for(let i=1;i<points.length;i++){
  const p=points[i-1],q=points[i],vx=q[0]-p[0],vy=q[1]-p[1],roots=[0,1],point=(t:number)=>[p[0]+t*vx,p[1]+t*vy];
  const add=(t:number)=>{if(t>0&&t<1&&Number.isFinite(t))roots.push(t);};
  for(const c of [a,b]){const ux=p[0]-c[0],uy=p[1]-c[1],aa=vx*vx+vy*vy,bb=2*(ux*vx+uy*vy),cc=ux*ux+uy*uy-r2,disc=bb*bb-4*aa*cc;if(aa&&disc>=0){add((-bb-Math.sqrt(disc))/(2*aa));add((-bb+Math.sqrt(disc))/(2*aa));}}
  if(length){const cross=(p[0]-a[0])*dy-(p[1]-a[1])*dx,slope=vx*dy-vy*dx,edge=radius*Math.sqrt(length);if(slope){add((edge-cross)/slope);add((-edge-cross)/slope);}const projection=(p[0]-a[0])*dx+(p[1]-a[1])*dy,velocity=vx*dx+vy*dy;if(velocity){add(-projection/velocity);add((length-projection)/velocity);}}
  roots.sort((a,b)=>a-b);
  for(let k=1;k<roots.length;k++){const lo=roots[k-1],hi=roots[k];if(hi-lo<1e-10)continue;if(inside(point((lo+hi)/2))){removed=true;flush();continue;}const start=point(lo),end=point(hi);if(current.length&&!same(current.at(-1)!,start))flush();if(!current.length)current.push(start);if(!same(current.at(-1)!,end))current.push(end);}
 }
 flush();return removed?result:[points];
}
