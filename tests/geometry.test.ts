import { describe, expect, it } from "vitest";
import { Envelope } from "../src/math/envelope";
import { Point, getIntersection, getNearestPoint } from "../src/math/point";
import { Polygon } from "../src/math/polygon";
import { Segment, getNearestSegment } from "../src/math/segment";

const P = (x: number, y: number) => new Point(x, y);
const square = (x: number, y: number, s: number) => new Polygon([P(x, y), P(x + s, y), P(x + s, y + s), P(x, y + s)]);

describe("getIntersection", () => {
  it("finds a crossing and its offset along the first segment", () => {
    const hit = getIntersection(P(0, 0), P(10, 0), P(5, -5), P(5, 5));
    expect(hit).toEqual({ x: 5, y: 0, offset: 0.5 });
  });

  it("returns null for parallel and for non-touching segments", () => {
    expect(getIntersection(P(0, 0), P(10, 0), P(0, 1), P(10, 1))).toBeNull();
    expect(getIntersection(P(0, 0), P(1, 0), P(5, -5), P(5, 5))).toBeNull();
  });
});

describe("Segment", () => {
  const s = new Segment(P(0, 0), P(10, 0));

  it("measures distance to the interior and past the ends", () => {
    expect(s.distanceToPoint(P(5, 3))).toBeCloseTo(3);
    expect(s.distanceToPoint(P(13, 4))).toBeCloseTo(5);
  });

  it("treats reversed endpoints as equal", () => {
    expect(s.equals(new Segment(P(10, 0), P(0, 0)))).toBe(true);
  });

  it("nearest helpers respect the threshold", () => {
    expect(getNearestSegment(P(5, 3), [s], 2)).toBeNull();
    expect(getNearestSegment(P(5, 1), [s], 2)).toBe(s);
    expect(getNearestPoint(P(1, 1), [P(0, 0), P(9, 9)], 5)).toEqual(P(0, 0));
  });
});

describe("Polygon", () => {
  it("contains interior points only", () => {
    const sq = square(0, 0, 10);
    expect(sq.containsPoint(P(5, 5))).toBe(true);
    expect(sq.containsPoint(P(15, 5))).toBe(false);
  });

  it("detects overlap, containment and separation", () => {
    expect(square(0, 0, 10).intersectsPolygon(square(5, 5, 10))).toBe(true);
    expect(square(0, 0, 10).intersectsPolygon(square(2, 2, 2))).toBe(true);
    expect(square(0, 0, 10).intersectsPolygon(square(20, 0, 10))).toBe(false);
  });

  it("union of two overlapping squares traces only the outer outline", () => {
    const segs = Polygon.union([square(0, 0, 10), square(5, 5, 10)]);
    const perimeter = segs.reduce((sum, s) => sum + s.length(), 0);
    // L-shaped outline: two 10x10 squares overlapping by 5x5
    expect(perimeter).toBeCloseTo(60);
    for (const s of segs) {
      const mid = P((s.p1.x + s.p2.x) / 2, (s.p1.y + s.p2.y) / 2);
      expect(square(0, 0, 10).containsPoint(mid) && square(5, 5, 10).containsPoint(mid)).toBe(false);
    }
  });

  it("union of disjoint polygons keeps every edge", () => {
    expect(Polygon.union([square(0, 0, 1), square(5, 5, 1)])).toHaveLength(8);
  });
});

describe("Envelope", () => {
  it("wraps its skeleton at half width", () => {
    const env = new Envelope(new Segment(P(0, 0), P(100, 0)), 40, 12);
    expect(env.polygon.containsPoint(P(50, 19))).toBe(true);
    expect(env.polygon.containsPoint(P(50, 21))).toBe(false);
    expect(env.polygon.containsPoint(P(-19, 0))).toBe(true);
    for (const p of env.polygon.points) {
      expect(new Segment(P(0, 0), P(100, 0)).distanceToPoint(p)).toBeCloseTo(20);
    }
  });
});
