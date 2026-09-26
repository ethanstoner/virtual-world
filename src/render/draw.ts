import type { Vec } from "../math/point";
import type { Polygon } from "../math/polygon";
import type { Segment } from "../math/segment";

export type Ctx = CanvasRenderingContext2D;

export type StrokeStyle = {
  width?: number;
  color?: string;
  dash?: number[];
  cap?: CanvasLineCap;
};

export function drawPoint(ctx: Ctx, p: Vec, { size = 18, color = "black", outline = false, fill = false } = {}) {
  const r = size / 2;
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fill();
  if (outline) {
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#ffe066";
    ctx.arc(p.x, p.y, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (fill) {
    ctx.beginPath();
    ctx.fillStyle = "#ffe066";
    ctx.arc(p.x, p.y, r * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawSegment(ctx: Ctx, s: { p1: Vec; p2: Vec }, { width = 2, color = "black", dash = [], cap = "butt" }: StrokeStyle = {}) {
  ctx.beginPath();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = cap;
  ctx.setLineDash(dash);
  ctx.moveTo(s.p1.x, s.p1.y);
  ctx.lineTo(s.p2.x, s.p2.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

export function tracePath(ctx: Ctx, points: readonly Vec[], close = true) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (close) ctx.closePath();
}

export function drawPolygon(
  ctx: Ctx,
  poly: Polygon | readonly Vec[],
  { stroke = "#3b82f6", lineWidth = 2, fill = "rgba(59,130,246,0.3)", join = "miter" as CanvasLineJoin } = {},
) {
  const pts = Array.isArray(poly) ? poly : (poly as Polygon).points;
  if (pts.length === 0) return;
  tracePath(ctx, pts);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lineWidth > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = join;
    ctx.stroke();
  }
}

export function drawSegments(ctx: Ctx, segs: readonly Segment[], style: StrokeStyle) {
  if (segs.length === 0) return;
  ctx.beginPath();
  ctx.lineWidth = style.width ?? 2;
  ctx.strokeStyle = style.color ?? "black";
  ctx.lineCap = style.cap ?? "round";
  ctx.setLineDash(style.dash ?? []);
  for (const s of segs) {
    ctx.moveTo(s.p1.x, s.p1.y);
    ctx.lineTo(s.p2.x, s.p2.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

export function drawArrow(ctx: Ctx, from: Vec, to: Vec, { color = "white", size = 12 } = {}) {
  const a = Math.atan2(to.y - from.y, to.x - from.x);
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.moveTo(mid.x + Math.cos(a) * size, mid.y + Math.sin(a) * size);
  ctx.lineTo(mid.x + Math.cos(a + 2.5) * size, mid.y + Math.sin(a + 2.5) * size);
  ctx.lineTo(mid.x + Math.cos(a - 2.5) * size, mid.y + Math.sin(a - 2.5) * size);
  ctx.closePath();
  ctx.fill();
}
