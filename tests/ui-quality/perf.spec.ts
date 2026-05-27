import { expect, test } from "@playwright/test";
import { collectPageErrors, prepareSurface, surfaces } from "./fixtures.js";

for (const surface of surfaces) {
  test(`${surface.name} built surface stays within smoke performance thresholds`, async ({
    page,
  }) => {
    const errors = collectPageErrors(page);
    await prepareSurface(page, surface);
    await page.goto(surface.url, { waitUntil: "load" });
    await expect(page.getByRole("heading", { name: surface.heading })).toBeVisible();

    const timing = await page.evaluate(() => {
      const [navigation] = performance.getEntriesByType(
        "navigation"
      ) as PerformanceNavigationTiming[];

      return {
        domContentLoadedMs: navigation.domContentLoadedEventEnd,
        loadMs: navigation.loadEventEnd,
      };
    });

    expect(timing.domContentLoadedMs).toBeLessThanOrEqual(surface.thresholds.domContentLoadedMs);
    expect(timing.loadMs).toBeLessThanOrEqual(surface.thresholds.loadMs);
    expect(errors).toEqual([]);
  });
}
