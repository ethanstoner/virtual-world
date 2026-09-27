import { expect, test } from "@playwright/test";
import { fresh, handle, state, toClient } from "./helpers";

// Real touch input through Chrome DevTools, so the browser generates its own pointer events.
test.beforeEach(async ({ page }) => fresh(page));

async function touchInput(page: import("@playwright/test").Page) {
  const cdp = await page.context().newCDPSession(page);
  return (type: string, points: [number, number][]) =>
    cdp.send("Input.dispatchTouchEvent", {
      type: type as "touchStart",
      touchPoints: points.map(([x, y], id) => ({ x, y, id })),
    });
}

test("the hint shows touch instructions", async ({ page }) => {
  await expect(page.locator(".hint .touch")).toBeVisible();
  await expect(page.locator(".hint .mouse")).toBeHidden();
});

test("tap the track to add a handle", async ({ page }) => {
  const touch = await touchInput(page);
  const [x, y] = await toClient(page, 520, 175);
  await touch("touchStart", [[x, y]]);
  await touch("touchEnd", []);
  const s = await state(page);
  expect(s.handles).toBe(13);
  expect(s.canUndo).toBe(true);
});

test("drag a handle to move it", async ({ page }) => {
  const touch = await touchInput(page);
  const before = await page.evaluate(() => ({ ...(window as any).__editor.track.controls[5] }));
  const [x, y] = await handle(page, 5);
  await touch("touchStart", [[x, y]]);
  for (let i = 1; i <= 8; i++) await touch("touchMove", [[x - i * 3, y + i * 2]]);
  await touch("touchEnd", []);
  const after = await page.evaluate(() => ({ ...(window as any).__editor.track.controls[5] }));
  expect(after.x).toBeLessThan(before.x - 20);
  expect(after.y).toBeGreaterThan(before.y + 20);
  expect((await state(page)).handles).toBe(12);
});

test("long-press a handle to delete it", async ({ page }) => {
  const touch = await touchInput(page);
  const [x, y] = await handle(page, 3);
  await touch("touchStart", [[x, y]]);
  await page.waitForTimeout(800);
  await touch("touchEnd", []);
  expect((await state(page)).handles).toBe(11);
});

test("one finger on open ground pans without adding anything", async ({ page }) => {
  const touch = await touchInput(page);
  const before = await state(page);
  const [x, y] = await toClient(page, 60, 60);
  await touch("touchStart", [[x, y]]);
  for (let i = 1; i <= 6; i++) await touch("touchMove", [[x + i * 10, y + i * 5]]);
  await touch("touchEnd", []);
  const after = await state(page);
  expect(after.offset[0]).not.toBeCloseTo(before.offset[0], 0);
  expect(after.handles).toBe(12);
});

test("pinch zooms", async ({ page }) => {
  const touch = await touchInput(page);
  const before = await state(page);
  await touch("touchStart", [[150, 400], [240, 400]]);
  for (let i = 1; i <= 6; i++) await touch("touchMove", [[150 - i * 10, 400], [240 + i * 10, 400]]);
  await touch("touchEnd", []);
  const after = await state(page);
  expect(after.zoom).toBeGreaterThan(before.zoom * 1.5);
  expect(after.handles).toBe(12);
});
