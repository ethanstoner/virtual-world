import { describe, expect, it } from "vitest";
import { Graph } from "../src/graph/graph";
import { Point } from "../src/math/point";
import { Segment } from "../src/math/segment";

function triangle() {
  const a = new Point(0, 0), b = new Point(100, 0), c = new Point(0, 100);
  const g = new Graph([a, b, c], [new Segment(a, b), new Segment(b, c, true), new Segment(c, a)]);
  return { g, a, b, c };
}

describe("Graph", () => {
  it("rejects duplicate points and duplicate or degenerate segments", () => {
    const { g, a, b } = triangle();
    expect(g.addPoint(new Point(0, 0))).toBe(false);
    expect(g.addSegment(new Segment(b, a))).toBe(false);
    expect(g.addSegment(new Segment(a, a))).toBe(false);
    expect(g.segments).toHaveLength(3);
  });

  it("removing a point removes its segments", () => {
    const { g, a } = triangle();
    g.removePoint(a);
    expect(g.points).toHaveLength(2);
    expect(g.segments).toHaveLength(1);
  });

  it("neighbours respect one-way segments", () => {
    const { g, a, b, c } = triangle();
    expect(g.neighbours(b)).toEqual(expect.arrayContaining([a, c]));
    expect(g.neighbours(c)).toEqual([a]);
  });

  it("round-trips through JSON with shared point identity", () => {
    const { g } = triangle();
    const back = Graph.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    expect(back.toJSON()).toEqual(g.toJSON());
    expect(back.segments[0].p2).toBe(back.segments[1].p1);
    expect(back.segments[1].oneWay).toBe(true);
  });

  it("bumps version on every mutation", () => {
    const { g, a } = triangle();
    const v = g.version;
    g.addPoint(new Point(5, 5));
    g.removePoint(a);
    expect(g.version).toBeGreaterThan(v + 1);
  });
});
