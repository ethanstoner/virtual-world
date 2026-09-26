import { Graph } from "../graph/graph";
import { Point } from "../math/point";
import { Segment } from "../math/segment";
import type { MarkingType } from "./marking";
import { World } from "./world";

/** A small town used on first launch: a 3x3 grid, a bypass curve and one of each marking. */
export function buildDemoWorld(): World {
  const S = 700;
  const grid: Point[][] = [];
  for (let r = 0; r < 3; r++) {
    grid.push([]);
    for (let c = 0; c < 3; c++) grid[r].push(new Point(c * S, r * S));
  }
  const points = grid.flat();
  const segments: Segment[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (c < 2) segments.push(new Segment(grid[r][c], grid[r][c + 1]));
      if (r < 2) segments.push(new Segment(grid[r][c], grid[r + 1][c]));
    }
  }
  // a bypass curving out east of the grid
  const curve = [new Point(2 * S + 450, 0.3 * S), new Point(2 * S + 600, S), new Point(2 * S + 450, 1.7 * S)];
  points.push(...curve);
  segments.push(new Segment(grid[0][2], curve[0]), new Segment(curve[0], curve[1]), new Segment(curve[1], curve[2]), new Segment(curve[2], grid[2][2]));

  const world = new World(new Graph(points, segments), undefined, 20231212);
  world.generateRoads();

  const c = S, near = 140, lane = 25;
  const place: [MarkingType, number, number][] = [
    ["light", c - near, c + lane],
    ["light", c + near, c - lane],
    ["light", c - lane, c - near],
    ["light", c + lane, c + near],
    ["stop", 2 * S - near, lane],
    ["yield", S - lane, 2 * S - near],
    ["crossing", S / 2, S],
    ["crossing", 1.5 * S, 2 * S],
    ["parking", S / 2, 2 * S - lane],
    ["start", 150, 2 * S + lane],
    ["target", 2 * S + 590, S],
  ];
  for (const [type, x, y] of place) {
    const m = world.snapMarking(type, new Point(x, y));
    if (m) world.markings.push(m);
  }
  return world;
}
