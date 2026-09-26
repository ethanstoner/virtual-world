import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Point, distance } from "../src/math/point";
import { gradient, reverseFraction, resampleClosed, selfApproach, tightestCorner } from "../src/track/metrics";
import { closedCatmullRom } from "../src/track/spline";
import { MIN_RADIUS, Track, TRACK_WIDTH } from "../src/track/track";

const circle = (cx: number, cy: number, r: number, n = 400) =>
  Array.from({ length: n }, (_, i) => new Point(cx + r * Math.cos((i / n) * Math.PI * 2), cy + r * Math.sin((i / n) * Math.PI * 2)));

describe("metrics", () => {
  it("resamples to NeuroRacer's point count and keeps the start point", () => {
    const c = circle(600, 400, 200);
    const r = resampleClosed(c, 4);
    // perimeter of the 400-gon is just under 2*pi*200 = 1256.6
    expect(r).toHaveLength(314);
    expect(r[0]).toEqual(c[0]);
  });

  it("gradient matches numpy's one-sided ends and central interior", () => {
    const g = gradient([new Point(0, 0), new Point(1, 1), new Point(4, 2)]);
    expect(g.map((p) => [p.x, p.y])).toEqual([[1, 1], [2, 1], [3, 1]]);
  });

  it("measures a circle's radius exactly as NeuroRacer's numpy code does", () => {
    // min_centerline_radius(_resample_closed(400-gon, r=250)) in NeuroRacer; the 1% shortfall
    // from 250 is numpy's one-sided gradient at the array ends, reproduced on purpose
    expect(tightestCorner(resampleClosed(circle(600, 400, 250))).radius).toBeCloseTo(247.6716647634783, 6);
  });

  it("self-approach of a circle is the chord at 1.5 track widths of arc", () => {
    const c = resampleClosed(circle(600, 400, 300));
    const { distance: d } = selfApproach(c, 90);
    const chord = 2 * 300 * Math.sin(135 / 2 / 300);
    expect(d).toBeGreaterThan(chord - 4);
    expect(d).toBeLessThan(chord + 4);
  });

  it("a convex loop never turns the other way, a wavy one does", () => {
    expect(reverseFraction(resampleClosed(circle(600, 400, 250)))).toBe(0);
    const wavy = Array.from({ length: 600 }, (_, i) => {
      const t = (i / 600) * Math.PI * 2, r = 260 + 60 * Math.cos(4 * t);
      return new Point(600 + r * Math.cos(t) * 1.5, 400 + r * Math.sin(t));
    });
    expect(reverseFraction(resampleClosed(wavy))).toBeGreaterThan(0.05);
  });
});

describe("spline", () => {
  it("passes through every control point, starting at the first", () => {
    const ctrl = [new Point(200, 200), new Point(900, 250), new Point(1000, 600), new Point(300, 650)];
    const curve = closedCatmullRom(ctrl, 2);
    expect(curve[0]).toEqual(ctrl[0]);
    for (const p of ctrl) expect(Math.min(...curve.map((q) => distance(p, q)))).toBeLessThan(1e-6);
    for (let i = 0; i < curve.length; i++) expect(distance(curve[i], curve[(i + 1) % curve.length])).toBeLessThan(6);
  });
});

describe("Track", () => {
  it("the template is a valid track", () => {
    const checks = Track.checks(Track.template().analyse());
    expect(checks.filter((c) => c.severity === "error" && !c.ok)).toEqual([]);
  });

  it("flags a pinched loop as overlapping and a tiny kink as too tight to measure", () => {
    const pinched = new Track("p", [[200, 300], [1000, 300], [1000, 360], [600, 340], [200, 360]].map(([x, y]) => new Point(x, y)));
    const a = pinched.analyse();
    const byId = Object.fromEntries(Track.checks(a).map((c) => [c.id, c.ok]));
    expect(byId.overlap).toBe(false);
    expect(a.metrics.self_approach).toBeLessThanOrEqual(TRACK_WIDTH);
    expect(a.metrics.tightest_radius).toBeLessThan(MIN_RADIUS);
  });

  it("flags a track that leaves the arena", () => {
    const t = new Track("out", [[20, 100], [1100, 100], [1100, 700], [20, 700]].map(([x, y]) => new Point(x, y)));
    expect(Track.checks(t.analyse()).find((c) => c.id === "arena")?.ok).toBe(false);
  });

  it("round-trips through the file format with handles intact", () => {
    const t = Track.template();
    const file = JSON.parse(JSON.stringify(t.toFile()));
    const back = Track.fromFile(file);
    expect(back.controls.map((p) => [p.x, p.y])).toEqual(file.control_points);
    expect(back.toFile()).toEqual(file);
    expect(file.centerline[0]).toEqual(file.control_points[0]);
  });

  it("measures a NeuroRacer-written file exactly as NeuroRacer did", () => {
    // written by neuro-racer's save_file for procgen seed 7, track 2; metrics are numpy's
    const file = JSON.parse(readFileSync(new URL("./fixtures/gen7-002.track.json", import.meta.url), "utf8"));
    const t = Track.fromFile(file);
    const m = t.analyse().metrics;
    for (const [k, v] of Object.entries(file.metrics)) expect(m[k as keyof typeof m]).toBeCloseTo(v as number, 2);
  });

  it("keeps an imported centerline exact until a handle is edited", () => {
    const file = JSON.parse(readFileSync(new URL("./fixtures/gen7-002.track.json", import.meta.url), "utf8"));
    const t = Track.fromFile(file);
    expect(t.controls.length).toBeGreaterThanOrEqual(8);
    expect(t.toFile().centerline).toEqual(file.centerline);
    expect(t.toFile().control_points).toBeUndefined();
    t.detach();
    expect(t.toFile().control_points).toHaveLength(t.controls.length);
    expect(t.toFile().centerline).not.toEqual(file.centerline);
  });

  it("rejects files for another arena or track width", () => {
    const f = { ...Track.template().toFile(), track_width: 120 };
    expect(() => Track.fromFile(f)).toThrow(/width 120/);
    expect(() => Track.fromFile({ format: "nope" })).toThrow();
  });
});
