import { Point, type Vec, add, distance, dot, magnitude, normalize, scale, subtract } from "./point";

export class Segment {
  constructor(
    public p1: Point,
    public p2: Point,
    public oneWay = false,
  ) {}

  length(): number {
    return distance(this.p1, this.p2);
  }

  directionVector(): Point {
    return normalize(subtract(this.p2, this.p1));
  }

  /** Undirected equality: same endpoints in either order. */
  equals(seg: Segment): boolean {
    return this.includes(seg.p1) && this.includes(seg.p2);
  }

  includes(p: Point): boolean {
    return this.p1.equals(p) || this.p2.equals(p);
  }

  /** Projection of `p` onto the infinite line, with `offset` in [0,1] across the segment. */
  projectPoint(p: Vec): { point: Point; offset: number } {
    const a = subtract(p, this.p1);
    const b = subtract(this.p2, this.p1);
    const len = magnitude(b);
    if (len === 0) return { point: this.p1.clone(), offset: 0 };
    const along = dot(a, normalize(b));
    return { point: add(this.p1, scale(normalize(b), along)), offset: along / len };
  }

  distanceToPoint(p: Vec): number {
    const { point, offset } = this.projectPoint(p);
    if (offset > 0 && offset < 1) return distance(p, point);
    return Math.min(distance(p, this.p1), distance(p, this.p2));
  }
}

export function getNearestSegment(loc: Vec, segments: readonly Segment[], threshold = Infinity): Segment | null {
  let best: Segment | null = null;
  let bestDist = threshold;
  for (const s of segments) {
    const d = s.distanceToPoint(loc);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}
