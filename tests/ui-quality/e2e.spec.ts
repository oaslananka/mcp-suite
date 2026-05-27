import { expect, test } from "@playwright/test";
import { collectPageErrors, getSurface, prepareSurface } from "./fixtures.js";

test("Atlas supports search, detail, and submission flows", async ({ page }) => {
  const atlas = getSurface("atlas");

  const errors = collectPageErrors(page);
  await prepareSurface(page, atlas);
  await page.goto(atlas.url);

  await expect(page.getByRole("heading", { name: atlas.heading })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search the registry" }).fill("browser");
  await expect(page.getByRole("heading", { name: "Browser MCP" }).first()).toBeVisible();
  await page
    .getByRole("article")
    .filter({ hasText: "Browser MCP" })
    .first()
    .getByRole("button", { name: "View details" })
    .click();
  await expect(page.getByRole("heading", { name: "Browser MCP" })).toBeVisible();
  await expect(page.getByText("@playwright/mcp", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back to catalog" }).click();
  await page.getByRole("button", { name: "Submit a server" }).click();
  await page.getByLabel("Name").fill("Hosted Docs MCP");
  await page.getByLabel("npm package").fill("@example/hosted-docs-mcp");
  await page.getByLabel("Description").fill("Expose hosted documentation to MCP clients.");
  await page.getByLabel("Homepage").fill("https://github.com/example/hosted-docs-mcp");
  await page.getByLabel("Tags").fill("docs, search");
  await page.getByRole("button", { name: "Create submission" }).click();

  await expect(page.getByText("Submission created for Hosted Docs MCP.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Observatory supports dashboard, traces, and anomalies navigation", async ({ page }) => {
  const observatory = getSurface("observatory");

  const errors = collectPageErrors(page);
  await prepareSurface(page, observatory);
  await page.goto(observatory.url);

  await expect(page.getByRole("heading", { name: observatory.heading })).toBeVisible();
  await expect(page.getByText("243ms")).toBeVisible();

  await page.getByRole("button", { name: "Traces" }).click();
  await expect(page.getByRole("heading", { name: "Newest spans" })).toBeVisible();
  await expect(page.getByText("tools/list")).toBeVisible();

  await page.getByRole("button", { name: "Anomalies" }).click();
  await expect(page.getByRole("heading", { name: "Signal spikes" })).toBeVisible();
  await expect(page.getByText("Latency spike")).toBeVisible();
  expect(errors).toEqual([]);
});

test("Lab connects to a mocked MCP server and renders tool contracts", async ({ page }) => {
  const lab = getSurface("lab");

  const errors = collectPageErrors(page);
  await prepareSurface(page, lab);
  await page.goto(lab.url);

  await expect(page.getByRole("heading", { name: lab.heading })).toBeVisible();
  await page.getByLabel("Display name").fill("Browser Test Server");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("Connected").first()).toBeVisible();
  await expect(page.getByText("Browser Test Server").first()).toBeVisible();

  await page.getByRole("link", { name: "Tools" }).click();
  await expect(page.getByRole("heading", { exact: true, name: "Tools" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "list_tools" })).toBeVisible();
  await expect(page.getByText("Return available tool contracts.").last()).toBeVisible();
  expect(errors).toEqual([]);
});
