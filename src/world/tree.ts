import { Point, type Vec, lerp, translate } from "../math/point";
import { Polygon } from "../math/polygon";
import { createRng } from "../math/random";
import { type Ctx, drawPolygon } from "../render/draw";
import { lift } from "./perspective";

const LEVELS = 7;

export class Tree {
  /** Irregular ground outline, used for collision and for the flat view. */
  readonly base: Polygon;
  private readonly wobble: number[];

  constructor(
    public readonly center: Point,
    public readonly size: number,
    public readonly height = 200,
    seed = 1,
  ) {
    const rand = createRng(seed);
    this.wobble = Array.from({ length: 16 }, () => lerp(0.75, 1.1, rand()));
    this.base = new Polygon(this.outline(center, size / 2));
  }

  private outline(c: Vec, r: number): Point[] {
    return this.wobble.map((w, i) => translate(c, (i / this.wobble.length) * Math.PI * 2, r * w));
  }

  drawFlat(ctx: Ctx) {
    drawPolygon(ctx, this.base, { fill: "#2f7d32", stroke: "#1f5a22", lineWidth: 3 });
  }

  draw(ctx: Ctx, view: Vec, cameraHeight: number) {
    for (let i = 0; i < LEVELS; i++) {
      const t = i / (LEVELS - 1);
      const c = lift(this.center, view, t * this.height, cameraHeight);
      const r = (this.size / 2) * lerp(1, 0.2, t);
      const g = Math.round(lerp(70, 190, t));
      drawPolygon(ctx, this.outline(c, r), { fill: `rgb(${Math.round(g * 0.3)},${g},${Math.round(g * 0.35)})`, lineWidth: 0 });
    }
  }
}
