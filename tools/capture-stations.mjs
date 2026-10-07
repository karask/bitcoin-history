#!/usr/bin/env node
/**
 * Reproducible captures for before/after visual review.
 *
 *   node tools/capture-stations.mjs capture <outDir> [--clean] [--setlist=id] [--viewport=1440x900] [slug ...]
 *   node tools/capture-stations.mjs pages   <outDir> [--full] [--viewport=1440x900] [/path ...]
 *   node tools/capture-stations.mjs compare <beforeDir> <afterDir> <out.png> [--title=text]
 *
 * `capture` opens the ride at each station, pauses, lets the exhibit framing settle and
 * screenshots it. `--clean` hides the HUD so the scenery itself is what gets compared.
 * `pages` screenshots ordinary site routes. `compare` pairs files with the same name from
 * two capture runs into one labelled side-by-side sheet.
 *
 * Environment:
 *   RIDE_URL                  site origin (default http://localhost:3000)
 *   PLAYWRIGHT_MODULE_PATH    an existing Playwright install (default "playwright")
 *   CHROMIUM_EXECUTABLE_PATH  optional browser binary
 *   CAPTURE_MAX_FRAME_MS      refuse ride captures slower than this (default 30)
 *
 * Capture on a real GPU. Under software GL the ride's quality watchdog turns shadows off,
 * and a "before" and "after" taken at different quality levels are not comparable — which
 * is why slow frames abort the run instead of producing a misleading image.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");

const [command, ...rest] = process.argv.slice(2);
const flags = Object.fromEntries(rest.filter((a) => a.startsWith("--")).map((a) => {
  const [key, value] = a.slice(2).split("=");
  return [key, value ?? true];
}));
const positional = rest.filter((a) => !a.startsWith("--"));
const BASE = (process.env.RIDE_URL || "http://localhost:3000").replace(/\/$/, "");
const MAX_FRAME_MS = Number(process.env.CAPTURE_MAX_FRAME_MS || 30);
const [width, height] = String(flags.viewport || "1440x900").split("x").map(Number);

/** A spread of exhibit families, used when no slugs are given. */
const DEFAULT_STATIONS = [
  "bitcoin-white-paper-announced",
  "bitcoin-pizza-purchase",
  "mt-gox-bitcoin-exchange-launches",
  "first-bitcoin-halving",
  "mt-gox-files-for-bankruptcy",
  "bitcoin-cash-fork",
  "us-spot-bitcoin-etps-start-trading",
  "bitcoin-2025-all-time-high",
];

const HUD = ".presentation-chrome, .presentation-controls, .presentation-stage, .ride-hud, .keyboard-hint";

async function launch() {
  return chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ["--enable-gpu", "--ignore-gpu-blocklist", "--use-angle=gl"],
  });
}

async function captureStations(outDir, slugs) {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const setlist = flags.setlist || "grand-tour";
  const report = [];
  try {
    for (const slug of slugs.length ? slugs : DEFAULT_STATIONS) {
      await page.goto(`${BASE}/present?setlist=${setlist}&event=${slug}`, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: /Enter the Timechain/ }).click();
      await page.locator("canvas.ride-canvas").waitFor({ timeout: 30_000 });
      const pause = page.getByRole("button", { name: "Pause presentation", exact: true });
      if (await pause.count()) await pause.click();
      await page.getByText("AT THE EXHIBIT", { exact: false }).waitFor({ timeout: 30_000 });
      // Let the exhibit framing and the eased camera come to rest.
      await page.waitForTimeout(2500);
      if (flags.clean) {
        await page.addStyleTag({ content: `${HUD} { visibility: hidden !important; } .presentation-vignette { display: none !important; }` });
        await page.waitForTimeout(250);
      }
      const info = await page.evaluate(() => {
        const gl = document.createElement("canvas").getContext("webgl2");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        const debug = window.__rideDebug?.() ?? {};
        return { renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown", frameTime: debug.frameTime, arrived: debug.arrived };
      });
      if (!(info.frameTime <= MAX_FRAME_MS)) {
        throw new Error(`${slug}: ${Number(info.frameTime).toFixed(1)}ms per frame exceeds ${MAX_FRAME_MS}ms; quality may have dropped. Capture on a GPU, or raise CAPTURE_MAX_FRAME_MS deliberately.`);
      }
      const file = join(outDir, `${slug}${flags.clean ? "-clean" : ""}.png`);
      await page.screenshot({ path: file });
      report.push({ slug, file, ...info });
      console.log(`${slug.padEnd(44)} ${info.frameTime.toFixed(1)}ms  ${info.renderer}`);
    }
  } finally {
    await writeFile(join(outDir, "report.json"), JSON.stringify({ base: BASE, viewport: [width, height], report, errors }, null, 2));
    await browser.close();
  }
  if (errors.length) console.warn("page errors:", errors.slice(0, 5));
}

async function capturePages(outDir, paths) {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  try {
    for (const path of paths.length ? paths : ["/"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(600);
      const name = (path.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9]+/gi, "-") || "home") + `-${width}x${height}`;
      await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: Boolean(flags.full) });
      console.log(`${path.padEnd(44)} → ${name}.png`);
    }
  } finally {
    await browser.close();
  }
}

async function compare(beforeDir, afterDir, out) {
  const names = (await readdir(beforeDir)).filter((n) => n.endsWith(".png"));
  const afterNames = new Set((await readdir(afterDir)).filter((n) => n.endsWith(".png")));
  const pairs = names.filter((n) => afterNames.has(n));
  if (!pairs.length) throw new Error("No matching PNG names between the two directories.");
  const uri = async (p) => `data:image/png;base64,${(await readFile(p)).toString("base64")}`;
  const rows = await Promise.all(pairs.map(async (n) => `
    <section><h2>${basename(n, ".png")}</h2><div class="pair">
      <figure><figcaption>BEFORE</figcaption><img src="${await uri(join(beforeDir, n))}"></figure>
      <figure><figcaption class="after">AFTER</figcaption><img src="${await uri(join(afterDir, n))}"></figure>
    </div></section>`));
  const title = typeof flags.title === "string" ? flags.title : "Before / after";
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#0b0b0d;color:#ece7dd;font:14px system-ui,sans-serif}
    h1{margin:0 0 18px;font:600 16px ui-monospace,monospace;letter-spacing:.1em;color:#ff9b42}
    section{margin-bottom:26px} h2{margin:0 0 8px;font:500 13px ui-monospace,monospace;color:#a59e93}
    .pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    figure{margin:0;border:1px solid #2b2b2f;border-radius:6px;overflow:hidden;background:#141416}
    img{display:block;width:100%}
    /* Labels sit above the image so they never cover what is being compared. */
    figcaption{padding:7px 10px;border-bottom:1px solid #2b2b2f;font:600 11px ui-monospace,monospace;letter-spacing:.12em;color:#a59e93}
    figcaption.after{color:#7ee2a8}
  </style><h1>${title}</h1>${rows.join("")}`;
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.screenshot({ path: out, fullPage: true });
  } finally {
    await browser.close();
  }
  console.log(`${pairs.length} pair(s) → ${out}`);
}

const commands = {
  capture: () => captureStations(positional[0] || "captures", positional.slice(1)),
  pages: () => capturePages(positional[0] || "captures", positional.slice(1)),
  compare: () => compare(positional[0], positional[1], positional[2] || "comparison.png"),
};
if (!commands[command]) {
  console.error("usage: capture-stations.mjs capture|pages|compare … (see the header comment)");
  process.exit(2);
}
await commands[command]();
