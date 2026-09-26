import { Graph, type GraphData } from "../graph/graph";
import { Envelope } from "../math/envelope";
import { Point, type Vec, add, distance, dot, lerp, perpendicular, scale, subtract } from "../math/point";
import { Polygon, boundsOf } from "../math/polygon";
import { createRng, randomSeed } from "../math/random";
import { Segment, getNearestSegment } from "../math/segment";
import { type Ctx, drawArrow, drawPolygon, drawSegments } from "../render/draw";
import { Building } from "./building";
import { Marking, type MarkingData, type MarkingType, SNAPS_TO } from "./marking";
import { Tree } from "./tree";

export type WorldSettings = {
  roadWidth: number;
  roadRoundness: number;
  buildingWidth: number;
  buildingMinLength: number;
  spacing: number;
  treeSize: number;
  treeDensity: number;
};

export const DEFAULT_SETTINGS: WorldSettings = {
  roadWidth: 100,
  roadRoundness: 10,
  buildingWidth: 150,
  buildingMinLength: 150,
  spacing: 50,
  treeSize: 160,
  treeDensity: 1,
};

export type WorldData = {
  version: 1;
  seed: number;
  settings: WorldSettings;
  graph: GraphData;
  markings: MarkingData[];
  view?: { zoom: number; offset: [number, number] };
};

export type DrawOptions = {
  view: Vec;
  cameraHeight: number;
  /** Only draw scenery within this distance of the view point. */
  renderRadius?: number;
  flat?: boolean;
  /** Drawn after roads and markings, before scenery, so buildings occlude it. */
  between?: (ctx: Ctx) => void;
  hideStart?: boolean;
};

const LIGHT_GREEN = 4, LIGHT_YELLOW = 1.2;

export class World {
  envelopes: Envelope[] = [];
  roadBorders: Segment[] = [];
  laneGuides: Segment[] = [];
  buildings: Building[] = [];
  trees: Tree[] = [];
  markings: Marking[] = [];

  /** graph.version the roads / scenery were last generated from. */
  private roadsVersion = -1;
  private sceneryVersion = -1;
  private lightClock = 0;

  constructor(
    public graph = new Graph(),
    public settings: WorldSettings = { ...DEFAULT_SETTINGS },
    public seed = randomSeed(),
  ) {}

  get roadsStale() {
    return this.roadsVersion !== this.graph.version;
  }

  get sceneryStale() {
    return this.sceneryVersion !== this.graph.version;
  }

  generateRoads(): void {
    const { roadWidth, roadRoundness } = this.settings;
    this.envelopes = this.graph.segments.map((s) => new Envelope(s, roadWidth, roadRoundness));
    this.roadBorders = Polygon.union(this.envelopes.map((e) => e.polygon));
    this.laneGuides = Polygon.union(this.graph.segments.map((s) => new Envelope(s, roadWidth / 2, roadRoundness).polygon));
    this.roadsVersion = this.graph.version;
  }

  generate(): void {
    if (this.roadsStale) this.generateRoads();
    this.buildings = this.generateBuildings();
    this.trees = this.generateTrees();
    this.pruneMarkings();
    this.sceneryVersion = this.graph.version;
  }

  private generateBuildings(): Building[] {
    const { roadWidth, roadRoundness, buildingWidth, buildingMinLength, spacing } = this.settings;
    const bands = this.graph.segments.map((s) => new Envelope(s, roadWidth + buildingWidth + spacing * 2, roadRoundness).polygon);
    const guides = Polygon.union(bands).filter((s) => s.length() >= buildingMinLength);

    // Cut each guide into equal lots no shorter than buildingMinLength, with `spacing` gaps.
    const lots: Segment[] = [];
    for (const g of guides) {
      const len = g.length();
      const count = Math.max(1, Math.floor((len + spacing) / (buildingMinLength + spacing)));
      const lotLen = (len - spacing * (count - 1)) / count;
      const dir = g.directionVector();
      for (let i = 0; i < count; i++) {
        const start = add(g.p1, scale(dir, i * (lotLen + spacing)));
        lots.push(new Segment(start, add(start, scale(dir, lotLen))));
      }
    }

    const footprints = lots.map((l) => new Envelope(l, buildingWidth, 1).polygon);
    const roads = this.envelopes.map((e) => e.polygon);
    const kept: Polygon[] = [];
    for (const f of footprints) {
      const clash =
        kept.some((k) => k.intersectsPolygon(f) || k.distanceToPolygon(f) < spacing - 1) ||
        roads.some((r) => r.intersectsPolygon(f));
      if (!clash) kept.push(f);
    }
    const rand = createRng(this.seed ^ 0x9e3779b9);
    return kept.map((f) => new Building(f, lerp(160, 260, rand())));
  }

  private generateTrees(): Tree[] {
    const { treeSize, treeDensity } = this.settings;
    if (this.graph.points.length === 0 || treeDensity <= 0) return [];
    const obstacles = [...this.envelopes.map((e) => e.polygon), ...this.buildings.map((b) => b.base)];
    const b = boundsOf(obstacles.flatMap((o) => o.points));
    const rand = createRng(this.seed);
    const trees: Tree[] = [];
    const target = Math.round(((b.maxX - b.minX) * (b.maxY - b.minY) * treeDensity) / (treeSize * treeSize * 12));
    let attempts = 0;
    while (trees.length < target && attempts < target * 40) {
      attempts++;
      const p = new Point(lerp(b.minX, b.maxX, rand()), lerp(b.minY, b.maxY, rand()));
      let nearest = Infinity, blocked = false;
      for (const o of obstacles) {
        if (o.containsPoint(p)) {
          blocked = true;
          break;
        }
        const d = o.distanceToPoint(p);
        if (d < treeSize / 2) {
          blocked = true;
          break;
        }
        nearest = Math.min(nearest, d);
      }
      if (blocked || nearest > treeSize * 2) continue;
      if (trees.some((t) => distance(t.center, p) < treeSize * 0.9)) continue;
      trees.push(new Tree(p, treeSize, lerp(170, 240, rand()), Math.floor(rand() * 1e9)));
    }
    return trees;
  }

  /** Drop markings whose road was deleted. */
  private pruneMarkings(): void {
    const roads = this.envelopes.map((e) => e.polygon);
    this.markings = this.markings.filter((m) => roads.some((r) => r.containsPoint(m.center)));
  }

  /**
   * Travel direction for a lane-guide point: cars keep right, so the lane centre sits to the
   * right of the direction of travel along the nearest road.
   */
  laneDirection(at: Vec): Point | null {
    const road = getNearestSegment(at, this.graph.segments);
    if (!road) return null;
    const d = road.directionVector();
    const offset = subtract(at, road.projectPoint(at).point);
    if (road.oneWay) return d;
    return dot(offset, perpendicular(d)) >= 0 ? d : scale(d, -1);
  }

  /** Snap a marking of `type` to the lane or road nearest `at`, or null if nothing is in reach. */
  snapMarking(type: MarkingType, at: Vec, reach = this.settings.roadWidth / 2): Marking | null {
    if (this.roadsStale) this.generateRoads();
    const lane = SNAPS_TO[type] === "lane";
    const seg = getNearestSegment(at, lane ? this.laneGuides : this.graph.segments, reach);
    if (!seg) return null;
    const { point, offset } = seg.projectPoint(at);
    const center = offset < 0 ? seg.p1.clone() : offset > 1 ? seg.p2.clone() : point;
    const dir = lane ? this.laneDirection(center) : seg.directionVector();
    return dir ? new Marking(type, center, dir, this.settings.roadWidth) : null;
  }

  get startMarkings() {
    return this.markings.filter((m) => m.type === "start");
  }

  get targetMarking() {
    return this.markings.find((m) => m.type === "target") ?? null;
  }

  /** Segments a car must not cross right now: road edges plus red / yellow light stop lines. */
  obstacles(): Segment[] {
    const lines = this.markings.filter((m) => m.type === "light" && (m.state === "red" || m.state === "yellow")).map((m) => m.frontEdge);
    return lines.length ? [...this.roadBorders, ...lines] : this.roadBorders;
  }

  /** Lights at the same intersection take turns: one approach green, the rest red. */
  updateLights(dt: number): void {
    const lights = this.markings.filter((m) => m.type === "light");
    if (lights.length === 0) return;
    this.lightClock += dt;
    const groups = new Map<Point, Marking[]>();
    for (const l of lights) {
      let best: Point | null = null, bestD = Infinity;
      for (const p of this.graph.points) {
        const d = distance(p, l.center);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (!best) continue;
      if (!groups.has(best)) groups.set(best, []);
      groups.get(best)!.push(l);
    }
    const phase = LIGHT_GREEN + LIGHT_YELLOW;
    for (const group of groups.values()) {
      const t = this.lightClock % (phase * group.length);
      const active = Math.floor(t / phase);
      group.forEach((l, i) => {
        l.state = i !== active ? "red" : t - active * phase < LIGHT_GREEN ? "green" : "yellow";
      });
    }
  }

  bounds() {
    const pts = this.envelopes.length ? this.envelopes.flatMap((e) => e.polygon.points) : this.graph.points;
    return pts.length ? boundsOf(pts) : { minX: -500, minY: -500, maxX: 500, maxY: 500 };
  }

  draw(ctx: Ctx, opts: DrawOptions): void {
    const { roadWidth } = this.settings;
    const near = (p: Vec, pad = 0) => !opts.renderRadius || distance(p, opts.view) < opts.renderRadius + pad;

    for (const e of this.envelopes) {
      if (!near(e.skeleton.p1, roadWidth * 20) && !near(e.skeleton.p2, roadWidth * 20)) continue;
      drawPolygon(ctx, e.polygon, { fill: "#b8b8b8", stroke: "#b8b8b8", lineWidth: 15, join: "round" });
    }
    drawSegments(ctx, this.graph.segments.filter((s) => !s.oneWay), { color: "white", width: 4, dash: [20, 15], cap: "butt" });
    for (const s of this.graph.segments) if (s.oneWay) drawArrow(ctx, s.p1, s.p2, { color: "white", size: 14 });
    for (const m of this.markings) {
      if (opts.hideStart && m.type === "start") continue;
      if (near(m.center, 100)) m.draw(ctx);
    }
    drawSegments(ctx, this.roadBorders, { color: "white", width: 4, cap: "round" });

    opts.between?.(ctx);

    const scenery: (Building | Tree)[] = [...this.buildings, ...this.trees].filter((s) => near(s.center, 300));
    if (opts.flat) {
      for (const s of scenery) s.drawFlat(ctx);
      return;
    }
    scenery.sort((a, b) => distance(b.center, opts.view) - distance(a.center, opts.view));
    for (const s of scenery) s.draw(ctx, opts.view, opts.cameraHeight);
  }

  toJSON(): WorldData {
    return {
      version: 1,
      seed: this.seed,
      settings: this.settings,
      graph: this.graph.toJSON(),
      markings: this.markings.map((m) => m.toJSON()),
    };
  }

  static fromJSON(data: WorldData): World {
    if (data.version !== 1) throw new Error(`Unsupported world version ${String(data.version)}`);
    const settings = { ...DEFAULT_SETTINGS, ...data.settings };
    const world = new World(Graph.fromJSON(data.graph), settings, data.seed);
    world.markings = data.markings.map((m) => Marking.fromJSON(m, settings.roadWidth));
    return world;
  }
}
