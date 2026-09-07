// Optional visual smoke test; run against the retained local server.
// PLAYWRIGHT_MODULE_PATH can point to an already-installed bundled Playwright.
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const base = process.env.RIDE_TEST_URL || "http://100.96.113.72:3000";
const out = new URL("../artifacts/ride-qa/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error" && !message.text().includes("favicon")) errors.push(message.text()); });
async function exhibit(slug, name, setlist = "grand-tour") {
  await page.goto(`${base}/present?setlist=${setlist}&event=${slug}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Enter the Timechain/ }).click();
  await page.locator("canvas.ride-canvas").waitFor();
  await page.getByRole("button", { name: "Pause presentation", exact: true }).click();
  await page.getByText("AT THE EXHIBIT", { exact: false }).waitFor();
  // A bounded render settling check, not a synthetic screenshot or a static mock.
  await page.waitForFunction(() => document.querySelector("canvas.ride-canvas")?.width > 100);
  await page.screenshot({ path: new URL(`${name}.png`, out).pathname });
  assert.equal(await page.locator(".mode-ride canvas").count(), 1, "3D must not silently fall back");
}
try {
  await exhibit("bitcoin-pizza-purchase", "pizza-desktop");
  await page.getByRole("button", { name: /Read the story/ }).click();
  assert.equal(await page.locator("dialog[open]").count(), 1);
  const chapter = await page.locator(".chapter-readout").innerText();
  await page.keyboard.press("ArrowRight");
  assert.equal(await page.locator(".chapter-readout").innerText(), chapter, "modal must isolate transport keys");
  assert.ok(await page.locator("dialog a").count() > 0);
  await page.screenshot({ path: new URL("story-sources.png", out).pathname });
  await page.getByRole("button", { name: "Close historical record" }).click();
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await page.locator(".is-travelling").waitFor();
  await page.getByRole("button", { name: "Play presentation", exact: true }).click();
  await page.getByRole("button", { name: "Pause presentation", exact: true }).click();
  const pausedU = await page.evaluate(() => window.__rideDebug().u);
  await page.getByRole("button", { name: "Front seat", exact: true }).click();
  await page.screenshot({ path: new URL("front-seat.png", out).pathname });
  assert.equal(await page.evaluate(() => window.__rideDebug().u), pausedU, "pausing preserves actual train position, even before price data");
  await page.getByRole("button", { name: "Overhead", exact: true }).click();
  await page.screenshot({ path: new URL("overhead.png", out).pathname });
  await exhibit("el-salvador-bitcoin-law-effective", "policy-desktop");
  await exhibit("fourth-bitcoin-halving", "mining-desktop");
  await exhibit("bitcoin-all-time-high-november-2021", "market-peak", "boom-and-bust");
  await page.getByRole("button", { name: "Front seat", exact: true }).click();
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await page.waitForFunction(() => { const state = window.__rideDebug?.(); return state && !state.arrived && state.grade < -0.04 && state.velocity > 5; }, { timeout: 30000 });
  await page.screenshot({ path: new URL("bear-market-descent.png", out).pathname });
  await page.setViewportSize({ width: 390, height: 844 });
  await exhibit("bitcoin-pizza-purchase", "pizza-mobile");
  assert.ok(await page.getByRole("button", { name: "Front seat", exact: true }).isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, "no mobile horizontal overflow");
  await page.getByRole("button", { name: /Read the story/ }).click();
  await page.screenshot({ path: new URL("story-mobile.png", out).pathname });
  await page.getByRole("button", { name: "Close historical record" }).click();
  assert.deepEqual(errors, [], "browser console must be clean");
  console.log("Ride browser checks passed: real WebGL, desktop/mobile, sources, pause, camera controls and modal keyboard isolation.");
} catch (error) {
  console.error("Browser errors:", errors);
  console.error("Visible state:", await page.locator("body").innerText());
  await page.screenshot({ path: new URL("failure.png", out).pathname }).catch(() => {});
  throw error;
} finally { await browser.close(); }
