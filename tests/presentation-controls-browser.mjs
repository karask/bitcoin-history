import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
// RIDE_TEST_GL=gpu runs on the real GPU. Software GL is the default for CI-like machines,
// but on the current scenery it can be slow enough for the ride's watchdog to hand over to
// the Reader, and then the motion checks below have nothing to measure.
const glArgs = process.env.RIDE_TEST_GL === "gpu"
  ? ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=gl"]
  : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: glArgs });
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
  // Everything except play, pause and seek lives in one settings sheet.
  await page.getByRole("button", { name: "Pause presentation", exact: true }).click();
  const settings = page.getByRole("button", { name: "Ride settings", exact: true });
  await settings.click();
  const sheet = page.getByRole("dialog", { name: "Ride settings" });
  assert.deepEqual(await sheet.getByRole("group", { name: "Display" }).getByRole("button").allTextContents(), ["3D ride", "2D reader"]);
  assert.equal(await sheet.getByRole("button", { name: "3D ride", exact: true }).getAttribute("aria-pressed"), "true", "Ride must default even with reduced-motion preference");
  await sheet.getByRole("button", { name: "2D reader", exact: true }).click();
  await page.locator(".mode-reader canvas.rail-canvas").waitFor();
  assert.equal(await page.locator(".reader-backdrop").count(), 0, "renamed Reader must display the old Rail canvas, not an opaque backdrop");
  await sheet.getByRole("button", { name: "3D ride", exact: true }).click();
  await page.locator("canvas.ride-canvas").waitFor();
  const sound = sheet.getByRole("switch", { name: "Sound" });
  assert.equal(await sound.getAttribute("aria-checked"), "false", "sound starts off");
  await sound.click();
  await page.waitForFunction(() => document.querySelector('[role="switch"][aria-labelledby$="-sound"]')?.getAttribute("aria-checked") === "true");
  const rms = await page.waitForFunction(() => {
    const context = window.__audioTestContext, analyser = window.__audioTestAnalyser;
    if (!context || context.state !== "running" || !analyser) return false;
    const values = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(values);
    const rms = Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length);
    return rms > 0.005 ? rms : false;
  });
  console.log("Real Web Audio output RMS:", await rms.jsonValue());
  await sheet.getByRole("button", { name: "Test sound", exact: true }).click();
  await sound.click();
  await page.waitForFunction(() => {
    const values = new Float32Array(2048); window.__audioTestAnalyser.getFloatTimeDomainData(values);
    return Math.sqrt(values.reduce((sum, v) => sum + v * v, 0) / values.length) < 0.001;
  });
  // Escape closes the sheet, not the ride.
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached" });
  assert.match(page.url(), /\/present/, "Escape with the sheet open must not exit the ride");
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
  // Left alone while the train moves, the controls step aside; any input brings them back.
  await page.waitForFunction(() => document.querySelector(".presentation-shell")?.classList.contains("is-arrived"));
  await page.getByRole("button", { name: "Play presentation", exact: true }).click();
  await page.mouse.move(5, 5);
  await page.waitForFunction(() => document.querySelector(".presentation-shell")?.classList.contains("chrome-hidden"), null, { timeout: 45000 });
  await page.mouse.move(40, 40);
  await page.waitForFunction(() => !document.querySelector(".presentation-shell")?.classList.contains("chrome-hidden"));
  console.log("Controls passed: default Ride, settings sheet modes, renamed Reader, real non-silent audio/mute, Escape closes the sheet first, animated departure and braking with reduced-motion preference, controls hide while travelling.");
} catch (error) {
  console.error("Motion samples:", await page.evaluate(() => window.__motionSamples));
  console.error("Final UI:", await page.locator("body").innerText());
  console.error("Browser errors:", errors);
  throw error;
} finally { await browser.close(); }
