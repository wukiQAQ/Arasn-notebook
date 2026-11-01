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
    Math.max(0, Math.min(1600, px)),
    Math.max(0, Math.min(1000, py)),
  ]);
}
