import { Point, type Vec, add, subtract } from "../math/point";

/**
 * Maps screen pixels to world units. `offset` is the world point shown at the canvas centre,
 * negated, so panning right moves the offset left.
 */
export class Viewport {
  zoom = 1;
  offset = new Point(0, 0);
  minZoom = 0.05;
  maxZoom = 8;

  private drag: { start: Point; startOffset: Point } | null = null;

  constructor(public readonly canvas: HTMLCanvasElement) {
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener("mousedown", (e) => this.onDown(e));
    window.addEventListener("mousemove", (e) => this.onMove(e));
    window.addEventListener("mouseup", () => (this.drag = null));
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  get center(): Point {
    return new Point(this.canvas.width / 2, this.canvas.height / 2);
  }

  get isPanning(): boolean {
    return this.drag !== null;
  }

  screenToWorld(sx: number, sy: number): Point {
    const c = this.center;
    return new Point((sx - c.x) / this.zoom - this.offset.x, (sy - c.y) / this.zoom - this.offset.y);
  }

  mouse(e: MouseEvent): Point {
    return this.atClient(e.clientX, e.clientY);
  }

  /** World point under a client (CSS pixel) position. */
  atClient(clientX: number, clientY: number): Point {
    const r = this.canvas.getBoundingClientRect();
    const sx = ((clientX - r.left) * this.canvas.width) / r.width;
    const sy = ((clientY - r.top) * this.canvas.height) / r.height;
    return this.screenToWorld(sx, sy);
  }

  /** Move the view by a drag of (dx, dy) client pixels. */
  panByClient(dx: number, dy: number): void {
    const r = this.canvas.getBoundingClientRect();
    const k = this.canvas.width / r.width / this.zoom;
    this.offset = new Point(this.offset.x + dx * k, this.offset.y + dy * k);
  }

  /** Zoom by `factor`, keeping the world point under the client position fixed. */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.atClient(clientX, clientY);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    this.offset = add(this.offset, subtract(this.atClient(clientX, clientY), before));
  }

  /** Clears and applies the world transform. */
  begin(ctx: CanvasRenderingContext2D, background = "#0b0d11"): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const c = this.center;
    ctx.setTransform(this.zoom, 0, 0, this.zoom, c.x + this.offset.x * this.zoom, c.y + this.offset.y * this.zoom);
  }

  lookAt(p: Vec): void {
    this.offset = new Point(-p.x, -p.y);
  }

  /** Zoom so the rectangle fits the canvas with a margin. */
  fit(minX: number, minY: number, maxX: number, maxY: number, margin = 0.9): void {
    const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
    this.zoom = clamp(Math.min(this.canvas.width / w, this.canvas.height / h) * margin, this.minZoom, this.maxZoom);
    this.lookAt(new Point((minX + maxX) / 2, (minY + maxY) / 2));
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    this.zoomAt(e.clientX, e.clientY, Math.exp(-Math.sign(e.deltaY) * 0.12));
  }

  private onDown(e: MouseEvent) {
    const panButton = e.button === 1 || (e.button === 0 && (e.shiftKey || spaceHeld));
    if (!panButton) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.drag = { start: new Point(e.clientX, e.clientY), startOffset: new Point(this.offset.x, this.offset.y) };
  }

  private onMove(e: MouseEvent) {
    if (!this.drag) return;
    const r = this.canvas.getBoundingClientRect();
    const k = this.canvas.width / r.width / this.zoom;
    const dx = (e.clientX - this.drag.start.x) * k;
    const dy = (e.clientY - this.drag.start.y) * k;
    this.offset = new Point(this.drag.startOffset.x + dx, this.drag.startOffset.y + dy);
  }
}

let spaceHeld = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") spaceHeld = true;
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space") spaceHeld = false;
});

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
