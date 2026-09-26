import { Envelope } from "../math/envelope";
import { Point, add, angle, lerp2D, perpendicular, scale, translate } from "../math/point";
import type { Polygon } from "../math/polygon";
import { Segment } from "../math/segment";
import { type Ctx, drawPolygon, drawSegment } from "../render/draw";

export const MARKING_TYPES = ["stop", "yield", "crossing", "parking", "light", "start", "target"] as const;
export type MarkingType = (typeof MARKING_TYPES)[number];
export type LightState = "green" | "yellow" | "red" | "off";

export type MarkingData = { type: MarkingType; center: [number, number]; direction: [number, number] };

/** Which geometry a marking snaps to: lane guides (one side of the road) or road centre lines. */
export const SNAPS_TO: Record<MarkingType, "lane" | "road"> = {
  stop: "lane",
  yield: "lane",
  parking: "lane",
  light: "lane",
  start: "lane",
  crossing: "road",
  target: "road",
};

export function markingSize(type: MarkingType, roadWidth: number): { width: number; height: number } {
  const lane = roadWidth / 2;
  switch (type) {
    case "crossing":
      return { width: roadWidth, height: roadWidth / 2 };
    case "parking":
      return { width: lane, height: lane * 1.8 };
    case "light":
      return { width: lane, height: 18 };
    case "stop":
    case "yield":
      return { width: lane, height: lane * 0.6 };
    default:
      return { width: lane, height: lane };
  }
}

/**
 * A marking sits at `center`, oriented along `direction` (the travel direction of its lane).
 * Its footprint is a rectangle `width` across the lane and `height` along it.
 */
export class Marking {
  readonly support: Segment;
  readonly polygon: Polygon;
  readonly width: number;
  readonly height: number;
  state: LightState = "off";

  constructor(
    public readonly type: MarkingType,
    public readonly center: Point,
    public readonly direction: Point,
    roadWidth: number,
  ) {
    ({ width: this.width, height: this.height } = markingSize(type, roadWidth));
    const a = angle(direction);
    this.support = new Segment(translate(center, a, this.height / 2), translate(center, a, -this.height / 2));
    this.polygon = new Envelope(this.support, this.width, 1).polygon;
  }

  /** The edge across the lane at the front of the marking, which cars must not cross on red. */
  get frontEdge(): Segment {
    const half = scale(perpendicular(this.direction), this.width / 2);
    return new Segment(add(this.support.p1, half), add(this.support.p1, scale(half, -1)));
  }

  toJSON(): MarkingData {
    return { type: this.type, center: [this.center.x, this.center.y], direction: [this.direction.x, this.direction.y] };
  }

  static fromJSON(d: MarkingData, roadWidth: number): Marking {
    return new Marking(d.type, new Point(...d.center), new Point(...d.direction), roadWidth);
  }

  draw(ctx: Ctx) {
    switch (this.type) {
      case "stop":
        return this.drawStop(ctx);
      case "yield":
        return this.drawYield(ctx);
      case "crossing":
        return this.drawCrossing(ctx);
      case "parking":
        return this.drawParking(ctx);
      case "light":
        return this.drawLight(ctx);
      case "start":
        return this.drawStart(ctx);
      case "target":
        return this.drawTarget(ctx);
    }
  }

  private withFrame(ctx: Ctx, fn: () => void) {
    ctx.save();
    ctx.translate(this.center.x, this.center.y);
    ctx.rotate(angle(this.direction) + Math.PI / 2);
    fn();
    ctx.restore();
  }

  private label(ctx: Ctx, text: string, color = "white") {
    this.withFrame(ctx, () => {
      ctx.scale(1, 2.2);
      ctx.fillStyle = color;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `bold ${this.height * 0.3}px sans-serif`;
      ctx.fillText(text, 0, 1);
    });
  }

  private drawStop(ctx: Ctx) {
    drawSegment(ctx, this.frontEdge, { width: 5, color: "white" });
    this.label(ctx, "STOP");
  }

  private drawYield(ctx: Ctx) {
    const e = this.frontEdge;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const a = lerp2D(e.p1, e.p2, (i + 0.15) / n);
      const b = lerp2D(e.p1, e.p2, (i + 0.85) / n);
      const tip = add(lerp2D(e.p1, e.p2, (i + 0.5) / n), scale(this.direction, -this.height * 0.25));
      drawPolygon(ctx, [a, b, tip], { fill: "white", lineWidth: 0 });
    }
    this.label(ctx, "YIELD");
  }

  private drawCrossing(ctx: Ctx) {
    const across = perpendicular(this.direction);
    const stripes = 7;
    for (let i = 0; i < stripes; i++) {
      const t = (i + 0.5) / stripes - 0.5;
      const c = add(this.center, scale(across, t * this.width));
      const half = scale(this.direction, this.height / 2);
      drawSegment(ctx, new Segment(add(c, half), add(c, scale(half, -1))), { width: (this.width / stripes) * 0.55, color: "white" });
    }
  }

  private drawParking(ctx: Ctx) {
    const pts = this.polygon.points;
    drawSegment(ctx, new Segment(pts[1], pts[2]), { width: 4, color: "white" });
    drawSegment(ctx, new Segment(pts[3], pts[0]), { width: 4, color: "white" });
    this.label(ctx, "P");
  }

  private drawLight(ctx: Ctx) {
    const colors: Record<LightState, string> = { green: "#22c55e", yellow: "#facc15", red: "#ef4444", off: "#555" };
    drawSegment(ctx, this.frontEdge, { width: 4, color: this.state === "off" ? "#888" : colors[this.state] });
    const across = perpendicular(this.direction);
    const housing = new Envelope(new Segment(add(this.center, scale(across, 18)), add(this.center, scale(across, -18))), 16, 1);
    drawPolygon(ctx, housing.polygon, { fill: "#222", stroke: "#111", lineWidth: 2 });
    (["red", "yellow", "green"] as const).forEach((c, i) => {
      const p = add(this.center, scale(across, (i - 1) * 12));
      ctx.beginPath();
      ctx.fillStyle = this.state === c ? colors[c] : "#333";
      ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawStart(ctx: Ctx) {
    this.withFrame(ctx, () => {
      const w = this.width * 0.45, h = this.height * 0.8;
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.strokeStyle = "white";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-w / 2, -h / 2, w, h, 8);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -h / 2 - 14);
      ctx.lineTo(-10, -h / 2 - 2);
      ctx.lineTo(10, -h / 2 - 2);
      ctx.closePath();
      ctx.fillStyle = "white";
      ctx.fill();
    });
  }

  private drawTarget(ctx: Ctx) {
    const r = this.height / 2;
    ["#ef4444", "white", "#ef4444"].forEach((c, i) => {
      ctx.beginPath();
      ctx.fillStyle = c;
      ctx.arc(this.center.x, this.center.y, r * (1 - i * 0.3), 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

