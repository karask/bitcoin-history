// Bounded, real-time WebGL regression against the retained local development server.
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on("pageerror", error => errors.push(error.message));
try {
  await page.goto(`${process.env.RIDE_TEST_URL || "http://localhost:3000"}/present?event=bitcoin-2017-cycle-high`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Enter the Timechain/ }).click();
  await page.locator("canvas.ride-canvas").waitFor();
  await page.getByRole("button", { name: "Pause presentation", exact: true }).click();
  await page.getByRole("button", { name: "Front seat", exact: true }).click();
  await page.waitForFunction(() => window.__rideDebug?.() && !window.__rideDebug().transitioning);
  const before = await page.evaluate(() => window.__rideDebug());
  // A two-chapter seek used to immediately teleport hundreds of rail units ahead.
  await page.locator(".progress-range").fill("22");
  await page.waitForFunction(d => window.__rideDebug?.().targetDistance > d + 10, before.distance);
  const after = await page.evaluate(() => window.__rideDebug());
  assert.ok(after.distance - before.distance < 15, "a distant chapter must retarget, not teleport");
  assert.equal(after.arrived, false);
  await page.evaluate(() => {
    window.__smoothSamples = [];
    const sample = () => {
      const s = window.__rideDebug?.();
      if (s) window.__smoothSamples.push({ ...s, now: performance.now() });
      window.__smoothSampleFrame = requestAnimationFrame(sample);
    };
    sample();
  });
  await page.waitForFunction(() => window.__smoothSamples.length >= 270, null, { timeout: 90000 });
  const samples = await page.evaluate(() => { cancelAnimationFrame(window.__smoothSampleFrame); return window.__smoothSamples; });
  let peakStep = 0, peakRotation = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    assert.ok(b.distance >= a.distance, "ride must not reverse unexpectedly");
    assert.ok(Math.hypot(...b.camera.map((v, j) => v - b.seat[j])) < 1e-7, "seat must stay on rail rather than lag/catch up");
    const step = Math.hypot(...b.camera.map((v, j) => v - a.camera[j]));
    peakStep = Math.max(peakStep, step);
    assert.ok(step <= b.distance - a.distance + 0.15, "no vertical or forward camera jump beyond physical travel");
    const dot = Math.abs(a.rotation.reduce((sum, v, j) => sum + v * b.rotation[j], 0));
    const angle = 2 * Math.acos(Math.min(1, dot)); peakRotation = Math.max(peakRotation, angle);
    assert.ok(angle < 0.12, "no sudden pitch/yaw change");
  }
  assert.ok(samples.at(-1).distance > samples[0].distance + 10, "test must actually move along the track");
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ frames: samples.length, startDate: samples[0].date, endDate: samples.at(-1).date,
    peakWorldStep: peakStep, peakRotationDegrees: peakRotation * 180 / Math.PI, errors }));
  console.log("Real-time smoothness checks passed: continuous distant seek, rail-locked seat, bounded camera movement and pitch.");
} catch (error) {
  console.error("UI:", await page.locator("body").innerText());
  console.error("Errors:", errors); throw error;
} finally { await browser.close(); }
