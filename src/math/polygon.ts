import { Point, type Vec, average, getIntersection } from "./point";
import { Segment } from "./segment";

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

export function boundsOf(points: readonly Vec[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function boundsOverlap(a: Bounds, b: Bounds, pad = 0): boolean {
  return a.minX - pad <= b.maxX && b.minX - pad <= a.maxX && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY;
}

export class Polygon {
  readonly segments: Segment[];
  readonly bounds: Bounds;

  constructor(public readonly points: Point[]) {
    this.segments = points.map((p, i) => new Segment(p, points[(i + 1) % points.length]));
    this.bounds = boundsOf(points);
  }

  /** Even-odd ray cast. Points exactly on an edge may land either way. */
  containsPoint(p: Vec): boolean {
    const b = this.bounds;
    if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) return false;
    let inside = false;
    const pts = this.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i], c = pts[j];
      if (a.y > p.y !== c.y > p.y && p.x < ((c.x - a.x) * (p.y - a.y)) / (c.y - a.y) + a.x) {
        inside = !inside;
      }
    }
    return inside;
  }

  containsSegment(seg: Segment): boolean {
    return this.containsPoint(average(seg.p1, seg.p2));
  }

  intersectsPolygon(other: Polygon): boolean {
    if (!boundsOverlap(this.bounds, other.bounds)) return false;
    for (const s1 of this.segments) {
      for (const s2 of other.segments) {
        if (getIntersection(s1.p1, s1.p2, s2.p1, s2.p2)) return true;
      }
    }
    return this.containsPoint(other.points[0]) || other.containsPoint(this.points[0]);
  }

  distanceToPoint(p: Vec): number {
    return Math.min(...this.segments.map((s) => s.distanceToPoint(p)));
  }

  distanceToPolygon(other: Polygon): number {
    return Math.min(...this.points.map((p) => other.distanceToPoint(p)));
  }

  /**
   * Outline of the union of `polygons`, as loose segments. Each edge is split where it
   * crosses an edge of another polygon, and pieces that fall inside another polygon are dropped.
   */
  static union(polygons: readonly Polygon[]): Segment[] {
    const kept: Segment[] = [];
    for (let i = 0; i < polygons.length; i++) {
      const poly = polygons[i];
      const neighbours = polygons.filter((o, j) => j !== i && boundsOverlap(poly.bounds, o.bounds, 1e-6));
      for (const edge of poly.segments) {
        const cuts: { offset: number; point: Point }[] = [];
        for (const other of neighbours) {
          for (const e2 of other.segments) {
            const hit = getIntersection(edge.p1, edge.p2, e2.p1, e2.p2);
            if (hit && hit.offset > 1e-9 && hit.offset < 1 - 1e-9) {
              cuts.push({ offset: hit.offset, point: new Point(hit.x, hit.y) });
            }
          }
        }
        cuts.sort((a, b) => a.offset - b.offset);
        const stops = [edge.p1, ...cuts.map((c) => c.point), edge.p2];
        for (let k = 0; k < stops.length - 1; k++) {
          const piece = new Segment(stops[k], stops[k + 1]);
          if (piece.length() < 1e-9) continue;
          const mid = average(piece.p1, piece.p2);
          if (!neighbours.some((o) => o.containsPoint(mid))) kept.push(piece);
        }
      }
    }
    return kept;
  }
}
