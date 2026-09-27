import type { Page } from "@playwright/test";

type EditorState = {
  handles: number;
  radius: number;
  approach: number;
  canUndo: boolean;
  canRedo: boolean;
  exportDisabled: boolean;
  imported: boolean;
  zoom: number;
  offset: [number, number];
  checks: string[];
};

/** Wait for the render loop to recompute, which happens once per animation frame. */
export async function settle(page: Page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

export async function state(page: Page): Promise<EditorState> {
  await settle(page);
  return page.evaluate(() => {
    const e = (window as any).__editor;
    return {
      handles: e.track.controls.length,
      radius: e.analysis.metrics.tightest_radius,
      approach: e.analysis.metrics.self_approach,
      canUndo: e.history.canUndo,
      canRedo: e.history.canRedo,
      exportDisabled: (document.getElementById("export") as HTMLButtonElement).disabled,
      imported: !!e.track.imported,
      zoom: e.viewport.zoom,
      offset: [e.viewport.offset.x, e.viewport.offset.y] as [number, number],
      checks: [...document.querySelectorAll("#checks li")].map((li) => li.className),
    };
  });
}

/** Client position of a world point, read from the canvas's live transform. */
export async function toClient(page: Page, x: number, y: number): Promise<[number, number]> {
  return page.evaluate(
    ([x, y]) => {
      const t = (document.getElementById("view") as HTMLCanvasElement).getContext("2d")!.getTransform();
      return [(x * t.a + t.e) / devicePixelRatio, (y * t.d + t.f) / devicePixelRatio] as [number, number];
    },
    [x, y],
  );
}

export async function handle(page: Page, i: number): Promise<[number, number]> {
  const [x, y] = await page.evaluate((i) => {
    const c = (window as any).__editor.track.controls[i];
    return [c.x, c.y];
  }, i);
  return toClient(page, x, y);
}

/** A fresh template track with no history, regardless of what localStorage held. */
export async function fresh(page: Page) {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await settle(page);
}
