export class Point {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

export type Vec = { x: number; y: number };

export const add = (a: Vec, b: Vec) => new Point(a.x + b.x, a.y + b.y);
export const subtract = (a: Vec, b: Vec) => new Point(a.x - b.x, a.y - b.y);
export const scale = (a: Vec, s: number) => new Point(a.x * s, a.y * s);
export const magnitude = (a: Vec) => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const perpendicular = (a: Vec) => new Point(-a.y, a.x);

export function normalize(a: Vec): Point {
  const m = magnitude(a);
  return m === 0 ? new Point(0, 0) : scale(a, 1 / m);
}

export function getNearestPoint<T extends Vec>(loc: Vec, points: readonly T[], threshold = Infinity): T | null {
  let best: T | null = null;
  let bestDist = threshold;
  for (const p of points) {
    const d = distance(p, loc);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}
