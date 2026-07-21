import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { prepareSurface, surfaces } from "./fixtures.js";

for (const surface of surfaces) {
  test(`${surface.name} home page has no automated accessibility violations`, async ({ page }) => {
    await prepareSurface(page, surface);
    await page.goto(surface.url);
    await expect(page.getByRole("heading", { name: surface.heading })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations).toEqual([]);
  });
}
