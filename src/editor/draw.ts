import type { Vec } from "../math/point";

export type Ctx = CanvasRenderingContext2D;

export function drawPoint(ctx: Ctx, p: Vec, { size = 18, color = "black" } = {}) {
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2);
  ctx.fill();
}

export function tracePath(ctx: Ctx, points: readonly Vec[], close = true) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  if (close) ctx.closePath();
}
