type Point = { x: number; y: number };
export type HitCurve = { id: string; start: Point; c1: Point; c2: Point; end: Point };

// Distances are measured in screen pixels; camera translation has already been removed.
export function rankRelationHits(point: Point, curves: HitCurve[], zoom: number, tolerance = 9) {
  const hits: { id: string; distance: number }[] = [];
  for (const curve of curves) {
    const points = [curve.start, curve.c1, curve.c2, curve.end], pad = tolerance / zoom;
    if (point.x < Math.min(...points.map(p => p.x)) - pad || point.x > Math.max(...points.map(p => p.x)) + pad ||
        point.y < Math.min(...points.map(p => p.y)) - pad || point.y > Math.max(...points.map(p => p.y)) + pad) continue;
    const length = points.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x-points[i].x,p.y-points[i].y),0);
    const steps = Math.max(24, Math.min(256, Math.ceil(length * zoom / 6)));
    let previous = curve.start, distance = Infinity;
    for (let i=1;i<=steps;i++) {
      const t=i/steps,u=1-t;
      const next={x:u**3*curve.start.x+3*u*u*t*curve.c1.x+3*u*t*t*curve.c2.x+t**3*curve.end.x,
        y:u**3*curve.start.y+3*u*u*t*curve.c1.y+3*u*t*t*curve.c2.y+t**3*curve.end.y};
      const dx=next.x-previous.x,dy=next.y-previous.y;
      const along=Math.max(0,Math.min(1,((point.x-previous.x)*dx+(point.y-previous.y)*dy)/(dx*dx+dy*dy||1)));
      distance=Math.min(distance,Math.hypot(point.x-previous.x-along*dx,point.y-previous.y-along*dy)*zoom);
      previous=next;
    }
    if(distance<=tolerance)hits.push({id:curve.id,distance});
  }
  return hits.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id));
}
