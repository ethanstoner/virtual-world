import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { fresh, handle, settle, state, toClient } from "./helpers";

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await fresh(page);
});

test.afterEach(() => expect(errors, "uncaught errors in the page").toEqual([]));

test("the template passes every check and can be exported", async ({ page }) => {
  const s = await state(page);
  expect(s.handles).toBe(12);
  expect(s.checks).toEqual(["ok", "ok", "ok", "ok"]);
  expect(s.exportDisabled).toBe(false);
  expect(s.radius).toBeCloseTo(76.23, 1);
});

test("click inserts a handle, a bad drag blocks export, undo and redo restore it", async ({ page }) => {
  await page.mouse.click(...(await toClient(page, 520, 175)));
  expect((await state(page)).handles).toBe(13);

  const [hx, hy] = await handle(page, 7);
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  await page.mouse.move(hx - 250, hy, { steps: 10 });
  await page.mouse.up();
  const bad = await state(page);
  expect(bad.exportDisabled).toBe(true);
  expect(bad.checks).toContain("error");

  await page.mouse.move(5, 880);
  await page.keyboard.press("Control+z");
  const undone = await state(page);
  expect(undone.exportDisabled).toBe(false);
  expect(undone.handles).toBe(13);
  await page.keyboard.press("Control+z");
  expect((await state(page)).handles).toBe(12);
  await page.keyboard.press("Control+y");
  expect((await state(page)).handles).toBe(13);
});

test("right-click deletes a handle, but never below four", async ({ page }) => {
  for (let n = 12; n > 4; n--) {
    const [x, y] = await handle(page, 1);
    await page.mouse.move(x, y);
    await page.mouse.click(x, y, { button: "right" });
    expect((await state(page)).handles).toBe(n - 1);
  }
  const [x, y] = await handle(page, 1);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y, { button: "right" });
  expect((await state(page)).handles).toBe(4);
});

test("the wheel zooms around the cursor and shift-drag pans", async ({ page }) => {
  const before = await state(page);
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, -300);
  const zoomed = await state(page);
  expect(zoomed.zoom).toBeGreaterThan(before.zoom);
  await page.keyboard.down("Shift");
  await page.mouse.move(700, 450);
  await page.mouse.down();
  await page.mouse.move(800, 500, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up("Shift");
  const panned = await state(page);
  expect(panned.offset[0]).toBeGreaterThan(zoomed.offset[0]);
  expect(panned.handles).toBe(12);
});

test("export writes a track file whose numbers match the panel", async ({ page }) => {
  await page.fill("#name", "e2e export");
  const s = await state(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.click("#export")]);
  expect(download.suggestedFilename()).toBe("e2e-export.track.json");
  const path = test.info().outputPath("e2e-export.track.json");
  await download.saveAs(path);
  const file = JSON.parse(readFileSync(path, "utf8"));
  expect(file.format).toBe("neuroracer-track");
  expect(file.control_points).toHaveLength(12);
  expect(file.metrics.tightest_radius).toBeCloseTo(s.radius, 2);
  expect(file.metrics.self_approach).toBeCloseTo(s.approach, 2);
});

test("a NeuroRacer-written file opens exactly, and editing switches to the spline", async ({ page }) => {
  const text = readFileSync("tests/fixtures/gen7-002.track.json", "utf8");
  await page.evaluate((t) => (window as any).__editor.openText(t), text);
  const opened = await state(page);
  expect(opened.imported).toBe(true);
  expect(opened.radius).toBeCloseTo(JSON.parse(text).metrics.tightest_radius, 2);
  await expect(page.locator("#imported")).toBeVisible();

  const [x, y] = await handle(page, 5);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 10, y, { steps: 3 });
  await page.mouse.up();
  expect((await state(page)).imported).toBe(false);
  await expect(page.locator("#imported")).toBeHidden();

  await page.keyboard.press("Control+z");
  expect((await state(page)).imported).toBe(true);
});

test("a bad file shows an error and leaves the track alone", async ({ page }) => {
  await page.evaluate(() => (window as any).__editor.openText('{"format":"gpx"}'));
  await expect(page.locator(".toast.error")).toHaveText("Not a NeuroRacer track file");
  expect((await state(page)).handles).toBe(12);
});

test("work survives a reload", async ({ page }) => {
  await page.mouse.click(...(await toClient(page, 520, 175)));
  await page.fill("#name", "kept");
  await settle(page);
  await page.reload();
  const s = await state(page);
  expect(s.handles).toBe(13);
  await expect(page.locator("#name")).toHaveValue("kept");
});
