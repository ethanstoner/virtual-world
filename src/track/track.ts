import { Point } from "../math/point";
import { arenaMargin, lapLength, resampleClosed, reverseFraction, sampleClosed, selfApproach, tightestCorner } from "./metrics";
import { closedCatmullRom } from "./spline";

/** NeuroRacer's arena and road width (config.py). Files carry them so a mismatch is caught on load. */
export const ARENA: readonly [number, number] = [1200, 800];
export const TRACK_WIDTH = 90;

/**
 * NeuroRacer's minimum centerline radius. Below it, the centerline stops describing the
 * corner a car drives (champions lap 12px centerline corners on a wider line, NeuroRacer
 * devlog 15), so a track's corner metric would mean nothing.
 */
export const MIN_RADIUS = 40;

export type TrackFile = {
  format: "neuroracer-track";
  version: 1;
  name: string;
  world: [number, number];
  track_width: number;
  /** Closed loop in driving order; the car starts at [0] heading towards [1]. */
  centerline: [number, number][];
  /** Editable handles; absent for tracks that did not come from the editor. */
  control_points?: [number, number][];
  metrics?: TrackMetrics;
  source?: string;
};

export type TrackMetrics = {
  tightest_radius: number;
  self_approach: number;
  reverse_fraction: number;
  length: number;
  arena_margin: number;
};

export type Analysis = {
  metrics: TrackMetrics;
  /** Resampled centerline the metrics were measured on, as NeuroRacer sees it. */
  resampled: Point[];
  tightestIndex: number;
  approachPair: [number, number] | null;
};

export type Check = { id: string; label: string; ok: boolean; severity: "error" | "warning"; detail: string };

const round2 = (v: number) => Math.round(v * 100) / 100;

export class Track {
  /**
   * A centerline imported without handles (a NeuroRacer built-in or generated track) is
   * kept exactly as loaded until the first edit. The handles shown for it are a fit, and
   * a spline through them measures corners differently: on a generated track the
   * tightest corner read 106px through a 48-handle fit against 122px exact.
   */
  imported: Point[] | null = null;

  constructor(
    public name: string,
    public controls: Point[],
    public readonly width = TRACK_WIDTH,
    public readonly world: readonly [number, number] = ARENA,
  ) {}

  /** The exported centerline: the spline, rounded as it will be written to disk. */
  centerline(): Point[] {
    if (this.imported) return this.imported;
    return closedCatmullRom(this.controls, 2).map((p) => new Point(round2(p.x), round2(p.y)));
  }

  /** Call before changing handles: from here on the shape comes from the spline. */
  detach(): void {
    this.imported = null;
  }

  analyse(centerline = this.centerline()): Analysis {
    const c = resampleClosed(centerline, 4);
    const corner = tightestCorner(c);
    const approach = selfApproach(c, this.width);
    return {
      metrics: {
        tightest_radius: corner.radius,
        self_approach: approach.distance,
        reverse_fraction: reverseFraction(c),
        length: lapLength(c),
        arena_margin: arenaMargin(c, this.width, this.world),
      },
      resampled: c,
      tightestIndex: corner.index,
      approachPair: approach.pair,
    };
  }

  static checks(a: Analysis, width = TRACK_WIDTH): Check[] {
    const m = a.metrics;
    return [
      {
        id: "overlap",
        label: "No overlap",
        ok: m.self_approach > width,
        severity: "error",
        detail: `closest approach ${fmt(m.self_approach)}px, needs > ${width}px`,
      },
      {
        id: "arena",
        label: "Inside arena",
        ok: m.arena_margin > 0,
        severity: "error",
        detail: `edge margin ${fmt(m.arena_margin)}px`,
      },
      {
        id: "radius",
        label: "Measurable corners",
        ok: m.tightest_radius >= MIN_RADIUS,
        severity: "error",
        detail: `tightest ${fmt(m.tightest_radius)}px, needs >= ${MIN_RADIUS}px`,
      },
      {
        id: "reverse",
        label: "Turns both ways",
        ok: m.reverse_fraction > 0,
        severity: "warning",
        detail: `${(m.reverse_fraction * 100).toFixed(1)}% of the lap turns against the grain`,
      },
    ];
  }

  toFile(): TrackFile {
    const centerline = this.centerline();
    const { metrics } = this.analyse(centerline);
    return {
      format: "neuroracer-track",
      version: 1,
      name: this.name,
      world: [this.world[0], this.world[1]],
      track_width: this.width,
      centerline: centerline.map((p) => [p.x, p.y]),
      ...(this.imported ? {} : { control_points: this.controls.map((p) => [round2(p.x), round2(p.y)]) }),
      metrics: {
        tightest_radius: round2(metrics.tightest_radius),
        self_approach: round2(metrics.self_approach),
        reverse_fraction: Math.round(metrics.reverse_fraction * 1e4) / 1e4,
        length: round2(metrics.length),
        arena_margin: round2(metrics.arena_margin),
      },
      source: "virtual-world",
    };
  }

  static fromFile(file: unknown): Track {
    const f = file as Partial<TrackFile>;
    if (f.format !== "neuroracer-track") throw new Error("Not a NeuroRacer track file");
    if (f.version !== 1) throw new Error(`Unsupported track file version ${String(f.version)}`);
    if (f.track_width !== TRACK_WIDTH || f.world?.[0] !== ARENA[0] || f.world?.[1] !== ARENA[1]) {
      throw new Error(`Track is for a ${f.world?.join("x")} arena at width ${f.track_width}; the editor uses ${ARENA.join("x")} at ${TRACK_WIDTH}`);
    }
    const exact = !f.control_points?.length;
    const controls = exact ? controlsFromCenterline(f.centerline ?? []) : f.control_points!;
    if (controls.length < 4) throw new Error("Track needs at least 4 points");
    const track = new Track(f.name ?? "untitled", controls.map(([x, y]) => new Point(x, y)));
    if (exact) track.imported = f.centerline!.map(([x, y]) => new Point(x, y));
    return track;
  }

  static template(): Track {
    const pts: [number, number][] = [
      [200, 400], [250, 230], [420, 160], [640, 190], [800, 150], [960, 220], [1000, 400], [940, 580], [760, 650], [560, 600], [380, 660], [240, 580],
    ];
    return new Track("untitled", pts.map(([x, y]) => new Point(x, y)));
  }
}

/**
 * Tracks without handles (NeuroRacer built-ins, generated tracks) get handles spaced
 * evenly by arc length, so they open in the editor as a close approximation.
 */
export function controlsFromCenterline(c: readonly [number, number][], spacing = 90): [number, number][] {
  if (c.length < 4) return [...c];
  const pts = c.map(([x, y]) => new Point(x, y));
  const total = lapLength(pts);
  const count = Math.max(8, Math.min(48, Math.round(total / spacing)));
  return sampleClosed(pts, count).map((p) => [round2(p.x), round2(p.y)]);
}

function fmt(v: number): string {
  return Number.isFinite(v) ? v.toFixed(0) : "none";
}

