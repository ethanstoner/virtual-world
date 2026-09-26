export class Point {
  constructor(
    public x: number,
    public y: number,
  ) {}

  equals(other: Point): boolean {
    return this.x === other.x && this.y === other.y;
  }

  clone(): Point {
    return new Point(this.x, this.y);
  }
}

export type Vec = { x: number; y: number };

export const add = (a: Vec, b: Vec) => new Point(a.x + b.x, a.y + b.y);
export const subtract = (a: Vec, b: Vec) => new Point(a.x - b.x, a.y - b.y);
export const scale = (a: Vec, s: number) => new Point(a.x * s, a.y * s);
export const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const magnitude = (a: Vec) => Math.hypot(a.x, a.y);
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const average = (a: Vec, b: Vec) => new Point((a.x + b.x) / 2, (a.y + b.y) / 2);
export const angle = (a: Vec) => Math.atan2(a.y, a.x);
export const perpendicular = (a: Vec) => new Point(-a.y, a.x);

export function normalize(a: Vec): Point {
  const m = magnitude(a);
  return m === 0 ? new Point(0, 0) : scale(a, 1 / m);
}

export function translate(from: Vec, theta: number, offset: number): Point {
  return new Point(from.x + Math.cos(theta) * offset, from.y + Math.sin(theta) * offset);
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, v: number) => (v - a) / (b - a);
export const lerp2D = (a: Vec, b: Vec, t: number) => new Point(lerp(a.x, b.x, t), lerp(a.y, b.y, t));

export type Intersection = { x: number; y: number; offset: number };

/** Intersection of segments AB and CD; `offset` is the parameter along AB. */
export function getIntersection(A: Vec, B: Vec, C: Vec, D: Vec): Intersection | null {
  const tTop = (D.x - C.x) * (A.y - C.y) - (D.y - C.y) * (A.x - C.x);
  const uTop = (C.y - A.y) * (A.x - B.x) - (C.x - A.x) * (A.y - B.y);
  const bottom = (D.y - C.y) * (B.x - A.x) - (D.x - C.x) * (B.y - A.y);
  const eps = 1e-9;
  if (Math.abs(bottom) < eps) return null;
  const t = tTop / bottom;
  const u = uTop / bottom;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: lerp(A.x, B.x, t), y: lerp(A.y, B.y, t), offset: t };
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

export function getRandomColor(rand: () => number = Math.random): string {
  const hue = 290 + rand() * 260;
  return `hsl(${hue}, 100%, 60%)`;
}
