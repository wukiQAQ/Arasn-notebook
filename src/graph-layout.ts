import type { Bounds, Point } from './topology';
type Node = { id: string; layout: Bounds & { locked?: boolean } };
type Edge = { fromNodeId: string; toNodeId: string; direction: string };

// Collapse cycles before layering. Stable ordering makes repeated layout deterministic.
export function arrangeGraph(nodes: Node[], edges: Edge[], movable = new Set(nodes.map(n => n.id))): Record<string, Point> {
  if (!nodes.length) return {};
  const byId = new Map(nodes.map(n => [n.id, n]));
  const adj = new Map(nodes.map(n => [n.id, new Set<string>()]));
  const reverse = new Map(nodes.map(n => [n.id, new Set<string>()]));
  for (const e of edges) if (byId.has(e.fromNodeId) && byId.has(e.toNodeId)) {
    adj.get(e.fromNodeId)!.add(e.toNodeId); reverse.get(e.toNodeId)!.add(e.fromNodeId);
    if (e.direction !== 'forward') { adj.get(e.toNodeId)!.add(e.fromNodeId); reverse.get(e.fromNodeId)!.add(e.toNodeId); }
  }
  const seen = new Set<string>(), order: string[] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const stack: [string, boolean][] = [[n.id, false]];
    while (stack.length) { const [id, exit] = stack.pop()!; if (exit) { order.push(id); continue; } if (seen.has(id)) continue; seen.add(id); stack.push([id, true]); for (const next of adj.get(id)!) if (!seen.has(next)) stack.push([next, false]); }
  }
  const component = new Map<string, number>(), groups: string[][] = [];
  for (const id of order.reverse()) {
    if (component.has(id)) continue;
    const index = groups.length, group: string[] = [], stack = [id]; groups.push(group);
    while (stack.length) { const next = stack.pop()!; if (component.has(next)) continue; component.set(next, index); group.push(next); for (const parent of reverse.get(next)!) stack.push(parent); }
  }
  const links = groups.map(() => new Set<number>()), indegree = groups.map(() => 0), ranks = groups.map(() => 0);
  for (const [id, targets] of adj) for (const target of targets) { const a=component.get(id)!, b=component.get(target)!; if(a!==b&&!links[a].has(b)){links[a].add(b);indegree[b]++;} }
  const queue = indegree.flatMap((n,i)=>n===0?[i]:[]);
  for(let i=0;i<queue.length;i++) for(const b of links[queue[i]]){ranks[b]=Math.max(ranks[b],ranks[queue[i]]+1);if(--indegree[b]===0)queue.push(b);}
  const layers: Node[][] = [];
  for(const n of nodes){const rank=ranks[component.get(n.id)!];(layers[rank]??=[]).push(n);}
  // Barycentre ordering reduces crossings between successive layers.
  const positions = new Map<string,number>();
  for(const layer of layers){layer.sort((a,b)=>{
    const score=(n:Node)=>{const values=[...reverse.get(n.id)!].flatMap(id=>positions.has(id)?[positions.get(id)!]:[]);return values.length?values.reduce((a,b)=>a+b,0)/values.length:n.layout.y;};
    return score(a)-score(b)||a.id.localeCompare(b.id);
  }); layer.forEach((n,i)=>positions.set(n.id,i));}
  const fixed=nodes.filter(n=>n.layout.locked||!movable.has(n.id)).map(n=>n.layout), occupied=[...fixed];
  const result: Record<string,Point>={};
  let x=Math.min(...nodes.map(n=>n.layout.x));const top=Math.min(...nodes.map(n=>n.layout.y));
  for(const layer of layers){let y=top;for(const n of layer){if(n.layout.locked||!movable.has(n.id))continue;
    const box={...n.layout,x,y};
    for(;;){const hits=occupied.filter(b=>box.x<b.x+b.width+32&&box.x+box.width+32>b.x&&box.y<b.y+b.height+32&&box.y+box.height+32>b.y);if(!hits.length)break;box.y=Math.max(...hits.map(b=>b.y+b.height+48));}
    if(Math.abs(box.x)>1e6||Math.abs(box.y)>1e6)throw new Error('整理结果超出画布范围，请缩小整理范围');
    result[n.id]={x:box.x,y:box.y};occupied.push(box);y=box.y+box.height+64;
  }x+=Math.max(...layer.map(n=>n.layout.width))+100;}
  return result;
}
