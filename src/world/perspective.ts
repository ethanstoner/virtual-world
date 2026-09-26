import { Point, type Vec } from "../math/point";

/**
 * Screen-plane position of a point lifted `height` above the ground, seen by a camera
 * `cameraHeight` above `view`. Pinhole projection: ground offsets scale by H / (H - h).
 */
export function lift(p: Vec, view: Vec, height: number, cameraHeight: number): Point {
  const h = Math.min(height, cameraHeight * 0.95);
  const k = cameraHeight / (cameraHeight - h);
  return new Point(view.x + (p.x - view.x) * k, view.y + (p.y - view.y) * k);
}
