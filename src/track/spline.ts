import { Point, type Vec, distance } from "../math/point";

/**
 * Closed centripetal Catmull-Rom curve through `controls`. Centripetal (alpha = 0.5)
 * rather than uniform because uniform Catmull-Rom overshoots into loops and cusps when
 * control points are unevenly spaced, and a cusp is an infinitely tight corner.
 *
 * Returns the curve sampled about every `step` units, starting exactly at controls[0].
 */
export function closedCatmullRom(controls: readonly Vec[], step = 2): Point[] {
  const n = controls.length;
  if (n < 3) return controls.map((p) => new Point(p.x, p.y));
  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = controls[(i - 1 + n) % n], p1 = controls[i], p2 = controls[(i + 1) % n], p3 = controls[(i + 2) % n];
    const samples = Math.max(2, Math.ceil(distance(p1, p2) / step));
    for (let s = 0; s < samples; s++) out.push(spanPoint(p0, p1, p2, p3, s / samples));
  }
  return out;
}

/** Index into the sampled curve where each control point's span begins. */
export function spanStarts(controls: readonly Vec[], step = 2): number[] {
  const starts: number[] = [];
  let at = 0;
  for (let i = 0; i < controls.length; i++) {
    starts.push(at);
    at += Math.max(2, Math.ceil(distance(controls[i], controls[(i + 1) % controls.length]) / step));
  }
  return starts;
}

function knot(t: number, a: Vec, b: Vec): number {
  // sqrt of chord length; tiny floor keeps coincident points from dividing by zero
  return t + Math.max(Math.sqrt(distance(a, b)), 1e-6);
}

function spanPoint(p0: Vec, p1: Vec, p2: Vec, p3: Vec, u: number): Point {
  const t0 = 0;
  const t1 = knot(t0, p0, p1);
  const t2 = knot(t1, p1, p2);
  const t3 = knot(t2, p2, p3);
  const t = t1 + (t2 - t1) * u;
  const mix = (a: Vec, b: Vec, ta: number, tb: number) => {
    const wa = (tb - t) / (tb - ta), wb = (t - ta) / (tb - ta);
    return { x: a.x * wa + b.x * wb, y: a.y * wa + b.y * wb };
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  const c = mix(b1, b2, t1, t2);
  return new Point(c.x, c.y);
}
