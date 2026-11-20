export const SHAPES = [
  ["free", "画笔"],
  ["line", "直线"],
  ["arrow", "箭头"],
  ["rect", "矩形"],
  ["ellipse", "椭圆"],
  ["triangle", "三角形"],
] as const;
export type Shape = (typeof SHAPES)[number][0];
export function shapePoints(
  shape: Shape,
  start: number[],
  end: number[],
): number[][] {
  const [x, y] = start,
    [a, b] = end;
  let points: number[][];
  if (shape === "rect")
    points = [
      [x, y],
      [a, y],
      [a, b],
      [x, b],
      [x, y],
    ];
  else if (shape === "triangle")
    points = [
      [(x + a) / 2, y],
      [a, b],
      [x, b],
      [(x + a) / 2, y],
    ];
  else if (shape === "ellipse")
    points = Array.from({ length: 65 }, (_, i) => {
      const angle = (i * Math.PI) / 32;
      return [
        (x + a) / 2 + ((a - x) / 2) * Math.cos(angle),
        (y + b) / 2 + ((b - y) / 2) * Math.sin(angle),
      ];
    });
  else if (shape === "arrow") {
    const angle = Math.atan2(b - y, a - x),
      size = Math.min(42, Math.hypot(a - x, b - y) * 0.3);
    const head = (offset: number) => [
      a - size * Math.cos(angle + offset),
      b - size * Math.sin(angle + offset),
    ];
    points = [start, end, head(Math.PI / 6), end, head(-Math.PI / 6)];
  } else points = [start, end];
  return points.map(([px, py]) => [
    Math.max(-1_000_000, Math.min(1_000_000, px)),
    Math.max(-1_000_000, Math.min(1_000_000, py)),
  ]);
}

export function strokeBounds(points: number[][]) {
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of points) { x = Math.min(x, p[0]); y = Math.min(y, p[1]); right = Math.max(right, p[0]); bottom = Math.max(bottom, p[1]); }
  return { x, y, width: right - x, height: bottom - y };
}
function pointSegment(p: number[], a: number[], b: number[]) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) : 0;
  return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);
}
export function strokeHit(points: number[][], a: number[], b: number[], radius: number) {
  const box = strokeBounds(points);
  if (Math.max(a[0],b[0])+radius < box.x || Math.min(a[0],b[0])-radius > box.x+box.width || Math.max(a[1],b[1])+radius < box.y || Math.min(a[1],b[1])-radius > box.y+box.height) return false;
  if (points.length === 1) return pointSegment(points[0],a,b) <= radius;
  const cross = (p: number[], q: number[], r: number[]) => (q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  for (let i=1;i<points.length;i++) {
    const c=points[i-1],d=points[i];
    if (Math.min(pointSegment(a,c,d),pointSegment(b,c,d),pointSegment(c,a,b),pointSegment(d,a,b)) <= radius) return true;
    if (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return true;
  }
  return false;
}
export function transformStroke(points: number[][], from: ReturnType<typeof strokeBounds>, to: ReturnType<typeof strokeBounds>) {
  return points.map(([x,y,...sample]) => [
    Math.max(-1e6,Math.min(1e6,to.x+(from.width ? (x-from.x)/from.width*to.width : from.height ? (y-from.y)/from.height*to.width : 0))),
    Math.max(-1e6,Math.min(1e6,to.y+(from.height ? (y-from.y)/from.height*to.height : from.width ? (x-from.x)/from.width*to.height : 0))),
    ...sample,
  ]);
}
