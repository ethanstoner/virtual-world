import { Point, getNearestPoint } from "../math/point";
import { Segment, getNearestSegment } from "../math/segment";
import { type Ctx, drawPoint, drawSegment } from "../render/draw";
import type { Marking, MarkingType } from "../world/marking";
import type { World } from "../world/world";
import type { History } from "./history";
import type { Viewport } from "./viewport";

export type ToolContext = { world: World; history: History; viewport: Viewport };

export interface Tool {
  readonly id: string;
  onDown(e: MouseEvent, at: Point): void;
  onMove(at: Point): void;
  onUp(): void;
  onKey?(e: KeyboardEvent): boolean;
  draw(ctx: Ctx): void;
  reset(): void;
}

/** Point-and-segment editing, the core of the world editor. */
export class GraphTool implements Tool {
  readonly id = "graph";
  hovered: Point | null = null;
  hoveredSegment: Segment | null = null;
  selected: Point | null = null;
  private dragging = false;
  private mouse: Point | null = null;

  constructor(private readonly c: ToolContext) {}

  private get graph() {
    return this.c.world.graph;
  }

  private get reach() {
    return 14 / this.c.viewport.zoom;
  }

  reset(): void {
    this.hovered = this.hoveredSegment = this.selected = null;
    this.dragging = false;
  }

  onMove(at: Point): void {
    this.mouse = at;
    if (this.dragging && this.selected) {
      this.selected.x = at.x;
      this.selected.y = at.y;
      this.graph.touch();
      return;
    }
    this.hovered = getNearestPoint(at, this.graph.points, this.reach);
    this.hoveredSegment = this.hovered ? null : getNearestSegment(at, this.graph.segments, this.reach * 0.7);
  }

  onDown(e: MouseEvent, at: Point): void {
    if (e.button === 2) return this.onRightClick();
    if (e.button !== 0) return;
    const { history } = this.c;
    history.begin();
    if (this.hovered) {
      if (this.selected && this.selected !== this.hovered) this.graph.addSegment(new Segment(this.selected, this.hovered));
      this.selected = this.hovered;
      this.dragging = true;
      return;
    }
    const p = new Point(at.x, at.y);
    if (this.hoveredSegment) {
      // clicking a road splits it, so new branches can start mid-segment
      const s = this.hoveredSegment;
      const onRoad = s.projectPoint(at).point;
      p.x = onRoad.x;
      p.y = onRoad.y;
      this.graph.removeSegment(s);
      this.graph.addPoint(p);
      this.graph.addSegment(new Segment(s.p1, p, s.oneWay));
      this.graph.addSegment(new Segment(p, s.p2, s.oneWay));
      this.hoveredSegment = null;
    } else {
      this.graph.addPoint(p);
    }
    if (this.selected) this.graph.addSegment(new Segment(this.selected, p));
    this.selected = this.hovered = p;
    this.dragging = true;
  }

  private onRightClick(): void {
    if (this.selected) {
      this.selected = null;
      return;
    }
    const { history } = this.c;
    if (this.hovered) {
      const p = this.hovered;
      history.record(() => this.graph.removePoint(p));
      this.hovered = null;
    } else if (this.hoveredSegment) {
      const s = this.hoveredSegment;
      history.record(() => this.graph.removeSegment(s));
      this.hoveredSegment = null;
    }
  }

  onUp(): void {
    this.dragging = false;
    this.c.history.end();
  }

  onKey(e: KeyboardEvent): boolean {
    const s = this.hoveredSegment;
    const key = e.key.toLowerCase();
    if (s && (key === "o" || key === "r")) {
      this.c.history.record(() => {
        if (key === "o") s.oneWay = !s.oneWay;
        else [s.p1, s.p2] = [s.p2, s.p1];
        this.graph.touch();
      });
      return true;
    }
    if (e.key === "Escape") {
      this.selected = null;
      return true;
    }
    return false;
  }

  draw(ctx: Ctx): void {
    const z = this.c.viewport.zoom;
    const px = (n: number) => n / z;
    for (const s of this.graph.segments) drawSegment(ctx, s, { width: px(2), color: "rgba(20,20,40,0.55)" });
    if (this.hoveredSegment) drawSegment(ctx, this.hoveredSegment, { width: px(6), color: "rgba(255,224,102,0.8)", cap: "round" });
    for (const p of this.graph.points) drawPoint(ctx, p, { size: px(12), color: "rgba(20,20,40,0.75)" });
    if (this.hovered) drawPoint(ctx, this.hovered, { size: px(12), color: "#1e293b", fill: true });
    if (this.selected) {
      const target = this.hovered ?? this.mouse;
      if (target && !this.dragging) drawSegment(ctx, new Segment(this.selected, target), { width: px(2), color: "#ffe066", dash: [px(6), px(6)] });
      drawPoint(ctx, this.selected, { size: px(12), color: "#1e293b", outline: true });
    }
  }
}

/** Places or removes one kind of road marking. */
export class MarkingTool implements Tool {
  readonly id: string;
  private intent: Marking | null = null;
  private hoveredMarking: Marking | null = null;

  constructor(
    private readonly c: ToolContext,
    readonly type: MarkingType,
  ) {
    this.id = type;
  }

  reset(): void {
    this.intent = this.hoveredMarking = null;
  }

  onMove(at: Point): void {
    const { world } = this.c;
    this.hoveredMarking = [...world.markings].reverse().find((m) => m.polygon.containsPoint(at)) ?? null;
    this.intent = world.snapMarking(this.type, at);
  }

  onDown(e: MouseEvent): void {
    const { world, history } = this.c;
    if (e.button === 2) {
      const m = this.hoveredMarking;
      if (m) history.record(() => (world.markings = world.markings.filter((x) => x !== m)));
      this.hoveredMarking = null;
      return;
    }
    const m = this.intent;
    if (e.button !== 0 || !m) return;
    history.record(() => {
      // only one destination per world
      if (m.type === "target") world.markings = world.markings.filter((x) => x.type !== "target");
      world.markings.push(m);
    });
    this.intent = null;
  }

  onUp(): void {}

  draw(ctx: Ctx): void {
    if (this.hoveredMarking) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = "#ef4444";
      ctx.beginPath();
      const pts = this.hoveredMarking.polygon.points;
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts) ctx.lineTo(p.x, p.y);
      ctx.fill();
      ctx.restore();
    }
    if (this.intent) {
      ctx.save();
      ctx.globalAlpha = 0.65;
      this.intent.draw(ctx);
      ctx.restore();
    }
  }
}
