import { type Vec, average, distance } from "../math/point";
import type { Polygon } from "../math/polygon";
import { type Ctx, drawPolygon } from "../render/draw";
import { lift } from "./perspective";

type Face = { points: Vec[]; depth: number; fill: string };

/**
 * A footprint polygon extruded to a box with a gabled roof. Footprints built from a
 * 4-point envelope have short edges 0-1 and 2-3, so the ridge runs between their midpoints.
 */
export class Building {
  constructor(
    public readonly base: Polygon,
    public readonly height = 200,
    public readonly roofHeight = 70,
  ) {}

  get center(): Vec {
    const pts = this.base.points;
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }

  drawFlat(ctx: Ctx) {
    drawPolygon(ctx, this.base, { fill: "#d9d4cc", stroke: "#8f8779", lineWidth: 6 });
  }

  draw(ctx: Ctx, view: Vec, cameraHeight: number) {
    const base = this.base.points;
    const tops = base.map((p) => lift(p, view, this.height, cameraHeight));
    const gabled = base.length === 4;
    const ridge = gabled
      ? [average(base[0], base[1]), average(base[2], base[3])].map((p) => ({
          ground: p,
          top: lift(p, view, this.height + this.roofHeight, cameraHeight),
        }))
      : [];

    const walls: Face[] = [];
    for (let i = 0; i < base.length; i++) {
      const j = (i + 1) % base.length;
      const pts: Vec[] = [base[i], base[j], tops[j]];
      if (gabled && i === 0) pts.push(ridge[0].top);
      if (gabled && i === 2) pts.push(ridge[1].top);
      pts.push(tops[i]);
      walls.push({ points: pts, depth: distance(view, average(base[i], base[j])), fill: "#f2efe9" });
    }
    walls.sort((a, b) => b.depth - a.depth);
    for (const w of walls) drawPolygon(ctx, w.points, { fill: w.fill, stroke: "#a39a8c", lineWidth: 2, join: "round" });

    if (gabled) {
      const roofs: Face[] = [
        { points: [tops[1], tops[2], ridge[1].top, ridge[0].top], depth: distance(view, average(base[1], base[2])), fill: "#c0392b" },
        { points: [tops[3], tops[0], ridge[0].top, ridge[1].top], depth: distance(view, average(base[3], base[0])), fill: "#d0493b" },
      ];
      roofs.sort((a, b) => b.depth - a.depth);
      for (const r of roofs) drawPolygon(ctx, r.points, { fill: r.fill, stroke: "#8e2a20", lineWidth: 3, join: "round" });
    } else {
      drawPolygon(ctx, tops, { fill: "#c9c3b8", stroke: "#8f8779", lineWidth: 2 });
    }
  }
}
