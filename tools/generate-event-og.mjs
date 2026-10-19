#!/usr/bin/env node
/**
 * Share cards (1200×630 PNG) for every event, written to public/og/events/<slug>.png.
 * Social crawlers do not run JavaScript, so each event page and each /present/<slug> share
 * page points its og:image at one of these static files. Re-run after adding or renaming events:
 *
 *   node tools/generate-event-og.mjs [slug ...]
 *
 * Environment:
 *   PLAYWRIGHT_MODULE_PATH    an existing Playwright install (default "playwright")
 *   CHROMIUM_EXECUTABLE_PATH  optional browser binary
 *
 * The cards are committed (palette PNGs, about 40 KB each) rather than built in CI so a deploy never depends on a browser.
 * Fonts come from Google Fonts while generating; the PNGs themselves load nothing.
 */
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH || "playwright");
// sharp (already in the dependency tree via Next) quantises each card to a palette PNG, ~40 KB instead of ~140 KB.
const sharp = await import("sharp").then((m) => m.default).catch(() => null);
const root = new URL("../", import.meta.url);
const outDir = new URL("public/og/events/", root);

// Mirrors lib/palette.ts and lib/event-schema.ts (kept in step by tests/og-images.test.mjs).
const categoryColors = { origins: "#ff9b42", protocol: "#72d9ff", mining: "#ffd166", adoption: "#7ee2a8", infrastructure: "#b8a3ff", finance: "#f3a6ca", policy: "#87a7ff", crisis: "#ff746c" };
const categoryLabels = { origins: "Origins & culture", protocol: "Protocol & scaling", mining: "Mining & supply", adoption: "Payments & adoption", infrastructure: "Companies & infrastructure", finance: "Markets & finance", policy: "Law & sovereign policy", crisis: "Crises & controversy" };

function formatDate({ date, precision }) {
  const d = new Date(`${date}T00:00:00Z`);
  if (precision === "year") return String(d.getUTCFullYear());
  if (precision === "month") return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
const formatRange = (e) => e.endDate ? `${formatDate(e)} – ${formatDate({ date: e.endDate, precision: e.precision })}` : formatDate(e);

const events = [];
for (const name of ["prehistory", "early", "late"]) events.push(...JSON.parse(await readFile(new URL(`content/events-${name}.json`, root), "utf8")));
const only = process.argv.slice(2);
const selected = only.length ? events.filter((e) => only.includes(e.slug)) : events;

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@125,800&family=Geist:wght@500;700&family=Geist+Mono:wght@500&display=block" rel="stylesheet">
<style>
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;overflow:hidden;background:#07080b;color:#f3ead8;font-family:Geist,sans-serif;position:relative}
.glow{position:absolute;width:900px;height:900px;right:-380px;top:-420px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 30%,transparent),transparent 62%)}
.grid{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:45px 45px;-webkit-mask-image:radial-gradient(ellipse at 85% 20%,#000 5%,transparent 65%)}
.rail{position:absolute;left:0;right:0;bottom:0;height:8px;background:linear-gradient(90deg,#f7931a,#ff9b42 55%,var(--accent))}
.wrap{position:absolute;inset:64px 80px 70px;display:flex;flex-direction:column}
.brand{font:800 30px/1 Archivo;font-stretch:125%;letter-spacing:.04em;text-transform:uppercase}
.brand b{color:#f08a24;font-weight:800}
.brand-rule{width:120px;height:3px;margin-top:16px;background:linear-gradient(90deg,#f08a24,transparent)}
.meta{display:flex;gap:18px;align-items:center;margin-top:auto;font:500 26px 'Geist Mono',monospace;color:#c9c1b2}
.chip{padding:7px 16px;border-radius:99px;font:700 21px Geist;color:var(--accent);background:color-mix(in srgb,var(--accent) 15%,transparent);border:1px solid color-mix(in srgb,var(--accent) 40%,transparent)}
h1{font:700 var(--size,64px)/1.08 Geist;letter-spacing:-.025em;margin-top:22px;max-width:1040px;text-wrap:balance}
.url{margin-top:auto;font:500 22px 'Geist Mono',monospace;color:#8f887c;letter-spacing:.02em}
</style></head><body>
<div class=glow></div><div class=grid></div>
<div class=wrap>
  <div class=brand>Bitcoin <b>Timechain</b></div><div class=brand-rule></div>
  <div class=meta><span id=date></span><span class=chip id=cat></span></div>
  <h1 id=title></h1>
  <div class=url>kkarasavvas.com/bitcoin-history</div>
</div><div class=rail></div></body></html>`;

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE_PATH });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await mkdir(outDir, { recursive: true });
if (!only.length) for (const f of await readdir(outDir)) if (f.endsWith(".png")) await rm(new URL(f, outDir));

for (const event of selected) {
  await page.evaluate(({ title, date, cat, color }) => {
    document.body.style.setProperty("--accent", color);
    document.getElementById("date").textContent = date;
    document.getElementById("cat").textContent = cat;
    const h = document.getElementById("title");
    h.textContent = title;
    // Shrink long titles until they fit in three lines.
    for (const size of [68, 62, 56, 50, 46, 42]) {
      h.style.setProperty("--size", `${size}px`);
      if (h.getBoundingClientRect().height <= size * 1.08 * 3 + 2) break;
    }
  }, { title: event.title, date: formatRange(event), cat: categoryLabels[event.category], color: categoryColors[event.category] });
  const shot = await page.screenshot({ type: "png" });
  const png = sharp ? await sharp(shot).png({ palette: true, quality: 85, effort: 10, compressionLevel: 9 }).toBuffer() : shot;
  await writeFile(new URL(`${event.slug}.png`, outDir), png);
}
await browser.close();
console.log(`Wrote ${selected.length} share card(s) to public/og/events/.`);
