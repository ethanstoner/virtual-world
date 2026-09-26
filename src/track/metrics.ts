import { Point, type Vec } from "../math/point";

/*
 * Ports of NeuroRacer's track measurements (src/track.py, tools/probe_tracks.py).
 * They must agree with the Python to the pixel, because the editor's verdict is only
 * useful if NeuroRacer reaches the same one when it loads the file. np.gradient and
 * np.interp semantics are reproduced exactly, including one-sided differences at the
 * ends of the (non-wrapped) array.
 */

/** Resample a closed polyline to roughly even spacing, as `_resample_closed`. */
export function resampleClosed(points: readonly Vec[], spacing = 4): Point[] {
  return sampleClosed(points, (total) => Math.max(Math.trunc(total / spacing), 16));
}

/** `n` points evenly spaced by arc length around a closed polyline, starting at points[0]. */
export function sampleClosed(points: readonly Vec[], n: number | ((total: number) => number)): Point[] {
  const closed = [...points, points[0]];
  const cum = [0];
  for (let i = 1; i < closed.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(closed[i].x - closed[i - 1].x, closed[i].y - closed[i - 1].y));
  }
  const total = cum[cum.length - 1];
  if (typeof n === "function") n = n(total);
  const out: Point[] = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / n;
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    // np.interp on repeated x values takes the right-hand one; skip zero-length pieces
    while (j < cum.length - 2 && cum[j + 1] === cum[j]) j++;
    const span = cum[j + 1] - cum[j];
    const t = span > 0 ? (target - cum[j]) / span : 0;
    out.push(new Point(closed[j].x + (closed[j + 1].x - closed[j].x) * t, closed[j].y + (closed[j + 1].y - closed[j].y) * t));
  }
  return out;
}

/** np.gradient along axis 0: central differences inside, one-sided at the two ends. */
export function gradient(p: readonly Vec[]): Point[] {
  const n = p.length;
  return p.map((_, i) => {
    if (i === 0) return new Point(p[1].x - p[0].x, p[1].y - p[0].y);
    if (i === n - 1) return new Point(p[n - 1].x - p[n - 2].x, p[n - 1].y - p[n - 2].y);
    return new Point((p[i + 1].x - p[i - 1].x) / 2, (p[i + 1].y - p[i - 1].y) / 2);
  });
}

/** Tightest radius of curvature on a centerline and where it occurs (`min_centerline_radius`). */
export function tightestCorner(c: readonly Vec[]): { radius: number; index: number } {
  const d1 = gradient(c);
  const d2 = gradient(d1);
  let best = -1, index = 0;
  for (let i = 0; i < c.length; i++) {
    const num = Math.abs(d1[i].x * d2[i].y - d1[i].y * d2[i].x);
    const den = Math.pow(d1[i].x ** 2 + d1[i].y ** 2, 1.5);
    const k = num / Math.max(den, 1e-12);
    if (k > best) {
      best = k;
      index = i;
    }
  }
  return { radius: 1 / Math.max(best, 1e-12), index };
}

/**
 * How close the lap comes to itself, ignoring points within 1.5 track widths along the
 * lap (`self_approach_distance`). At or below the track width, two parts of the lap
 * overlap and NeuroRacer's per-pixel progress map becomes ambiguous.
 */
export function selfApproach(c: readonly Vec[], trackWidth: number): { distance: number; pair: [number, number] | null } {
  const m = c.length;
  const s = [0];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const a = c[i], b = c[(i + 1) % m];
    total += Math.hypot(b.x - a.x, b.y - a.y);
    if (i < m - 1) s.push(total);
  }
  const limit = trackWidth * 1.5;
  let best = Infinity;
  let pair: [number, number] | null = null;
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      let arc = Math.abs(s[i] - s[j]);
      arc = Math.min(arc, total - arc);
      if (arc <= limit) continue;
      const d = Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y);
      if (d < best) {
        best = d;
        pair = [i, j];
      }
    }
  }
  return { distance: best, pair };
}

/** Fraction of the lap turning against the dominant direction (probe_tracks `reverse`). */
export function reverseFraction(c: readonly Vec[]): number {
  const m = c.length;
  const ext = [...c, c[0], c[1]];
  const t: Point[] = [];
  for (let i = 0; i < m + 1; i++) {
    const dx = ext[i + 1].x - ext[i].x, dy = ext[i + 1].y - ext[i].y;
    const len = Math.max(Math.hypot(dx, dy), 1e-9);
    t.push(new Point(dx / len, dy / len));
  }
  let neg = 0;
  for (let i = 0; i < m; i++) if (t[i].x * t[i + 1].y - t[i].y * t[i + 1].x < -1e-4) neg++;
  const r = neg / m;
  return Math.min(r, 1 - r);
}

export function lapLength(c: readonly Vec[]): number {
  let total = 0;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** Smallest gap between the track's edge and the arena edge; negative means it spills out. */
export function arenaMargin(c: readonly Vec[], trackWidth: number, world: readonly [number, number]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of c) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return Math.min(minX, minY, world[0] - maxX, world[1] - maxY) - trackWidth / 2;
}
