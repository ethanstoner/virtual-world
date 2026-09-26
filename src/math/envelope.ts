import { angle, subtract, translate } from "./point";
import { Polygon } from "./polygon";
import type { Segment } from "./segment";

/** A stadium-shaped polygon of `width` around `skeleton`, with `roundness` points per end cap. */
export class Envelope {
  readonly polygon: Polygon;

  constructor(
    public readonly skeleton: Segment,
    public readonly width: number,
    roundness = 10,
  ) {
    const { p1, p2 } = skeleton;
    const r = width / 2;
    const alpha = angle(subtract(p2, p1));
    const steps = Math.max(1, roundness);
    const step = Math.PI / steps;
    const points = [];
    for (let i = 0; i <= steps; i++) points.push(translate(p2, alpha - Math.PI / 2 + i * step, r));
    for (let i = 0; i <= steps; i++) points.push(translate(p1, alpha + Math.PI / 2 + i * step, r));
    this.polygon = new Polygon(points);
  }
}
