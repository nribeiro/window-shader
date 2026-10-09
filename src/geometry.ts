export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];
export const initialQuad = (): Quad => [
  { x: 0.28, y: 0.73 },
  { x: 0.73, y: 0.68 },
  { x: 0.68, y: 0.27 },
  { x: 0.32, y: 0.3 },
];
export const cross = (a: Point, b: Point, c: Point) =>
  (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
export function validQuad(points: Point[], minArea = 0.003): points is Quad {
  if (
    points.length !== 4 ||
    points.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return false;
  const turns = points.map((p, i) =>
    cross(p, points[(i + 1) % 4], points[(i + 2) % 4]),
  );
  if (!turns.every((v) => v > 1e-6) && !turns.every((v) => v < -1e-6))
    return false;
  const area =
    Math.abs(
      points.reduce(
        (s, p, i) =>
          s + p.x * points[(i + 1) % 4].y - p.y * points[(i + 1) % 4].x,
        0,
      ),
    ) / 2;
  return area >= minArea;
}
// Cover crop in source UV. Shared by shader sampling and landmark projection.
export function coverScale(
  vw: number,
  vh: number,
  width: number,
  height: number,
): Point {
  const sourceAspect = vw / vh,
    displayAspect = width / height;
  return sourceAspect > displayAspect
    ? { x: displayAspect / sourceAspect, y: 1 }
    : { x: 1, y: sourceAspect / displayAspect };
}
export function landmarkToUV(p: Point, crop: Point): Point {
  return {
    x: (1 - p.x - 0.5) / crop.x + 0.5,
    y: (1 - p.y - 0.5) / crop.y + 0.5,
  };
}
export function uvToSource(p: Point, crop: Point): Point {
  return {
    x: 1 - ((p.x - 0.5) * crop.x + 0.5),
    y: 1 - ((p.y - 0.5) * crop.y + 0.5),
  };
}
export const pointerToUV = (
  x: number,
  y: number,
  rect: { left: number; top: number; width: number; height: number },
): Point => ({
  x: Math.max(0, Math.min(1, (x - rect.left) / rect.width)),
  y: 1 - Math.max(0, Math.min(1, (y - rect.top) / rect.height)),
});
export function smoothQuad(previous: Quad, next: Quad, dt: number): Quad {
  const speed =
    Math.max(
      ...next.map((p, i) =>
        Math.hypot(p.x - previous[i].x, p.y - previous[i].y),
      ),
    ) / Math.max(dt, 0.001);
  const alpha = 1 - Math.exp(-Math.max(0, dt) / (0.065 / (1 + speed * 3)));
  return next.map((p, i) => ({
    x: previous[i].x + (p.x - previous[i].x) * alpha,
    y: previous[i].y + (p.y - previous[i].y) * alpha,
  })) as Quad;
}
export const fade = (value: number, visible: boolean, dt: number) => {
  const next =
    value +
    ((visible ? 1 : 0) - value) * (1 - Math.exp(-Math.max(0, dt) / 0.09));
  return !visible && next < 0.005 ? 0 : next;
};
