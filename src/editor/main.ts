import "./style.css";
import { Point, add, distance, getNearestPoint, perpendicular, scale, subtract, normalize } from "../math/point";
import { type Ctx, drawPoint, tracePath } from "./draw";
import { gradient } from "../track/metrics";
import { spanStarts } from "../track/spline";
import { ARENA, type Analysis, type Check, Track } from "../track/track";
import { History } from "./history";
import { Viewport } from "./viewport";

const STORE_KEY = "virtual-world:track";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $<HTMLCanvasElement>("view");
const ctx = canvas.getContext("2d")!;
const viewport = new Viewport(canvas);

let track = restore() ?? Track.template();
let centerline: Point[] = [];
let analysis: Analysis;
let checks: Check[] = [];
let dirty = true;

const history = new History(
  () => JSON.stringify(track.toFile()),
  (snap) => {
    track = Track.fromFile(JSON.parse(snap));
    changed();
  },
);

let hovered: Point | null = null;
let dragging: Point | null = null;

function changed() {
  dirty = true;
}

function recompute() {
  centerline = track.centerline();
  analysis = track.analyse(centerline);
  checks = Track.checks(analysis, track.width);
  renderPanel();
  persist();
  dirty = false;
}

// ---------- input ----------

function reach() {
  return 16 / viewport.zoom;
}

function deleteHandle(p: Point) {
  if (track.controls.length <= 4) return;
  history.record(() => {
    track.detach();
    track.controls = track.controls.filter((q) => q !== p);
  });
  if (hovered === p) hovered = null;
  changed();
}

/** Insert a handle into the span whose stretch of curve passes closest to `at`. */
function insertHandle(at: Point): Point {
  const starts = spanStarts(track.controls, 2);
  let best = 0, bestD = Infinity;
  centerline.forEach((p, i) => {
    const d = distance(p, at);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  let span = 0;
  while (span + 1 < starts.length && starts[span + 1] <= best) span++;
  const p = new Point(Math.round(at.x), Math.round(at.y));
  track.detach();
  track.controls.splice(span + 1, 0, p);
  changed();
  return p;
}

canvas.addEventListener("mousedown", (e) => {
  const at = viewport.mouse(e);
  if (e.button === 2) {
    if (hovered) deleteHandle(hovered);
    return;
  }
  if (e.button !== 0) return;
  history.begin();
  if (hovered) {
    dragging = hovered;
    return;
  }
  hovered = dragging = insertHandle(at);
});

window.addEventListener("mousemove", (e) => {
  const at = viewport.mouse(e);
  if (dragging) {
    track.detach();
    dragging.x = Math.round(at.x);
    dragging.y = Math.round(at.y);
    changed();
    return;
  }
  if (!viewport.isPanning) hovered = getNearestPoint(at, track.controls, reach());
});

window.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = null;
  history.end();
  changed();
});

window.addEventListener("keydown", (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === "z") {
    e.preventDefault();
    if (e.shiftKey) history.redo();
    else history.undo();
  } else if ((e.ctrlKey || e.metaKey) && k === "y") {
    e.preventDefault();
    history.redo();
  } else if (k === "r") reverse();
  else if (k === "f") fit();
  else if (k === "s" && hovered) setStart(hovered);
  else if ((k === "delete" || k === "backspace") && hovered) deleteHandle(hovered);
});

// ---------- touch ----------
// Tap the track to add a handle, drag a handle to move it, long-press a handle to delete
// it, drag empty space to pan, pinch to zoom. Mouse input above is untouched: these
// handlers only act on touch pointers, and cancel the browser's emulated mouse events.

const touches = new Map<number, { x: number; y: number }>();
let touchGesture:
  | { kind: "pending"; id: number; x0: number; y0: number; handle: Point | null; timer: number }
  | { kind: "drag"; id: number; handle: Point }
  | { kind: "pan"; id: number }
  | { kind: "pinch"; dist: number }
  | null = null;
const TAP_SLOP = 10, LONG_PRESS_MS = 550;

function pinchSpan() {
  const [a, b] = [...touches.values()];
  return { dist: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
}

function endTouchDrag() {
  if (touchGesture?.kind === "drag") {
    dragging = null;
    history.end();
    changed();
  }
  if (touchGesture?.kind === "pending") clearTimeout(touchGesture.timer);
}

canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch") return;
  e.preventDefault();
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) {
    endTouchDrag();
    touchGesture = { kind: "pinch", dist: pinchSpan().dist };
    return;
  }
  if (touches.size > 2) return;
  const handle = getNearestPoint(viewport.atClient(e.clientX, e.clientY), track.controls, 28 / viewport.zoom);
  hovered = handle;
  const timer = window.setTimeout(() => {
    if (touchGesture?.kind === "pending" && touchGesture.handle) {
      deleteHandle(touchGesture.handle);
      touchGesture = null;
    }
  }, LONG_PRESS_MS);
  touchGesture = { kind: "pending", id: e.pointerId, x0: e.clientX, y0: e.clientY, handle, timer };
});

canvas.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
  const prev = touches.get(e.pointerId)!;
  touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const g = touchGesture;
  if (!g) return;
  if (g.kind === "pinch" && touches.size === 2) {
    const { dist, mx, my } = pinchSpan();
    viewport.panByClient((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
    if (g.dist > 0) viewport.zoomAt(mx, my, dist / g.dist);
    g.dist = dist;
    return;
  }
  if (g.kind === "pending" && g.id === e.pointerId) {
    if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < TAP_SLOP) return;
    clearTimeout(g.timer);
    if (g.handle) {
      history.begin();
      dragging = g.handle;
      touchGesture = { kind: "drag", id: g.id, handle: g.handle };
    } else {
      touchGesture = { kind: "pan", id: g.id };
    }
  }
  const cur = touchGesture;
  if (cur?.kind === "drag" && cur.id === e.pointerId) {
    const at = viewport.atClient(e.clientX, e.clientY);
    track.detach();
    cur.handle.x = Math.round(at.x);
    cur.handle.y = Math.round(at.y);
    changed();
  } else if (cur?.kind === "pan" && cur.id === e.pointerId) {
    viewport.panByClient(e.clientX - prev.x, e.clientY - prev.y);
  }
});

function touchEnd(e: PointerEvent) {
  if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
  touches.delete(e.pointerId);
  const g = touchGesture;
  if (g?.kind === "pending" && g.id === e.pointerId) {
    clearTimeout(g.timer);
    // a tap on open track adds a handle; a tap on a handle just selects it
    if (!g.handle && e.type === "pointerup") {
      history.record(() => (hovered = insertHandle(viewport.atClient(g.x0, g.y0))));
    }
    touchGesture = null;
  } else if (g?.kind === "drag" && g.id === e.pointerId) {
    endTouchDrag();
    touchGesture = null;
  } else if (g?.kind === "pinch" && touches.size < 2) {
    touchGesture = null;
  } else if (g?.kind === "pan" && g.id === e.pointerId) {
    touchGesture = null;
  }
}
canvas.addEventListener("pointerup", touchEnd);
canvas.addEventListener("pointercancel", touchEnd);

function reverse() {
  history.record(() => {
    track.detach();
    const [first, ...rest] = track.controls;
    track.controls = [first, ...rest.reverse()];
  });
  changed();
}

function setStart(p: Point) {
  const i = track.controls.indexOf(p);
  if (i <= 0) return;
  history.record(() => {
    track.detach();
    track.controls = [...track.controls.slice(i), ...track.controls.slice(0, i)];
  });
  changed();
}

function fit() {
  viewport.fit(-40, -40, ARENA[0] + 40, ARENA[1] + 40, sideOpen() ? 0.8 : 0.92);
  // keep the arena clear of the panel: beside it on wide screens, above the sheet on narrow ones
  const panel = document.getElementById("side")!.getBoundingClientRect();
  const shift = sideOpen() ? new Point(-panel.width / 2, 0) : new Point(0, -(panel.height - 60) / 2);
  viewport.offset = add(viewport.offset, scale(shift, devicePixelRatio / viewport.zoom));
}

function sideOpen() {
  return window.innerWidth > 760;
}

// ---------- toolbar ----------

$("new").onclick = () => {
  history.record(() => (track = Track.template()));
  changed();
};
$("undo").onclick = () => history.undo();
$("redo").onclick = () => history.redo();
$("reverse").onclick = reverse;
$("fit").onclick = fit;
$("export").onclick = () => {
  const blob = new Blob([JSON.stringify(track.toFile(), null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${slug(track.name)}.track.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
$("open").onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json,application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (file) openText(await file.text());
  };
  input.click();
};

function openText(text: string) {
  try {
    const next = Track.fromFile(JSON.parse(text));
    history.record(() => (track = next));
    changed();
    toast(`Opened ${next.name}`);
  } catch (err) {
    toast(err instanceof Error ? err.message : String(err), true);
  }
}
const nameInput = $<HTMLInputElement>("name");
nameInput.oninput = () => {
  track.name = nameInput.value.trim() || "untitled";
  persist();
};

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "track";
}

// ---------- panel ----------

function renderPanel() {
  if (document.activeElement !== nameInput) nameInput.value = track.name;
  $("checks").innerHTML = checks
    .map((c) => {
      const cls = c.ok ? "ok" : c.severity;
      const mark = c.ok ? "&#10003;" : c.severity === "error" ? "&#10007;" : "!";
      return `<li class="${cls}"><span class="mark">${mark}</span><span>${c.label}</span><small>${c.detail}</small></li>`;
    })
    .join("");
  const m = analysis.metrics;
  const rows: [string, string][] = [
    ["Tightest corner", `${m.tightest_radius.toFixed(0)} px`],
    ["Closest approach", Number.isFinite(m.self_approach) ? `${m.self_approach.toFixed(0)} px` : "none"],
    ["Reverse curvature", `${(m.reverse_fraction * 100).toFixed(1)}%`],
    ["Lap length", `${m.length.toFixed(0)} px`],
    ["Handles", track.imported ? `${track.controls.length} (fitted)` : String(track.controls.length)],
  ];
  $("metrics").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  $("imported").hidden = !track.imported;
  const blocked = checks.some((c) => !c.ok && c.severity === "error");
  const exportBtn = $<HTMLButtonElement>("export");
  exportBtn.disabled = blocked;
  exportBtn.title = blocked ? "Fix the failing checks first: NeuroRacer would reject this track" : "Download for NeuroRacer";
  ($("undo") as HTMLButtonElement).disabled = !history.canUndo;
  ($("redo") as HTMLButtonElement).disabled = !history.canRedo;
}

function toast(text: string, error = false) {
  const el = document.createElement("div");
  el.className = `toast${error ? " error" : ""}`;
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => (el.style.opacity = "0"), 2600);
  setTimeout(() => el.remove(), 3000);
}

function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(track.toFile()));
  } catch {
    /* storage unavailable: editing still works, it just won't survive a reload */
  }
}

function restore(): Track | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    return Track.fromFile(JSON.parse(raw));
  } catch {
    return null;
  }
}

// ---------- drawing ----------

function drawArena(ctx: Ctx) {
  ctx.fillStyle = "#1f3d27";
  ctx.fillRect(0, 0, ARENA[0], ARENA[1]);
  ctx.strokeStyle = "rgba(255,255,255,0.05)";
  ctx.lineWidth = 1 / viewport.zoom;
  ctx.beginPath();
  for (let x = 100; x < ARENA[0]; x += 100) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ARENA[1]);
  }
  for (let y = 100; y < ARENA[1]; y += 100) {
    ctx.moveTo(0, y);
    ctx.lineTo(ARENA[0], y);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 2 / viewport.zoom;
  ctx.strokeRect(0, 0, ARENA[0], ARENA[1]);
}

function strokeLoop(ctx: Ctx, pts: Point[], width: number, color: string, dash: number[] = []) {
  tracePath(ctx, pts);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawTrack(ctx: Ctx) {
  const w = track.width;
  const failing = new Set(checks.filter((c) => !c.ok).map((c) => c.id));
  strokeLoop(ctx, centerline, w + 8, failing.has("overlap") ? "#f87171" : "#e8e8e8");
  strokeLoop(ctx, centerline, w, "#4a4f57");
  strokeLoop(ctx, centerline, 2, "rgba(255,255,255,0.5)", [18, 16]);

  // start line, then chevrons showing the driving direction
  const c = analysis.resampled;
  const dir = normalize(subtract(c[1], c[0]));
  const across = scale(perpendicular(dir), w / 2);
  const cells = 6;
  for (let i = 0; i < cells; i++) {
    for (let row = 0; row < 2; row++) {
      ctx.fillStyle = (i + row) % 2 ? "#111" : "#fff";
      const a = add(add(c[0], scale(across, -1 + (2 * i) / cells)), scale(dir, row * 8 - 8));
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(Math.atan2(dir.y, dir.x));
      ctx.fillRect(0, 0, 8, w / cells);
      ctx.restore();
    }
  }
  const every = Math.max(1, Math.round(220 / 4));
  for (let i = every; i < c.length - every / 2; i += every) {
    const d = normalize(subtract(c[(i + 1) % c.length], c[i]));
    const tip = add(c[i], scale(d, 10));
    const side = scale(perpendicular(d), 9);
    const back = add(c[i], scale(d, -6));
    ctx.beginPath();
    ctx.moveTo(add(back, side).x, add(back, side).y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(add(back, scale(side, -1)).x, add(back, scale(side, -1)).y);
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  drawTightest(ctx, failing.has("radius"));
  drawApproach(ctx, failing.has("overlap"));
}

/** The osculating circle at the centerline's tightest point. */
function drawTightest(ctx: Ctx, failing: boolean) {
  const c = analysis.resampled;
  const i = analysis.tightestIndex;
  const r = analysis.metrics.tightest_radius;
  const d1 = gradient(c), d2 = gradient(d1);
  const turn = Math.sign(d1[i].x * d2[i].y - d1[i].y * d2[i].x) || 1;
  const centre = add(c[i], scale(perpendicular(normalize(d1[i])), r * turn));
  const color = failing ? "#f87171" : "#ffcf4a";
  ctx.beginPath();
  ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
  ctx.setLineDash([6 / viewport.zoom, 6 / viewport.zoom]);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / viewport.zoom;
  ctx.stroke();
  ctx.setLineDash([]);
  drawPoint(ctx, c[i], { size: 10 / viewport.zoom, color });
  label(ctx, c[i], `r ${r.toFixed(0)}px`, color);
}

function drawApproach(ctx: Ctx, failing: boolean) {
  const pair = analysis.approachPair;
  if (!pair) return;
  const [a, b] = pair.map((i) => analysis.resampled[i]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = failing ? "#f87171" : "rgba(125,211,252,0.8)";
  ctx.lineWidth = 2 / viewport.zoom;
  ctx.setLineDash([4 / viewport.zoom, 4 / viewport.zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
  // when the gap sits beside the tightest corner, stack its label under the corner's
  // instead of letting the two overlap
  const mid = scale(add(a, b), 0.5);
  const corner = analysis.resampled[analysis.tightestIndex];
  const anchor = distance(mid, corner) * viewport.zoom < 60 ? corner : mid;
  label(ctx, anchor, `gap ${analysis.metrics.self_approach.toFixed(0)}px`, failing ? "#f87171" : "#7dd3fc", true);
}

function label(ctx: Ctx, at: { x: number; y: number }, text: string, color: string, below = false) {
  const s = 1 / viewport.zoom;
  const top = at.y + (below ? 6 : -20) * s;
  ctx.font = `600 ${12 * s}px Inter, system-ui, sans-serif`;
  const w = ctx.measureText(text).width;
  ctx.fillStyle = "rgba(10,12,16,0.85)";
  ctx.fillRect(at.x + 8 * s, top, w + 10 * s, 18 * s);
  ctx.fillStyle = color;
  ctx.fillText(text, at.x + 13 * s, top + 13 * s);
}

function drawHandles(ctx: Ctx) {
  const s = 1 / viewport.zoom;
  track.controls.forEach((p, i) => {
    const active = p === hovered || p === dragging;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (active ? 9 : 7) * s, 0, Math.PI * 2);
    ctx.fillStyle = i === 0 ? "#4ade80" : "#ffcf4a";
    ctx.fill();
    ctx.lineWidth = 2 * s;
    ctx.strokeStyle = "#111";
    ctx.stroke();
  });
}

// ---------- loop ----------

function resize() {
  canvas.width = Math.round(window.innerWidth * devicePixelRatio);
  canvas.height = Math.round(window.innerHeight * devicePixelRatio);
}
window.addEventListener("resize", resize);
resize();
fit();

function frame() {
  if (dirty) recompute();
  viewport.begin(ctx);
  drawArena(ctx);
  drawTrack(ctx);
  drawHandles(ctx);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// hooks for automated checks (Playwright, run against the dev server); stripped from production builds
if (import.meta.env.DEV) {
  Object.assign(window, { __editor: { get track() { return track; }, get analysis() { return analysis; }, history, openText, viewport } });
}
