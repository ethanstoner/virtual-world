import { Point } from "../math/point";
import { Segment } from "../math/segment";

export type GraphData = {
  points: [number, number][];
  segments: [number, number, boolean?][];
};

export class Graph {
  constructor(
    public points: Point[] = [],
    public segments: Segment[] = [],
  ) {}

  /** Bumped on every mutation so derived geometry knows when to regenerate. */
  version = 0;

  /** Call after moving a point in place. */
  touch(): void {
    this.version++;
  }

  containsPoint(p: Point): boolean {
    return this.points.some((q) => q.equals(p));
  }

  addPoint(p: Point): boolean {
    if (this.containsPoint(p)) return false;
    this.points.push(p);
    this.version++;
    return true;
  }

  removePoint(p: Point): void {
    for (const s of this.getSegmentsWithPoint(p)) this.removeSegment(s);
    this.points = this.points.filter((q) => q !== p);
    this.version++;
  }

  containsSegment(seg: Segment): boolean {
    return this.segments.some((s) => s.equals(seg));
  }

  addSegment(seg: Segment): boolean {
    if (seg.p1.equals(seg.p2) || this.containsSegment(seg)) return false;
    this.segments.push(seg);
    this.version++;
    return true;
  }

  removeSegment(seg: Segment): void {
    this.segments = this.segments.filter((s) => s !== seg);
    this.version++;
  }

  getSegmentsWithPoint(p: Point): Segment[] {
    return this.segments.filter((s) => s.includes(p));
  }

  /** Neighbours reachable from `p`, respecting one-way segments (p1 -> p2). */
  neighbours(p: Point): Point[] {
    const out: Point[] = [];
    for (const s of this.segments) {
      if (s.p1 === p) out.push(s.p2);
      else if (s.p2 === p && !s.oneWay) out.push(s.p1);
    }
    return out;
  }

  /** Replace contents in place (keeps references held by the editor valid). */
  load(other: Graph): void {
    this.points = other.points;
    this.segments = other.segments;
    this.version++;
  }

  clear(): void {
    this.points = [];
    this.segments = [];
    this.version++;
  }

  toJSON(): GraphData {
    const index = new Map(this.points.map((p, i) => [p, i]));
    return {
      points: this.points.map((p) => [p.x, p.y]),
      segments: this.segments.map((s) => {
        const row: [number, number, boolean?] = [index.get(s.p1)!, index.get(s.p2)!];
        if (s.oneWay) row.push(true);
        return row;
      }),
    };
  }

  static fromJSON(data: GraphData): Graph {
    const points = data.points.map(([x, y]) => new Point(x, y));
    const segments = data.segments.map(([a, b, oneWay]) => new Segment(points[a], points[b], !!oneWay));
    return new Graph(points, segments);
  }
}
