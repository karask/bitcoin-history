import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
// Keep software WebGL inexpensive enough to test the entire trip, not the slow-device fallback.
const page = await browser.newPage({ viewport: { width: 800, height: 600 }, reducedMotion: "reduce" });
const errors = [];
page.on("pageerror", e => errors.push(e.message));
await page.addInitScript(() => {
  const NativeContext = window.AudioContext;
  window.AudioContext = class extends NativeContext {
    constructor(...args) {
      super(...args);
      window.__audioTestContext = this;
      const analyser = this.createAnalyser(); analyser.fftSize = 2048;
      window.__audioTestAnalyser = analyser;
      const createGain = this.createGain.bind(this);
      this.createGain = () => {
        const gain = createGain(), connect = gain.connect.bind(gain);
        gain.connect = (destination, ...rest) => {
          if (destination === this.destination) connect(analyser);
          return connect(destination, ...rest);
        };
        return gain;
      };
    }
  };
});
try {
  await page.goto(`${process.env.RIDE_TEST_URL || "http://localhost:3000"}/present?event=bitcoin-pizza-purchase`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Enter the Timechain/ }).click();
  await page.locator("canvas.ride-canvas").waitFor();
  assert.deepEqual(await page.locator(".mode-control button").allTextContents().then(a => a.map(s => s.trim())), ["RIDE", "READER"]);
  assert.equal(await page.getByRole("button", { name: "RIDE", exact: true }).getAttribute("aria-pressed"), "true", "Ride must default even with reduced-motion preference");
  await page.getByRole("button", { name: "Pause presentation", exact: true }).click();
  await page.getByRole("button", { name: "READER", exact: true }).click();
  await page.locator(".mode-reader canvas.rail-canvas").waitFor();
  assert.equal(await page.locator(".reader-backdrop").count(), 0, "renamed Reader must display the old Rail canvas, not an opaque backdrop");
  await page.getByRole("button", { name: "RIDE", exact: true }).click();
  await page.locator("canvas.ride-canvas").waitFor();
  await page.getByRole("button", { name: "Turn ambient sound on", exact: true }).click();
  await page.getByRole("button", { name: "Turn ambient sound off", exact: true }).waitFor();
  const rms = await page.waitForFunction(() => {
    const context = window.__audioTestContext, analyser = window.__audioTestAnalyser;
    if (!context || context.state !== "running" || !analyser) return false;
    const values = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(values);
    const rms = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
    return rms > 0.005 ? rms : false;
  });
  console.log("Real Web Audio output RMS:", await rms.jsonValue());
  await page.locator(".audio-settings summary").click();
  await page.getByRole("button", { name: "Test sound", exact: true }).click();
  await page.getByRole("button", { name: "Turn ambient sound off", exact: true }).click();
  await page.waitForFunction(() => {
    const values = new Float32Array(2048); window.__audioTestAnalyser.getFloatTimeDomainData(values);
    return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length) < 0.001;
  });
  await page.locator(".audio-settings summary").click();
  await page.getByRole("button", { name: "Next chapter", exact: true }).click();
  await page.evaluate(() => {
    window.__motionSamples = [];
    window.__motionSampleTimer = setInterval(() => { if (window.__rideDebug) window.__motionSamples.push(window.__rideDebug()); }, 250);
  });
  await page.locator(".is-travelling").waitFor();
  await page.waitForFunction(() => { const s = window.__rideDebug?.(); return s && !s.arrived && s.velocity > 5 && s.phase === "departing"; });
  const from = await page.evaluate(() => window.__rideDebug().u);
  await page.waitForFunction(u => { const s = window.__rideDebug?.(); return s && s.u > u && s.phase === "braking"; }, from, { timeout: 45000 });
  await page.locator(".is-arrived").waitFor();
  assert.deepEqual(errors, []);
  console.log("Controls passed: default Ride, two modes, renamed Reader, real non-silent audio/mute, animated departure and braking with reduced-motion preference.");
} catch (error) {
  console.error("Motion samples:", await page.evaluate(() => window.__motionSamples));
  console.error("Final UI:", await page.locator("body").innerText());
  console.error("Browser errors:", errors);
  throw error;
} finally { await browser.close(); }
